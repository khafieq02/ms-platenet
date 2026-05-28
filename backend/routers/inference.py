"""
MS-PlateNet - Inference Router
Real inference using YOLO (detection) + RapidOCR (text extraction).
Country classification ported from original PSM project code.
"""

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse
import base64
import time
import os
import re
import tempfile

import cv2
import numpy as np
import torch
from ultralytics import YOLO
from rapidocr_onnxruntime import RapidOCR

router = APIRouter()

MODELS_DIR = "uploaded_models"

# ─── Model Cache ──────────────────────────────────────────────────────────────
# We cache loaded YOLO models so we don't reload from disk on every request.
_model_cache: dict[str, YOLO] = {}
_ocr_engine: RapidOCR | None = None


def get_ocr() -> RapidOCR:
    """Return a shared RapidOCR instance (loaded once)."""
    global _ocr_engine
    if _ocr_engine is None:
        _ocr_engine = RapidOCR()
    return _ocr_engine


def get_yolo(model_filename: str) -> YOLO:
    """Return a cached YOLO model, loading it if not yet in memory."""
    if model_filename not in _model_cache:
        model_path = os.path.join(MODELS_DIR, model_filename)
        model = YOLO(model_path)
        if torch.cuda.is_available():
            model.to("cuda")
        _model_cache[model_filename] = model
        print(f"[MS-PlateNet] Loaded model: {model_filename} | Device: {'GPU' if torch.cuda.is_available() else 'CPU'}")
    return _model_cache[model_filename]


# ─── Country Classification ───────────────────────────────────────────────────
# Ported directly from your original PSM script.

def classify_plate(text: str) -> str:
    """
    Classify plate country based on format:
    - Singapore: S + 1-3 letters + 1-4 digits + 1 letter  (e.g. SJP9988Z)
    - Malaysia:  1-3 letters + 1-4 digits + 0-2 letters    (e.g. VBG4921)
    - Unknown: anything else
    """
    if not text:
        return "Unknown"
    sg = re.match(r'^S[A-Z]{1,3}\d{1,4}[A-Z]$', text)
    if sg:
        return "Singapore"
    my = re.match(r'^[A-Z]{1,3}\d{1,4}[A-Z]{0,2}$', text)
    if my:
        return "Malaysia"
    return "Unknown"


# ─── Core Inference Logic ─────────────────────────────────────────────────────

