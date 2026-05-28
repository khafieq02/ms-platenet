"""
MS-PlateNet Backend - FastAPI Application
Main entry point for the inference tester and model comparison dashboard.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

from routers import models, inference

# ─── App Setup ───────────────────────────────────────────────────────────────

app = FastAPI(
    title="MS-PlateNet API",
    description="License Plate Recognition - Inference Tester & Model Dashboard",
    version="1.0.0",
)

# Allow requests from the Vite dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Uploaded Models Storage ──────────────────────────────────────────────────

MODELS_DIR = "uploaded_models"
os.makedirs(MODELS_DIR, exist_ok=True)

# Serve uploaded model files statically (optional, for debug)
app.mount("/static/models", StaticFiles(directory=MODELS_DIR), name="models")

# ─── Routers ─────────────────────────────────────────────────────────────────

app.include_router(models.router, prefix="/api/models", tags=["Models"])
app.include_router(inference.router, prefix="/api/inference", tags=["Inference"])


@app.get("/")
def root():
    return {"message": "MS-PlateNet API is running", "version": "1.0.0"}


@app.get("/api/health")
def health():
    return {"status": "ok"}
