"""
MS-PlateNet - Detection CRUD Router (PostgreSQL)
Replaces logs.py for all pump simulation detections.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, delete, cast, Date
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

MY_TZ = ZoneInfo('Asia/Kuala_Lumpur')
import os, base64, uuid

from database import get_db
from models_db import Detection

router = APIRouter()
CROPS_DIR = "detection_crops"
os.makedirs(CROPS_DIR, exist_ok=True)

class DetectionIn(BaseModel):
    plate_text:        Optional[str]   = ""
    country:           Optional[str]   = "Unknown"
    confidence:        Optional[float] = 0.0
    fuel_type:         Optional[str]   = ""
    pump_id:           Optional[str]   = "Pump 1"
    model_used:        Optional[str]   = ""
    inference_time_ms: Optional[float] = 0.0
    source:            Optional[str]   = "pump_simulation"
    crop_base64:       Optional[str]   = None
    status:            Optional[str]   = "real"

@router.post("/add")
async def add_detection(entry: DetectionIn, db: AsyncSession = Depends(get_db)):
    # Save crop image to disk
    crop_path = None
    if entry.crop_base64:
        try:
            img_bytes = base64.b64decode(entry.crop_base64)
            fname = f"{entry.plate_text or 'unknown'}_{uuid.uuid4().hex[:8]}.jpg"
            crop_path = os.path.join(CROPS_DIR, fname)
            with open(crop_path, "wb") as f:
                f.write(img_bytes)
        except Exception:
            crop_path = None

    det = Detection(
        plate_text        = entry.plate_text,
        country           = entry.country,
        confidence        = entry.confidence,
        fuel_type         = entry.fuel_type,
        pump_id           = entry.pump_id,
        model_used        = entry.model_used,
        inference_time_ms = entry.inference_time_ms,
        source            = entry.source,
        crop_image_path   = crop_path,
        status            = entry.status,
    )
    db.add(det)
    await db.commit()
    await db.refresh(det)
    return {"id": det.id, "message": "Detection saved"}

@router.get("")
async def get_detections(
    limit: int = 200,
    db: AsyncSession = Depends(get_db),
    start: Optional[str] = None,
    end: Optional[str] = None,
):
    from datetime import datetime
    filters = [Detection.source == "pump_simulation"]
    if start:
        filters.append(Detection.timestamp >= datetime.fromisoformat(start))
    if end:
        filters.append(Detection.timestamp <= datetime.fromisoformat(end))
    result = await db.execute(
        select(Detection)
        .where(*filters)
        .order_by(desc(Detection.timestamp))
        .limit(limit)
    )
    rows = result.scalars().all()

    malaysia   = sum(1 for r in rows if r.country == "Malaysia")
    sg_ron97   = sum(1 for r in rows if r.fuel_type == "RON97")
    sg_ron95   = sum(1 for r in rows if r.fuel_type == "RON95")
    sg_blocked = sum(1 for r in rows if r.fuel_type == "Blocked")

    return {
        "detections": [
            {
                "id":              r.id,
                "plate_text":      r.plate_text,
                "country":         r.country,
                "confidence":      r.confidence,
                "fuel_type":       r.fuel_type,
                "pump_id":         r.pump_id,
                "timestamp":       r.timestamp.astimezone(MY_TZ).strftime("%d/%m/%Y, %H:%M:%S") if r.timestamp else "",
                "crop_image_path": r.crop_image_path,
                "video_path":      r.video_path,
                "source":          r.source,
            }
            for r in rows
        ],
        "total": len(rows),
        "stats": {
            "malaysia":   malaysia,
            "sg_ron97":   sg_ron97,
            "sg_ron95":   sg_ron95,
            "sg_blocked": sg_blocked,
            "total":      len(rows),
        }
    }

@router.get("/daily")
async def daily_stats(db: AsyncSession = Depends(get_db)):
    """Per-day counts for dashboard chart. Dates are in Malaysia time (UTC+8)."""
    # Convert timestamp to MYT before casting to Date so that detections
    # between midnight and 8 AM MYT are grouped under the correct day.
    myt_date = cast(
        Detection.timestamp.op('AT TIME ZONE')('Asia/Kuala_Lumpur'),
        Date
    ).label("date")
    result = await db.execute(
        select(
            myt_date,
            Detection.country,
            Detection.fuel_type,
            func.count(Detection.id).label("count")
        )
        .where(Detection.source == "pump_simulation")
        .group_by(myt_date, Detection.country, Detection.fuel_type)
        .order_by(myt_date.desc())
        .limit(70)
    )
    rows = result.all()
    return [
        {"date": str(r.date), "country": r.country, "fuel_type": r.fuel_type, "count": r.count}
        for r in rows
    ]

@router.get("/hourly")
async def hourly_stats(
    db: AsyncSession = Depends(get_db),
    start: Optional[str] = None,
    end: Optional[str] = None,
):
    """SG RON97 count grouped by hour of day, optionally within a date range."""
    from sqlalchemy import extract
    from datetime import datetime
    filters = [
        Detection.source == "pump_simulation",
        Detection.country == "Singapore",
        Detection.fuel_type == "RON97",
    ]
    if start:
        filters.append(Detection.timestamp >= datetime.fromisoformat(start))
    if end:
        filters.append(Detection.timestamp <= datetime.fromisoformat(end))
    result = await db.execute(
        select(
            extract('hour', Detection.timestamp.op('AT TIME ZONE')('Asia/Kuala_Lumpur')).label('hour'),
            func.count(Detection.id).label('count')
        )
        .where(*filters)
        .group_by('hour')
        .order_by('hour')
    )
    rows = result.all()
    # Build full 24h array, fill missing hours with 0
    hourly = {int(r.hour): r.count for r in rows}
    return [{"hour": h, "count": hourly.get(h, 0)} for h in range(24)]

@router.get("/dayofweek")
async def dayofweek_stats(
    db: AsyncSession = Depends(get_db),
    start: Optional[str] = None,
    end: Optional[str] = None,
):
    """SG RON97 count grouped by day of week. Optional start/end in ISO format."""
    from sqlalchemy import extract
    from datetime import datetime
    MY_TZ_STR = "Asia/Kuala_Lumpur"
    filters = [
        Detection.source == "pump_simulation",
        Detection.country == "Singapore",
        Detection.fuel_type == "RON97",
    ]
    if start:
        filters.append(Detection.timestamp >= datetime.fromisoformat(start))
    if end:
        filters.append(Detection.timestamp <= datetime.fromisoformat(end))
    result = await db.execute(
        select(
            extract('isodow', Detection.timestamp.op('AT TIME ZONE')(MY_TZ_STR)).label('dow'),
            func.count(Detection.id).label('count')
        )
        .where(*filters)
        .group_by('dow')
        .order_by('dow')
    )
    rows = result.all()
    days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
    dow_map = {int(r.dow): r.count for r in rows}
    return [{"day": days[i], "dow": i+1, "count": dow_map.get(i+1, 0)} for i in range(7)]

@router.delete("/clear")
async def clear_detections(db: AsyncSession = Depends(get_db)):
    await db.execute(delete(Detection))
    await db.commit()
    return {"message": "All detections cleared"}
