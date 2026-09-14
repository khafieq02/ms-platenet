"""
MS-PlateNet Backend - FastAPI Application
PostgreSQL + video recording + auto-delete scheduler
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from contextlib import asynccontextmanager
import os, asyncio
from dotenv import load_dotenv

load_dotenv()

from database import init_db, AsyncSessionLocal
from routers import models, inference, alerts, stream
from routers.detections  import router as detections_router
from routers.video_record import router as video_router, run_auto_delete
# Keep old logs.py for backward compat
from routers import logs

async def auto_delete_scheduler():
    """Run auto-delete every 24 hours."""
    while True:
        await asyncio.sleep(86400)  # 24 hours
        try:
            async with AsyncSessionLocal() as db:
                deleted = await run_auto_delete(db)
                if deleted > 0:
                    print(f"[Cleanup] Deleted {deleted} expired videos")
        except Exception as e:
            print(f"[Cleanup] Error: {e}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await init_db()
    asyncio.create_task(auto_delete_scheduler())
    print("[Server] MS-PlateNet started")
    yield
    # Shutdown
    print("[Server] MS-PlateNet stopped")

app = FastAPI(
    title="MS-PlateNet API",
    description="License Plate Recognition — RON95 Access Control",
    version="4.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Create required directories ───────────────────────────────────────────────
for d in ["uploaded_models", "detection_crops", "detection_videos"]:
    os.makedirs(d, exist_ok=True)

# ── API routes ────────────────────────────────────────────────────────────────
app.include_router(models.router,      prefix="/api/models",      tags=["Models"])
app.include_router(inference.router,   prefix="/api/inference",   tags=["Inference"])
app.include_router(alerts.router,      prefix="/api/alerts",      tags=["Alerts"])
app.include_router(stream.router,      prefix="/api/stream",      tags=["Stream"])
app.include_router(logs.router,        prefix="/api/logs",        tags=["Logs"])
app.include_router(detections_router,  prefix="/api/detections",  tags=["Detections"])
app.include_router(video_router,       prefix="/api/videos",      tags=["Videos"])

# ── Static: model files, video files ─────────────────────────────────────────
app.mount("/static/models", StaticFiles(directory="uploaded_models"), name="models")
app.mount("/videos",        StaticFiles(directory="detection_videos"), name="videos")
app.mount("/crops",         StaticFiles(directory="detection_crops"),  name="crops")

# ── Serve React frontend ──────────────────────────────────────────────────────
FRONTEND_DIST = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")

if os.path.exists(FRONTEND_DIST):
    app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND_DIST, "assets")), name="assets")

    @app.get("/")
    def serve_index():
        return FileResponse(os.path.join(FRONTEND_DIST, "index.html"))

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        if full_path.startswith("api/") or full_path.startswith("videos/") or full_path.startswith("crops/"):
            return {"error": "Not found"}
        file_path = os.path.join(FRONTEND_DIST, full_path)
        if os.path.exists(file_path) and os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(FRONTEND_DIST, "index.html"))

@app.get("/api/health")
def health():
    return {"status": "ok", "version": "4.0.0"}
