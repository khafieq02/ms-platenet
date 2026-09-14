"""
MS-PlateNet - PostgreSQL Table Definitions
"""
from sqlalchemy import Column, Integer, String, Float, DateTime, Text, Boolean
from sqlalchemy.sql import func
from database import Base

class Detection(Base):
    __tablename__ = "detections"

    id                = Column(Integer, primary_key=True, index=True)
    timestamp         = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    plate_text        = Column(String(20),  nullable=False, index=True)
    country           = Column(String(20),  nullable=False, index=True)
    confidence        = Column(Float,       nullable=False)
    fuel_type         = Column(String(10),  nullable=True)   # Allowed / RON97 / RON95 / Blocked
    pump_id           = Column(String(10),  nullable=True, default="Pump 1")
    model_used        = Column(String(100), nullable=True)
    inference_time_ms = Column(Float,       nullable=True)
    source            = Column(String(30),  nullable=True)
    crop_image_path   = Column(String(255), nullable=True)
    video_path        = Column(String(255), nullable=True)
    status            = Column(String(20),  nullable=True, default="real")

class VideoRecord(Base):
    __tablename__ = "video_records"

    id            = Column(Integer, primary_key=True, index=True)
    detection_id  = Column(Integer, nullable=True, index=True)
    plate_text    = Column(String(20),  nullable=True)
    filename      = Column(String(255), nullable=False)
    filepath      = Column(String(500), nullable=False)
    start_time    = Column(DateTime(timezone=True), server_default=func.now())
    end_time      = Column(DateTime(timezone=True), nullable=True)
    duration_secs = Column(Float, nullable=True)
    pump_id       = Column(String(10),  nullable=True)
    deleted       = Column(Boolean, default=False)
    expires_at    = Column(DateTime(timezone=True), nullable=True)
