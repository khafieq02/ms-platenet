"""
MS-PlateNet - Video Recording Router
Records MP4 when SG plate detected. Auto-deletes after 14 days.
"""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo

MY_TZ = ZoneInfo('Asia/Kuala_Lumpur')
import asyncio, cv2, os, threading, uuid, shutil, subprocess

from database import get_db
from models_db import VideoRecord

router = APIRouter()
VIDEOS_DIR = "detection_videos"
os.makedirs(VIDEOS_DIR, exist_ok=True)

_active_recorders: dict = {}

class VideoRecorder:
    def __init__(self, plate_text: str, pump_id: str):
        self.plate_text = plate_text
        self.pump_id    = pump_id
        self.running    = False
        self.filename   = f"{plate_text}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.mp4"
        self.filepath   = os.path.join(VIDEOS_DIR, self.filename)
        self.start_time = datetime.now(timezone.utc)
        self.frames     = []
        self._lock      = threading.Lock()

    def add_frame(self, frame):
        with self._lock:
            if self.running and len(self.frames) < 3000:  # max ~5 min at 10fps
                self.frames.append(frame.copy())

    def start(self):
        self.running = True

    def stop(self):
        self.running = False
        if not self.frames:
            return None
        h, w = self.frames[0].shape[:2]
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        raw_path = self.filepath + ".raw.mp4"
        encoded_path = self.filepath + ".encoded.mp4"
        out = cv2.VideoWriter(raw_path, fourcc, 10.0, (w, h))
        for f in self.frames:
            out.write(f)
        out.release()
        self.frames.clear()

        # OpenCV writes mp4v files, which many web browsers cannot play.
        # Re-encode the temporary file as H.264 MP4 before making it available.
        ffmpeg = shutil.which("ffmpeg")
        if not ffmpeg:
            os.remove(raw_path)
            raise RuntimeError("FFmpeg is required to save browser-playable recordings.")
        try:
            subprocess.run(
                [
                    ffmpeg, "-y", "-i", raw_path,
                    "-c:v", "libx264", "-pix_fmt", "yuv420p",
                    "-movflags", "+faststart", "-an", encoded_path,
                ],
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
            )
            os.replace(encoded_path, self.filepath)
        finally:
            if os.path.exists(raw_path):
                os.remove(raw_path)
            if os.path.exists(encoded_path):
                os.remove(encoded_path)
        return self.filepath

class StartRecordingRequest(BaseModel):
    plate_text: str
    pump_id:    Optional[str] = "Pump 1"

class StopRecordingRequest(BaseModel):
    pump_id:      Optional[str] = "Pump 1"
    detection_id: Optional[int] = None

@router.post("/start")
async def start_recording(req: StartRecordingRequest, db: AsyncSession = Depends(get_db)):
    if req.pump_id in _active_recorders:
        return {"message": "Already recording"}
    recorder = VideoRecorder(req.plate_text, req.pump_id)
    recorder.start()
    _active_recorders[req.pump_id] = recorder
    expires = datetime.now(timezone.utc) + timedelta(days=14)
    vr = VideoRecord(
        plate_text = req.plate_text,
        filename   = recorder.filename,
        filepath   = recorder.filepath,
        pump_id    = req.pump_id,
        expires_at = expires,
    )
    db.add(vr)
    await db.commit()
    await db.refresh(vr)
    return {"message": "Recording started", "video_id": vr.id, "filename": recorder.filename}

@router.post("/stop")
async def stop_recording(req: StopRecordingRequest, db: AsyncSession = Depends(get_db)):
    recorder = _active_recorders.pop(req.pump_id, None)
    if not recorder:
        return {"message": "No active recording"}
    loop = asyncio.get_event_loop()
    filepath = await loop.run_in_executor(None, recorder.stop)
    end_time = datetime.now(timezone.utc)
    duration = (end_time - recorder.start_time).total_seconds()
    await db.execute(
        update(VideoRecord)
        .where(VideoRecord.filename == recorder.filename)
        .values(end_time=end_time, duration_secs=duration, detection_id=req.detection_id)
    )
    await db.commit()
    return {"message": "Recording saved", "filepath": filepath, "duration": round(duration, 1)}

def add_frame_to_recorder(pump_id: str, frame):
    """Called from stream.py to feed frames into the recorder."""
    recorder = _active_recorders.get(pump_id)
    if recorder:
        recorder.add_frame(frame)

@router.get("")
async def list_videos(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(VideoRecord)
        .where(VideoRecord.deleted == False)
        .order_by(VideoRecord.start_time.desc())
        .limit(50)
    )
    rows = result.scalars().all()
    # Do not show metadata for a recording whose file is no longer present.
    # This avoids presenting a Play button that cannot work after cleanup or a
    # manual file removal.
    return [
        {
            "id":         r.id,
            "plate_text": r.plate_text,
            "filename":   r.filename,
            "duration":   r.duration_secs,
            "pump_id":    r.pump_id,
            "start_time": r.start_time.astimezone(MY_TZ).strftime("%d/%m/%Y %H:%M:%S") if r.start_time else "",
            "start_time_iso": r.start_time.astimezone(MY_TZ).isoformat() if r.start_time else "",
            "url":        f"/videos/{r.filename}",
            "download_url": f"/api/videos/{r.id}/download",
            "expires_at": r.expires_at.strftime("%d/%m/%Y") if r.expires_at else "",
        }
        for r in rows
        if os.path.isfile(r.filepath)
    ]

@router.get("/{video_id}/download")
async def download_video(video_id: int, db: AsyncSession = Depends(get_db)):
    """Download one available recording with its original filename."""
    result = await db.execute(
        select(VideoRecord).where(VideoRecord.id == video_id, VideoRecord.deleted == False)
    )
    video = result.scalar_one_or_none()
    if not video or not os.path.isfile(video.filepath):
        raise HTTPException(status_code=404, detail="Recording file not found.")
    return FileResponse(video.filepath, media_type="video/mp4", filename=video.filename)

async def run_auto_delete(db: AsyncSession):
    """Delete videos older than 14 days. Call daily."""
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(VideoRecord).where(VideoRecord.expires_at < now, VideoRecord.deleted == False)
    )
    expired = result.scalars().all()
    for v in expired:
        try:
            if os.path.exists(v.filepath):
                os.remove(v.filepath)
        except Exception:
            pass
        v.deleted = True
    await db.commit()
    return len(expired)
