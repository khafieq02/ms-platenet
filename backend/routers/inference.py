"""
MS-PlateNet - Inference Router
YOLO (detection) + fast-plate-ocr (text) + Country classification.
Optimized for CUDA GPU (RTX 4070).
"""

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse
import base64, time, os, re, tempfile
import cv2, numpy as np, torch
from ultralytics import YOLO
from fast_plate_ocr import LicensePlateRecognizer

router = APIRouter()
MODELS_DIR = "uploaded_models"

# ── Model + OCR cache ──
_model_cache: dict = {}
_ocr_engine = None


def get_ocr() -> LicensePlateRecognizer:
    """Return shared fast-plate-ocr instance (GPU via ONNX CUDA)."""
    global _ocr_engine
    if _ocr_engine is None:
        # cct-s-v2-global-model = best accuracy, still very fast
        # Uses CUDA automatically if onnxruntime-gpu is installed
        _ocr_engine = LicensePlateRecognizer('cct-s-v2-global-model')
        print("[OCR] fast-plate-ocr loaded — cct-s-v2-global-model")
    return _ocr_engine


def get_yolo(model_filename: str) -> YOLO:
    """Return cached YOLO model on GPU with FP16."""
    if model_filename not in _model_cache:
        path  = os.path.join(MODELS_DIR, model_filename)
        model = YOLO(path)
        if torch.cuda.is_available():
            model.to("cuda")
            model.model.half()
            print(f"[YOLO] Loaded {model_filename} on GPU (FP16)")
        else:
            print(f"[YOLO] Loaded {model_filename} on CPU")
        _model_cache[model_filename] = model
    return _model_cache[model_filename]


def classify_plate(text: str) -> str:
    """Classify plate country by regex pattern."""
    if not text:
        return "Unknown"
    # Singapore private car plates, e.g. SFE1111G
    if re.match(r'^S[A-Z]{1,3}\d{1,4}[A-Z]$', text):
        return "Singapore"
    # Approximate Malaysian formats, e.g. ABC1234 or ABC1234A
    if re.match(r'^[A-Z]{1,3}\d{1,4}[A-Z]{0,2}$', text):
        return "Malaysia"
    return "Unknown"


def run_ocr_on_crop(crop: np.ndarray) -> str:
    """
    Run fast-plate-ocr on a cropped plate image.
    Returns the plate text string or empty string if unreadable.

    fast-plate-ocr returns a list of PlatePrediction dataclass objects.
    Each has a .plate attribute containing the text string.
    """
    ocr = get_ocr()
    try:
        # Ensure crop is RGB — fast-plate-ocr expects RGB not BGR
        crop_rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)

        results = ocr.run(crop_rgb)

        if results and len(results) > 0:
            # results[0] is a PlatePrediction dataclass — use .plate attribute
            prediction = results[0]
            plate_text = prediction.plate if hasattr(prediction, 'plate') else str(prediction)

            # Clean up — keep only alphanumeric uppercase
            plate_text = re.sub(r'[^A-Z0-9]', '', plate_text.upper())

            print(f"[OCR] Raw: {prediction.plate if hasattr(prediction, 'plate') else prediction} → Cleaned: {plate_text}")

            if 3 <= len(plate_text) <= 10:
                return plate_text
    except Exception as e:
        print(f"[OCR] Error: {e}")
    return ""


def run_inference_on_frame(frame: np.ndarray, model_filename: str) -> dict:
    """Full inference pipeline: YOLO → crop → fast-plate-ocr → classify."""
    t      = time.time()
    model  = get_yolo(model_filename)
    device = 0 if torch.cuda.is_available() else "cpu"

    results = model.predict(
        source=frame, conf=0.5, verbose=False,
        device=device, imgsz=640,
        half=torch.cuda.is_available(),
        max_det=1, augment=False,
    )

    boxes = results[0].boxes
    if len(boxes) == 0:
        return {
            "plate_text": "", "confidence": 0.0, "country": "Unknown",
            "bbox": [], "crop_base64": None,
            "inference_time_ms": round((time.time()-t)*1000, 1),
            "status": "no_detection"
        }

    best        = max(boxes, key=lambda b: float(b.conf[0]))
    x1,y1,x2,y2 = map(int, best.xyxy[0].tolist())
    conf        = float(best.conf[0])

    pad  = 8
    h, w = frame.shape[:2]
    crop = frame[max(0,y1-pad):min(h,y2+pad), max(0,x1-pad):min(w,x2+pad)]

    plate_text = ""
    crop_b64   = None

    if crop.size > 0:
        # fast-plate-ocr — no preprocessing needed!
        plate_text = run_ocr_on_crop(crop)

        # Encode crop for frontend preview
        _, buf   = cv2.imencode('.jpg', crop, [cv2.IMWRITE_JPEG_QUALITY, 85])
        crop_b64 = base64.b64encode(buf).decode('utf-8')

    return {
        "plate_text":        plate_text,
        "confidence":        round(conf, 3),
        "country":           classify_plate(plate_text),
        "bbox":              [x1, y1, x2, y2],
        "crop_base64":       crop_b64,
        "model_used":        model_filename,
        "inference_time_ms": round((time.time()-t)*1000, 1),
        "status":            "real",
    }


def validate_model(fn):
    if not fn: raise HTTPException(400, "No model selected.")
    safe = os.path.basename(fn)
    if not os.path.exists(os.path.join(MODELS_DIR, safe)):
        raise HTTPException(404, f"Model '{safe}' not found.")
    return safe

def decode_image(b):
    arr = np.frombuffer(b, np.uint8)
    f   = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if f is None: raise HTTPException(400, "Could not decode image.")
    return f


@router.post("/image")
async def infer_image(file: UploadFile = File(...), model_filename: str = Form(...)):
    safe  = validate_model(model_filename)
    frame = decode_image(await file.read())
    r     = run_inference_on_frame(frame, safe)
    r["source"] = "image"; r["filename"] = file.filename
    return JSONResponse(content=r)


@router.post("/video")
async def infer_video(file: UploadFile = File(...), model_filename: str = Form(...)):
    safe  = validate_model(model_filename)
    data  = await file.read()
    suffix = os.path.splitext(file.filename)[-1] or ".mp4"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(data); tmp_path = tmp.name
    try:
        cap    = cv2.VideoCapture(tmp_path)
        total  = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        frames = []
        idx    = 0
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret: break
            if idx % 10 == 0:
                r = run_inference_on_frame(frame, safe)
                r["frame_index"] = idx; r["source"] = "video"
                frames.append(r)
            idx += 1
        cap.release()
    finally:
        os.unlink(tmp_path)
    return JSONResponse({"source":"video","filename":file.filename,
                         "size_mb":round(len(data)/1024/1024,2),
                         "total_frames_in_video":total,
                         "total_frames_analyzed":len(frames),
                         "frames":frames,"status":"real"})


@router.post("/frame")
async def infer_frame(file: UploadFile = File(...), model_filename: str = Form(...)):
    safe  = validate_model(model_filename)
    frame = decode_image(await file.read())
    r     = run_inference_on_frame(frame, safe)
    r["source"] = "webcam_frame"
    return JSONResponse(content=r)
