-- ==========================================================
-- MS-PlateNet Sample Seed Data (PostgreSQL)
-- Initial realistic records for Malaysian and Singaporean plates
-- ==========================================================

INSERT INTO detections (timestamp, plate_text, country, confidence, fuel_type, pump_id, model_used, inference_time_ms, source, status) VALUES
(NOW() - INTERVAL '2 hours', 'WYY7277', 'Malaysia', 0.912, 'Allowed', 'Pump 1', 'YOLOv8m + FastPlateOCR', 18.25, 'live_camera', 'real'),
(NOW() - INTERVAL '1 hour 45 minutes', 'SDS500B', 'Singapore', 0.884, 'Blocked', 'Pump 1', 'YOLOv8m + FastPlateOCR', 19.10, 'live_camera', 'real'),
(NOW() - INTERVAL '1 hour 30 minutes', 'VAP8812', 'Malaysia', 0.941, 'Allowed', 'Pump 2', 'YOLOv8m + FastPlateOCR', 17.80, 'live_camera', 'real'),
(NOW() - INTERVAL '1 hour 15 minutes', 'SMG1234A', 'Singapore', 0.895, 'Blocked', 'Pump 1', 'YOLOv8m + FastPlateOCR', 18.50, 'live_camera', 'real'),
(NOW() - INTERVAL '50 minutes', 'JQK1109', 'Malaysia', 0.927, 'Allowed', 'Pump 2', 'YOLOv8m + FastPlateOCR', 18.05, 'live_camera', 'real'),
(NOW() - INTERVAL '35 minutes', 'SJJ8899K', 'Singapore', 0.863, 'Blocked', 'Pump 1', 'YOLOv8m + FastPlateOCR', 19.40, 'live_camera', 'real'),
(NOW() - INTERVAL '20 minutes', 'BND3456', 'Malaysia', 0.935, 'Allowed', 'Pump 1', 'YOLOv8m + FastPlateOCR', 17.95, 'live_camera', 'real'),
(NOW() - INTERVAL '5 minutes', 'SLK9900Z', 'Singapore', 0.879, 'Blocked', 'Pump 2', 'YOLOv8m + FastPlateOCR', 18.60, 'live_camera', 'real');
