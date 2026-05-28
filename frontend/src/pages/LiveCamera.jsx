/**
 * MS-PlateNet - Live Camera Page
 * Capture webcam frames and send to backend for inference.
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { Camera, Square, Play, RefreshCw } from 'lucide-react'
import { inferenceApi } from '../utils/api'
import { useApp } from '../hooks/useAppContext'
import NoModelWarning from '../components/ui/NoModelWarning'
import ResultCard from '../components/ui/ResultCard'

export default function LiveCamera() {
  const { activeModel } = useApp()

  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const intervalRef = useRef(null)

  const [cameraOn, setCameraOn] = useState(false)
  const [autoMode, setAutoMode] = useState(false)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [camError, setCamError] = useState(null)
  const [captureCount, setCaptureCount] = useState(0)

  // Start webcam
  async function startCamera() {
    setCamError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } })
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream
      setCameraOn(true)
    } catch (e) {
      setCamError('Camera access denied or not available. Please allow camera permission.')
    }
  }

  // Stop webcam
  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) videoRef.current.srcObject = null
    setCameraOn(false)
    setAutoMode(false)
    clearInterval(intervalRef.current)
  }

  // Capture one frame and send to backend
  const captureAndInfer = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || !activeModel || loading) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    canvas.width = videoRef.current.videoWidth || 640
    canvas.height = videoRef.current.videoHeight || 480
    ctx.drawImage(videoRef.current, 0, 0)

    canvas.toBlob(async (blob) => {
      if (!blob) return
      setLoading(true)
      setError(null)
      try {
        const res = await inferenceApi.frame(blob, activeModel)
        setResult(res.data)
        setCaptureCount(c => c + 1)
      } catch (err) {
        setError(err.response?.data?.detail || 'Inference failed.')
      } finally {
        setLoading(false)
      }
    }, 'image/jpeg', 0.85)
  }, [activeModel, loading])

  // Auto capture every 2s
  useEffect(() => {
    if (autoMode && cameraOn) {
      intervalRef.current = setInterval(captureAndInfer, 2000)
    } else {
      clearInterval(intervalRef.current)
    }
    return () => clearInterval(intervalRef.current)
  }, [autoMode, cameraOn, captureAndInfer])

  // Cleanup on unmount
  useEffect(() => () => stopCamera(), [])

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Live Camera</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
          Use your webcam to capture frames and run real-time plate recognition.
        </p>
      </div>

      {!activeModel && <NoModelWarning />}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 20 }}>

        {/* Camera feed */}
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Camera size={16} color="var(--green)" />
              <span style={{ fontWeight: 600, fontSize: 14 }}>Webcam Feed</span>
            </div>
            {cameraOn && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--green)' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--green)', display: 'inline-block' }} />
                Live
              </div>
            )}
          </div>

          {/* Video element */}
          <div style={{
            background: '#0a0a0a',
            borderRadius: 'var(--radius)',
            overflow: 'hidden',
            aspectRatio: '4/3',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 14,
            position: 'relative',
          }}>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: cameraOn ? 'block' : 'none' }}
            />
            {!cameraOn && (
              <div style={{ textAlign: 'center' }}>
                <Camera size={40} color="#444" style={{ marginBottom: 10 }} />
                <div style={{ color: '#666', fontSize: 13 }}>Camera is off</div>
              </div>
            )}
            {loading && (
              <div style={{
                position: 'absolute', top: 8, right: 8,
                background: 'rgba(0,161,156,0.9)', color: 'white',
                fontSize: 11, fontWeight: 600, padding: '3px 8px',
                borderRadius: 99,
              }}>
                Inferring…
              </div>
            )}
          </div>

          {/* Hidden canvas for frame capture */}
          <canvas ref={canvasRef} style={{ display: 'none' }} />

          {/* Camera error */}
          {camError && (
            <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--danger)', background: 'var(--danger-light)', padding: '8px 10px', borderRadius: 'var(--radius)' }}>
              {camError}
            </div>
          )}

          {/* Controls */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {!cameraOn ? (
              <button className="btn btn-primary" onClick={startCamera} style={{ flex: 1, justifyContent: 'center' }}>
                <Camera size={14} /> Start Camera
              </button>
            ) : (
              <button className="btn btn-danger" onClick={stopCamera} style={{ flex: 1, justifyContent: 'center' }}>
                <Square size={14} /> Stop Camera
              </button>
            )}

            <button
              className="btn btn-outline"
              disabled={!cameraOn || !activeModel || loading}
              onClick={captureAndInfer}
              style={{ flex: 1, justifyContent: 'center' }}
            >
              <Play size={14} /> Capture & Infer
            </button>

            <button
              className="btn btn-outline"
              disabled={!cameraOn || !activeModel}
              onClick={() => setAutoMode(m => !m)}
              style={{
                flex: 1,
                justifyContent: 'center',
                borderColor: autoMode ? 'var(--green)' : 'var(--border)',
                color: autoMode ? 'var(--green)' : 'var(--text-primary)',
              }}
            >
              <RefreshCw size={14} />
              {autoMode ? 'Stop Auto' : 'Auto (2s)'}
            </button>
          </div>

          {captureCount > 0 && (
            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)' }}>
              Total frames sent: <strong style={{ color: 'var(--text-primary)' }}>{captureCount}</strong>
            </div>
          )}
        </div>

        {/* Result panel */}
        <div>
          <div className="section-title">Latest Result</div>
          {error && (
            <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--danger)', background: 'var(--danger-light)', padding: '8px 10px', borderRadius: 'var(--radius)' }}>
              {error}
            </div>
          )}
          {result ? (
            <ResultCard result={result} />
          ) : (
            <div className="card" style={{
              padding: 28,
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: 13,
            }}>
              <Camera size={32} color="var(--border)" style={{ marginBottom: 10 }} />
              No result yet. Start the camera and capture a frame.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