def run_inference_on_frame(frame: np.ndarray, model_filename: str) -> dict:
    """
    Run full plate detection + OCR on a single BGR image frame.
    Returns a structured result dict.

    Pipeline:
    1. YOLO detects plate bounding box
    2. Crop + preprocess plate region
    3. RapidOCR reads the text (tries normal + inverted binary)
    4. Country classified by regex
    5. Crop encoded as base64 for frontend preview
    """
    t_start = time.time()

    model = get_yolo(model_filename)
    ocr   = get_ocr()
    device = 0 if torch.cuda.is_available() else "cpu"

    # ── Step 1: YOLO Detection ──
    results = model.predict(
        source=frame,
        conf=0.5,
        verbose=False,
        device=device,
        imgsz=640,
        max_det=1,
    )

    boxes = results[0].boxes
    if len(boxes) == 0:
        # No plate detected in this frame
        elapsed = round((time.time() - t_start) * 1000, 1)
        return {
            "plate_text": "",
            "confidence": 0.0,
            "country": "Unknown",
            "bbox": [],
            "crop_base64": None,
            "inference_time_ms": elapsed,
            "status": "no_detection",
        }

    # ── Step 2: Get best box ──
    best_box = max(boxes, key=lambda b: float(b.conf[0]))
    x1, y1, x2, y2 = map(int, best_box.xyxy[0].tolist())
    conf = float(best_box.conf[0])

    # Pad the crop slightly for better OCR
    pad = 8
    h, w = frame.shape[:2]
    x1p = max(0, x1 - pad)
    y1p = max(0, y1 - pad)
    x2p = min(w, x2 + pad)
    y2p = min(h, y2 + pad)
    crop = frame[y1p:y2p, x1p:x2p]

    # ── Step 3: OCR on crop ──
    plate_text = ""
    crop_base64 = None

    if crop.size > 0:
        # Upscale + CLAHE + Otsu threshold (same as your original code)
        up    = cv2.resize(crop, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
        gray  = cv2.cvtColor(up, cv2.COLOR_BGR2GRAY)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        gray  = clahe.apply(gray)

        # Try both normal and inverted binary — take the longer result
        for mode in [cv2.THRESH_BINARY, cv2.THRESH_BINARY_INV]:
            _, binary = cv2.threshold(gray, 0, 255, mode + cv2.THRESH_OTSU)
            result, _ = ocr(cv2.cvtColor(binary, cv2.COLOR_GRAY2BGR))
            if result:
                texts     = [line[1] for line in result if line[2] > 0.5]
                candidate = re.sub(r'[^A-Z0-9]', '', ''.join(texts).upper())
                if 4 <= len(candidate) <= 8 and len(candidate) > len(plate_text):
                    plate_text = candidate

        # Encode crop as base64 JPEG for frontend preview
        _, buf = cv2.imencode('.jpg', crop, [cv2.IMWRITE_JPEG_QUALITY, 85])
        crop_base64 = base64.b64encode(buf).decode('utf-8')

    # ── Step 4: Classify country ──
    country = classify_plate(plate_text)

    elapsed = round((time.time() - t_start) * 1000, 1)

    return {
        "plate_text":        plate_text,
        "confidence":        round(conf, 3),
        "country":           country,
        "bbox":              [x1, y1, x2, y2],
        "crop_base64":       crop_base64,
        "model_used":        model_filename,
        "inference_time_ms": elapsed,
        "status":            "real",
    }


# ─── Helpers ──────────────────────────────────────────────────────────────────

def validate_model(model_filename: str) -> str:
    if not model_filename:
        raise HTTPException(status_code=400, detail="No model selected.")
    safe_name = os.path.basename(model_filename)
    if not os.path.exists(os.path.join(MODELS_DIR, safe_name)):
        raise HTTPException(status_code=404, detail=f"Model '{safe_name}' not found on server.")
    return safe_name


def decode_image(image_bytes: bytes) -> np.ndarray:
    arr   = np.frombuffer(image_bytes, np.uint8)
    frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if frame is None:
        raise HTTPException(status_code=400, detail="Could not decode image. Make sure it is a valid JPEG/PNG.")
    return frame


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.post("/image")
async def infer_image(
    file: UploadFile = File(...),
    model_filename: str = Form(...),
):
    """Run YOLO + OCR on a single uploaded image."""
    safe_model   = validate_model(model_filename)
    image_bytes  = await file.read()
    frame        = decode_image(image_bytes)

    result               = run_inference_on_frame(frame, safe_model)
    result["source"]     = "image"
    result["filename"]   = file.filename
    return JSONResponse(content=result)


@router.post("/video")
async def infer_video(
    file: UploadFile = File(...),
    model_filename: str = Form(...),
):
    """
    Run YOLO + OCR on a video file.
    Samples every 10th frame to keep response time reasonable.
    """
    safe_model  = validate_model(model_filename)
    video_bytes = await file.read()

    # Write video to a temp file (OpenCV needs a real file path)
    suffix = os.path.splitext(file.filename)[-1] or ".mp4"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(video_bytes)
        tmp_path = tmp.name

    try:
        cap = cv2.VideoCapture(tmp_path)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        sample_every = 10  # analyse every 10th frame

        frames_results = []
        frame_idx = 0

        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break
            if frame_idx % sample_every == 0:
                r = run_inference_on_frame(frame, safe_model)
                r["frame_index"] = frame_idx
                r["source"]      = "video"
                frames_results.append(r)
            frame_idx += 1

        cap.release()
    finally:
        os.unlink(tmp_path)

    return JSONResponse(content={
        "source":                "video",
        "filename":              file.filename,
        "size_mb":               round(len(video_bytes) / (1024 * 1024), 2),
        "total_frames_in_video": total_frames,
        "total_frames_analyzed": len(frames_results),
        "frames":                frames_results,
        "status":                "real",
    })


@router.post("/frame")
async def infer_frame(
    file: UploadFile = File(...),
    model_filename: str = Form(...),
):
    """Run YOLO + OCR on a single webcam frame (JPEG blob from browser)."""
    safe_model  = validate_model(model_filename)
    image_bytes = await file.read()
    frame       = decode_image(image_bytes)

    result           = run_inference_on_frame(frame, safe_model)
    result["source"] = "webcam_frame"
    return JSONResponse(content=result)
