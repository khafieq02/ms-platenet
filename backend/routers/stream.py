"""
MS-PlateNet - WebSocket Streaming Router
Smooth 30fps even during detection.

Architecture:
  Thread 1 (YOLO thread):  runs every frame — detects bbox, very fast ~10ms
  Thread 2 (OCR thread):   runs in background — reads plate text, slow ~100-300ms
  Main loop:               receives frames, returns results immediately from YOLO
                           OCR result is "carried over" from last successful read

This means:
  - Video is ALWAYS smooth (YOLO never waits for OCR)
  - Plate text updates every ~10 frames (not every frame, but still fast)
  - Same pattern used in real CCTV systems
"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import cv2, numpy as np, base64, json, re, time, os, asyncio
from concurrent.futures import ThreadPoolExecutor
import threading
import tempfile
from time import perf_counter

router = APIRouter()
MODELS_DIR = "uploaded_models"

from routers.inference import get_yolo, get_ocr, classify_plate, run_ocr_on_crop
try:
    from plate_voter import PlateVoter
except ImportError:
    from routers.plate_voter import PlateVoter
try:
    from routers.video_record import add_frame_to_recorder as _add_frame
except ImportError:
    try:
        from video_record import add_frame_to_recorder as _add_frame
    except ImportError:
        _add_frame = None
import torch

# ── Two separate thread pools ──
# YOLO gets its own thread (GPU, fast)
# OCR gets its own thread (CPU, slow — runs independently)
_yolo_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="yolo")
_ocr_executor  = ThreadPoolExecutor(max_workers=1, thread_name_prefix="ocr")

# Optional measurement for report/testing.  Disabled by default and does not
# affect messages sent to the frontend, pump decisions, or database records.
TIMING_DEBUG = os.getenv("TIMING_DEBUG", "0") == "1"


def _run_yolo(frame: np.ndarray, model_filename: str) -> dict:
    """
    YOLO only — no OCR. Very fast ~10-20ms on GPU.
    Returns bbox and confidence immediately.
    """
    model  = get_yolo(model_filename)
    device = 0 if torch.cuda.is_available() else "cpu"

    results = model.predict(
        source=frame,
        conf=0.5,
        verbose=False,
        device=device,
        imgsz=416,
        half=torch.cuda.is_available(),
        max_det=1,
        augment=False,
        agnostic_nms=True,
    )

    boxes = results[0].boxes
    if len(boxes) == 0:
        return None  # no detection

    best        = max(boxes, key=lambda b: float(b.conf[0]))
    x1,y1,x2,y2 = map(int, best.xyxy[0].tolist())
    conf        = float(best.conf[0])
    h, w        = frame.shape[:2]
    pad         = 6

    crop = frame[max(0,y1-pad):min(h,y2+pad), max(0,x1-pad):min(w,x2+pad)].copy()

    return {
        "bbox":       [x1, y1, x2, y2],
        "confidence": round(conf, 3),
        "crop":       crop,
    }


def _run_ocr(
    crop: np.ndarray,
    include_timing: bool = False,
    frame_started: float | None = None,
    yolo_ms: float | None = None,
) -> tuple:
    """
    OCR using fast-plate-ocr — ~0.6ms on GPU vs ~300ms RapidOCR.
    Returns (plate_text, country, crop_base64)
    """
    # run_ocr_on_crop handles BGR->RGB conversion and .plate extraction
    ocr_started = perf_counter()
    plate_text = run_ocr_on_crop(crop)
    ocr_ms = (perf_counter() - ocr_started) * 1000

    # Encode original BGR crop for frontend preview
    _, buf   = cv2.imencode('.jpg', crop, [cv2.IMWRITE_JPEG_QUALITY, 70])
    crop_b64 = base64.b64encode(buf).decode('utf-8')

    classification_started = perf_counter()
    country = classify_plate(plate_text)
    classification_ms = (perf_counter() - classification_started) * 1000

    if include_timing:
        timing = {
            "yolo_ms": round(yolo_ms or 0.0, 2),
            "ocr_ms": round(ocr_ms, 2),
            "classification_ms": round(classification_ms, 2),
            "server_end_to_end_ms": round(
                ((perf_counter() - frame_started) * 1000) if frame_started else 0.0,
                2,
            ),
        }
        return plate_text, country, crop_b64, timing

    return plate_text, country, crop_b64


@router.websocket("/ws/{model_filename}")
async def websocket_stream(websocket: WebSocket, model_filename: str):
    await websocket.accept()
    safe_model = os.path.basename(model_filename)

    if not os.path.exists(os.path.join(MODELS_DIR, safe_model)):
        await websocket.send_text(json.dumps({"error": f"Model '{safe_model}' not found."}))
        await websocket.close()
        return

    print(f"[Stream] Connected — model: {safe_model} | GPU: {torch.cuda.is_available()}")
    loop = asyncio.get_event_loop()

    # Warm up YOLO with a dummy frame
    dummy = np.zeros((416, 416, 3), dtype=np.uint8)
    await loop.run_in_executor(_yolo_executor, _run_yolo, dummy, safe_model)
    print(f"[Stream] Ready ✓")

    # ── OCR cooldown — only run OCR every N seconds after last successful read ──
    # This prevents CPU from spiking when a plate stays in frame continuously.
    # 1.5 seconds means OCR fires at most once per 1.5s — huge CPU saving.
    OCR_COOLDOWN_SECONDS = 1.5

    # ── Shared OCR state (updated from background thread) ──
    ocr_state = {
        "plate_text":  "",
        "country":     "Unknown",
        "crop_b64":    None,
        "running":     False,
        "last_ocr_at": 0.0,   # timestamp of last OCR trigger
    }
    ocr_lock = threading.Lock()

    # ── Multi-frame temporal voter ──
    # Collects last 5 OCR reads and requires 3 agreeing before emitting
    # a stable plate text — eliminates single-frame glare/blur glitches.
    voter = PlateVoter(
        window_size=5,
        min_agreement=3,
        similarity_threshold=0.80,
        classify_fn=classify_plate,
    )
    no_det_streak = 0          # consecutive frames with no YOLO detection
    NO_DET_CLEAR_THRESHOLD = 8 # clear voter history after this many misses

    def ocr_done_callback(future):
        """Called when background OCR finishes — updates shared state and voter."""
        try:
            plate_text, country, crop_b64, timing = future.result()
            # Feed raw OCR read into the temporal voter
            voter.add_read(plate_text)
            with ocr_lock:
                ocr_state["plate_text"] = plate_text
                ocr_state["country"]    = country
                ocr_state["crop_b64"]   = crop_b64
                ocr_state["running"]    = False
            if TIMING_DEBUG:
                vote = voter.get_consensus()
                print(
                    "[TIMING] "
                    f"yolo_ms={timing['yolo_ms']}, "
                    f"ocr_ms={timing['ocr_ms']}, "
                    f"classification_ms={timing['classification_ms']}, "
                    f"server_end_to_end_ms={timing['server_end_to_end_ms']} | "
                    f"voter: '{vote.plate_text}' ({vote.agreeing_reads}/{vote.raw_reads})"
                )
        except Exception as e:
            with ocr_lock:
                ocr_state["running"] = False

    frame_count  = 0
    t_start      = time.time()

    try:
        while True:
            # Receive JPEG frame
            data  = await websocket.receive_bytes()
            arr   = np.frombuffer(data, np.uint8)
            frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
            if frame is None:
                continue

            frame_count += 1
            t_frame = time.time()
            frame_started = perf_counter()

            # ── Feed frame to video recorder if active ──
            if _add_frame:
                try:
                    _add_frame("Pump 1", frame)
                except Exception:
                    pass

            # ── Step 1: YOLO (fast, blocks only ~10-20ms) ──
            yolo_started = perf_counter()
            det = await loop.run_in_executor(_yolo_executor, _run_yolo, frame, safe_model)
            yolo_stage_ms = (perf_counter() - yolo_started) * 1000

            # ── Step 2: If plate detected, fire OCR in background (non-blocking) ──
            if det is not None:
                no_det_streak = 0   # reset miss counter

                with ocr_lock:
                    ocr_busy = ocr_state["running"]

                now = time.time()
                with ocr_lock:
                    since_last = now - ocr_state["last_ocr_at"]

                if not ocr_busy and det["crop"].size > 0 and since_last >= OCR_COOLDOWN_SECONDS:
                    # Fire OCR in background — doesn't slow down this frame at all
                    with ocr_lock:
                        ocr_state["running"]     = True
                        ocr_state["last_ocr_at"] = now
                    crop_copy  = det["crop"].copy()
                    ocr_future = loop.run_in_executor(
                        _ocr_executor,
                        _run_ocr,
                        crop_copy,
                        True,
                        frame_started,
                        yolo_stage_ms,
                    )
                    ocr_future.add_done_callback(ocr_done_callback)

                # ── Use voter consensus instead of raw OCR ──
                vote = voter.get_consensus()
                with ocr_lock:
                    crop_b64 = ocr_state["crop_b64"]

                yolo_ms = round((time.time() - t_frame) * 1000, 1)
                elapsed = time.time() - t_start
                fps_val = round(frame_count / elapsed, 1) if elapsed > 0 else 0

                result = {
                    "status":            "detection",
                    "plate_text":        vote.plate_text,
                    "confidence":        det["confidence"],
                    "country":           vote.country,
                    "bbox":              det["bbox"],
                    "crop_base64":       crop_b64,
                    "inference_time_ms": yolo_ms,   # YOLO time only (fast)
                    "fps":               fps_val,
                    "frame_count":       frame_count,
                    "voting_confidence": vote.voting_confidence,
                }
            else:
                # No detection — track consecutive misses
                no_det_streak += 1

                with ocr_lock:
                    if not ocr_state["running"]:
                        ocr_state["plate_text"] = ""
                        ocr_state["country"]    = "Unknown"
                        ocr_state["crop_b64"]   = None

                # Clear voter history after sustained absence (vehicle left)
                if no_det_streak >= NO_DET_CLEAR_THRESHOLD:
                    voter.clear()

                elapsed = time.time() - t_start
                fps_val = round(frame_count / elapsed, 1) if elapsed > 0 else 0

                result = {
                    "status":            "no_detection",
                    "bbox":              [],
                    "plate_text":        "",
                    "country":           "Unknown",
                    "confidence":        0.0,
                    "inference_time_ms": round((time.time()-t_frame)*1000, 1),
                    "fps":               fps_val,
                    "frame_count":       frame_count,
                    "voting_confidence": 0.0,
                }

            await websocket.send_text(json.dumps(result))

    except WebSocketDisconnect:
        elapsed = time.time() - t_start
        avg_fps = round(frame_count / elapsed, 1) if elapsed > 0 else 0
        print(f"[Stream] Disconnected — {frame_count} frames, avg {avg_fps} FPS")
    except Exception as e:
        print(f"[Stream] Error: {e}")
        try:
            await websocket.send_text(json.dumps({"error": str(e)}))
        except:
            pass


@router.websocket("/ws-video/{model_filename}")
async def websocket_video_stream(websocket: WebSocket, model_filename: str):
    """
    WebSocket endpoint for video file streaming.
    Client sends video file as binary chunks, server processes frame by frame
    and streams back JSON results + annotated frames in real-time.
    
    Protocol:
      1. Client sends video file bytes in one message
      2. Server processes each frame with YOLO + OCR
      3. Server sends back JSON result for each frame continuously
      4. Client draws bbox overlay just like live camera
    """
    await websocket.accept()
    safe_model = os.path.basename(model_filename)

    if not os.path.exists(os.path.join(MODELS_DIR, safe_model)):
        await websocket.send_text(json.dumps({"error": f"Model not found: {safe_model}"}))
        await websocket.close()
        return

    print(f"[VideoStream] Connected — model: {safe_model}")
    loop = asyncio.get_event_loop()

    # Shared OCR state — same pattern as live camera
    ocr_state = {
        "plate_text":  "",
        "country":     "Unknown", 
        "crop_b64":    None,
        "running":     False,
        "last_ocr_at": 0.0,
    }
    OCR_COOLDOWN_SECONDS = 1.0
    ocr_lock = threading.Lock()

    # ── Multi-frame temporal voter (same as live camera) ──
    voter = PlateVoter(
        window_size=5,
        min_agreement=3,
        similarity_threshold=0.80,
        classify_fn=classify_plate,
    )
    no_det_streak = 0
    NO_DET_CLEAR_THRESHOLD = 8

    def ocr_done_callback(future):
        try:
            plate_text, country, crop_b64 = future.result()
            voter.add_read(plate_text)
            with ocr_lock:
                ocr_state["plate_text"] = plate_text
                ocr_state["country"]    = country
                ocr_state["crop_b64"]   = crop_b64
                ocr_state["running"]    = False
        except Exception:
            with ocr_lock:
                ocr_state["running"] = False

    try:
        # Receive the video file bytes from client
        await websocket.send_text(json.dumps({"status": "waiting", "message": "Send video file bytes"}))
        video_data = await websocket.receive_bytes()

        # Save to temp file
        with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as tmp:
            tmp.write(video_data)
            tmp_path = tmp.name

        cap = cv2.VideoCapture(tmp_path)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        fps_video    = cap.get(cv2.CAP_PROP_FPS) or 30
        frame_delay  = 1.0 / fps_video  # target real-time playback speed

        print(f"[VideoStream] {total_frames} frames @ {fps_video:.1f} FPS")
        await websocket.send_text(json.dumps({
            "status": "started",
            "total_frames": total_frames,
            "video_fps": fps_video,
        }))

        frame_count = 0
        t_start     = time.time()

        while cap.isOpened():
            t_frame = time.time()
            ret, frame = cap.read()
            if not ret:
                break

            frame_count += 1

            # Resize frame FIRST — then run YOLO so bbox coords match
            # what the browser receives (854x480)
            display_frame = cv2.resize(frame, (854, 480)) if frame.shape[1] > 854 else frame

            det = await loop.run_in_executor(_yolo_executor, _run_yolo, display_frame, safe_model)

            if det is not None:
                no_det_streak = 0

                now = time.time()
                with ocr_lock:
                    ocr_busy   = ocr_state["running"]
                    since_last = now - ocr_state["last_ocr_at"]

                if not ocr_busy and det["crop"].size > 0 and since_last >= OCR_COOLDOWN_SECONDS:
                    with ocr_lock:
                        ocr_state["running"]     = True
                        ocr_state["last_ocr_at"] = now
                    crop_copy  = det["crop"].copy()
                    ocr_future = loop.run_in_executor(_ocr_executor, _run_ocr, crop_copy)
                    ocr_future.add_done_callback(ocr_done_callback)

                # ── Use voter consensus instead of raw OCR ──
                vote = voter.get_consensus()
                with ocr_lock:
                    crop_b64 = ocr_state["crop_b64"]

                result = {
                    "status":            "detection",
                    "plate_text":        vote.plate_text,
                    "confidence":        det["confidence"],
                    "country":           vote.country,
                    "bbox":              det["bbox"],
                    "crop_base64":       crop_b64,
                    "inference_time_ms": round((time.time()-t_frame)*1000, 1),
                    "frame_count":       frame_count,
                    "total_frames":      total_frames,
                    "progress":          round(frame_count / total_frames * 100, 1),
                    "voting_confidence": vote.voting_confidence,
                }
            else:
                # No detection — track consecutive misses
                no_det_streak += 1

                with ocr_lock:
                    if not ocr_state["running"]:
                        ocr_state["plate_text"] = ""
                        ocr_state["country"]    = "Unknown"
                        ocr_state["crop_b64"]   = None

                if no_det_streak >= NO_DET_CLEAR_THRESHOLD:
                    voter.clear()

                result = {
                    "status":       "no_detection",
                    "bbox":         [],
                    "plate_text":   "",
                    "country":      "Unknown",
                    "confidence":   0.0,
                    "frame_count":  frame_count,
                    "total_frames": total_frames,
                    "progress":     round(frame_count / total_frames * 100, 1),
                    "voting_confidence": 0.0,
                }

            # Encode the already-resized display_frame as JPEG
            _, buf = cv2.imencode('.jpg', display_frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
            frame_b64 = base64.b64encode(buf).decode('utf-8')
            result["frame_base64"] = frame_b64

            await websocket.send_text(json.dumps(result))

            # Throttle to match video FPS for smooth playback
            elapsed = time.time() - t_frame
            sleep_t = frame_delay - elapsed
            if sleep_t > 0:
                await asyncio.sleep(sleep_t)

        cap.release()
        os.unlink(tmp_path)

        await websocket.send_text(json.dumps({
            "status": "finished",
            "total_frames": frame_count,
            "message": "Video processing complete"
        }))
        print(f"[VideoStream] Done — {frame_count} frames processed")

    except WebSocketDisconnect:
        print("[VideoStream] Client disconnected")
    except Exception as e:
        print(f"[VideoStream] Error: {e}")
        import traceback
        traceback.print_exc()
        try:
            await websocket.send_text(json.dumps({"error": str(e)}))
        except:
            pass
