"""
MS-PlateNet - Detection Log Router
Saves and retrieves all detection events from detection_log.json
"""

from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
import json
import os

router = APIRouter()
LOG_FILE = "detection_log.json"
MAX_ENTRIES = 500

def read_log():
    if not os.path.exists(LOG_FILE):
        return []
    try:
        with open(LOG_FILE, "r") as f:
            return json.load(f)
    except Exception:
        return []

def write_log(entries):
    with open(LOG_FILE, "w") as f:
        json.dump(entries, f, indent=2)

class LogEntry(BaseModel):
    plate_text:        Optional[str]   = ""
    country:           Optional[str]   = "Unknown"
    confidence:        Optional[float] = 0.0
    inference_time_ms: Optional[float] = 0.0
    timestamp:         Optional[str]   = ""
    crop_base64:       Optional[str]   = None
    fuel_type:         Optional[str]   = ""   # RON95 / RON97 / Allowed
    pump:              Optional[str]   = ""
    status:            Optional[str]   = "real"
    source:            Optional[str]   = "unknown"

@router.post("/add")
def add_log(entry: LogEntry):
    entries = read_log()
    entries.insert(0, entry.dict())
    # Keep max entries
    if len(entries) > MAX_ENTRIES:
        entries = entries[:MAX_ENTRIES]
    write_log(entries)
    return { "total": len(entries) }

@router.get("")
def get_logs(limit: int = 500):
    entries = read_log()
    # Build summary stats from pump_simulation source
    pump = [e for e in entries if e.get("source") == "pump_simulation"]
    stats = {
        "malaysia":  len([e for e in pump if e.get("country") == "Malaysia"]),
        "singapore": len([e for e in pump if e.get("country") == "Singapore"]),
        "unknown":   len([e for e in pump if e.get("country") == "Unknown"]),
        "sgRon95":   len([e for e in pump if e.get("fuel_type") == "RON95"]),
        "sgRon97":   len([e for e in pump if e.get("fuel_type") == "RON97"]),
    }
    return {
        "logs":  entries[:limit],
        "total": len(entries),
        "stats": stats,
    }

@router.delete("/clear")
def clear_logs():
    write_log([])
    return { "message": "Log cleared." }