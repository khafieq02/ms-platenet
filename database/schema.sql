-- ==========================================================
-- MS-PlateNet Database Schema (PostgreSQL)
-- Database Name: msplatenet
-- ==========================================================

-- Create database (run separately if database does not exist)
-- CREATE DATABASE msplatenet;

-- 1. Detections Table
CREATE TABLE IF NOT EXISTS detections (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    plate_text VARCHAR(20) NOT NULL,
    country VARCHAR(20) NOT NULL,
    confidence REAL NOT NULL,
    fuel_type VARCHAR(10),
    pump_id VARCHAR(10) DEFAULT 'Pump 1',
    model_used VARCHAR(100),
    inference_time_ms REAL,
    source VARCHAR(30),
    crop_image_path VARCHAR(255),
    video_path VARCHAR(255),
    status VARCHAR(20) DEFAULT 'real'
);

-- Indexes for detections
CREATE INDEX IF NOT EXISTS ix_detections_id ON detections (id);
CREATE INDEX IF NOT EXISTS ix_detections_timestamp ON detections (timestamp);
CREATE INDEX IF NOT EXISTS ix_detections_plate_text ON detections (plate_text);
CREATE INDEX IF NOT EXISTS ix_detections_country ON detections (country);

-- 2. Video Records Table
CREATE TABLE IF NOT EXISTS video_records (
    id SERIAL PRIMARY KEY,
    detection_id INTEGER,
    plate_text VARCHAR(20),
    filename VARCHAR(255) NOT NULL,
    filepath VARCHAR(500) NOT NULL,
    start_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    end_time TIMESTAMPTZ,
    duration_secs REAL,
    pump_id VARCHAR(10),
    deleted BOOLEAN DEFAULT FALSE,
    expires_at TIMESTAMPTZ
);

-- Indexes for video records
CREATE INDEX IF NOT EXISTS ix_video_records_id ON video_records (id);
CREATE INDEX IF NOT EXISTS ix_video_records_detection_id ON video_records (detection_id);
