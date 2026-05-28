"""
MS-PlateNet - Models Router
Handles uploading, listing, and deleting .pt model files.
"""

from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
import os
import shutil
import hashlib
from datetime import datetime

router = APIRouter()

MODELS_DIR = "uploaded_models"
os.makedirs(MODELS_DIR, exist_ok=True)


def get_model_info(filename: str) -> dict:
    """Return metadata for a stored model file."""
    filepath = os.path.join(MODELS_DIR, filename)
    stat = os.stat(filepath)
    return {
        "filename": filename,
        "size_bytes": stat.st_size,
        "size_mb": round(stat.st_size / (1024 * 1024), 2),
        "uploaded_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
    }


@router.post("/upload")
async def upload_model(file: UploadFile = File(...)):
    """
    Upload a .pt model file to the server.
    Only .pt files are accepted.
    """
    if not file.filename.endswith(".pt"):
        raise HTTPException(status_code=400, detail="Only .pt model files are supported.")

    # Sanitize filename
    safe_name = os.path.basename(file.filename)
    dest_path = os.path.join(MODELS_DIR, safe_name)

    # Save file to disk
    with open(dest_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    return JSONResponse(
        status_code=201,
        content={
            "message": "Model uploaded successfully.",
            "model": get_model_info(safe_name),
        },
    )


@router.get("")
def list_models():
    """
    Return a list of all uploaded .pt model files.
    """
    models = []
    for fname in os.listdir(MODELS_DIR):
        if fname.endswith(".pt"):
            models.append(get_model_info(fname))

    # Sort by upload time, newest first
    models.sort(key=lambda x: x["uploaded_at"], reverse=True)
    return {"models": models, "count": len(models)}


@router.delete("/{filename}")
def delete_model(filename: str):
    """
    Delete a model file by filename.
    """
    # Security: prevent path traversal
    safe_name = os.path.basename(filename)
    filepath = os.path.join(MODELS_DIR, safe_name)

    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail=f"Model '{safe_name}' not found.")

    os.remove(filepath)
    return {"message": f"Model '{safe_name}' deleted successfully."}
