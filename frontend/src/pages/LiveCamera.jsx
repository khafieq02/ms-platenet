/**
 * MS-PlateNet - Live Camera (Real-Time WebSocket Streaming)
 *
 * How it works (same as your original Python CCTV script):
 * 1. Webcam runs at full 30fps — never paused or interrupted
 * 2. A separate loop grabs frames and sends over WebSocket as fast as
 *    the backend can process them (non-blocking)
 * 3. Backend replies with bbox + plate text + country instantly
 * 4. Canvas overlay draws the bbox on the video in real-time at 60fps
 *
 * The video is always smooth because rendering (canvas) and
 * inference (WebSocket) are completely independent.
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { Camera, Square, Bell, BellOff, Trash2, AlertTriangle, Wifi, WifiOff, FlipHorizontal } from 'lucide-react'
import api from '../utils/api'
import { useApp } from '../hooks/useAppContext'
import NoModelWarning from '../components/ui/NoModelWarning'

// ── Beep sound ──
function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc  = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    osc.type = 'square'
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6)
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.6)
  } catch(e) {}
}

const COUNTRY_COLOR = {
  Malaysia:  '#00A19C',
  Singapore: '#e53e3e',
  Unknown:   '#9ca3af',
}

// How many ms to wait between sending frames.
// 0 = send as fast as backend can handle (true real-time)
// Increase if CPU is too hot: 100, 200, 500
const FRAME_DELAY_MS = 0

export default function LiveCamera() {
  const { activeModel } = useApp()

  const videoRef     = useRef(null)
  const overlayRef   = useRef(null)
  const captureRef   = useRef(null)
  const streamRef    = useRef(null)   // MediaStream
  const wsRef        = useRef(null)   // WebSocket
  const animRef      = useRef(null)   // requestAnimationFrame id
  const sendingRef   = useRef(false)  // prevents frame queue buildup
  const latestBox    = useRef(null)   // latest bbox result for overlay
  const runningRef   = useRef(false)  // streaming loop active

  const [cameraOn,   setCameraOn]   = useState(false)
  const [facingMode,  setFacingMode]  = useState('environment') // 'environment'=back, 'user'=front
  const [streaming,  setStreaming]  = useState(false)
  const [wsStatus,   setWsStatus]   = useState('disconnected') // connected|disconnected|error
  const [camError,   setCamError]   = useState(null)
  const [result,     setResult]     = useState(null)
  const [alert,      setAlert]      = useState(null)
  const [log,        setLog]        = useState([])
  const [telegramOn, setTelegramOn] = useState(false)
  const [fps,        setFps]        = useState(0)
  const [detStatus,  setDetStatus]  = useState(null) // null | {plate,country,confidence}

  const fpsCountRef  = useRef(0)
  const fpsTimerRef  = useRef(null)

  // ── Load logs + telegram status on mount ──
  useEffect(() => {
    api.get('/logs').then(r => setLog(r.data.logs || [])).catch(() => {})
    api.get('/alerts/status').then(r => setTelegramOn(r.data.configured)).catch(() => {})
  }, [])

  // ── FPS counter (counts frames received from backend per second) ──
  useEffect(() => {
    fpsTimerRef.current = setInterval(() => {
      setFps(fpsCountRef.current)
      fpsCountRef.current = 0
    }, 1000)
    return () => clearInterval(fpsTimerRef.current)
  }, [])

  // ── Canvas overlay — draws bbox at 60fps, independent of inference ──
  const drawOverlay = useCallback(() => {
    const canvas = overlayRef.current
    const video  = videoRef.current
    if (!canvas || !video) return

    canvas.width  = video.videoWidth  || video.clientWidth
    canvas.height = video.videoHeight || video.clientHeight
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const r = latestBox.current
    if (r && r.bbox && r.bbox.length === 4) {
      const [x1, y1, x2, y2] = r.bbox
      const color = COUNTRY_COLOR[r.country] || '#9ca3af'

      // Scale from inference resolution to display resolution
      const scaleX = canvas.width  / (video.videoWidth  || 640)
      const scaleY = canvas.height / (video.videoHeight || 480)
      const sx1 = x1*scaleX, sy1 = y1*scaleY
      const sx2 = x2*scaleX, sy2 = y2*scaleY

      // Bounding box rectangle
      ctx.strokeStyle = color
      ctx.lineWidth   = 3
      ctx.strokeRect(sx1, sy1, sx2-sx1, sy2-sy1)

      // Corner accents (like real CCTV systems)
      const cs = 14 // corner size
      ctx.lineWidth = 4
      // top-left
      ctx.beginPath(); ctx.moveTo(sx1, sy1+cs); ctx.lineTo(sx1, sy1); ctx.lineTo(sx1+cs, sy1); ctx.stroke()
      // top-right
      ctx.beginPath(); ctx.moveTo(sx2-cs, sy1); ctx.lineTo(sx2, sy1); ctx.lineTo(sx2, sy1+cs); ctx.stroke()
      // bottom-left
      ctx.beginPath(); ctx.moveTo(sx1, sy2-cs); ctx.lineTo(sx1, sy2); ctx.lineTo(sx1+cs, sy2); ctx.stroke()
      // bottom-right
      ctx.beginPath(); ctx.moveTo(sx2-cs, sy2); ctx.lineTo(sx2, sy2); ctx.lineTo(sx2, sy2-cs); ctx.stroke()

      // Label background + text
      const plate   = r.plate_text || '?'
      const label   = `${plate}  ${Math.round(r.confidence*100)}%`
      ctx.font      = 'bold 15px "DM Mono", monospace'
      const tw      = Math.max(ctx.measureText(label).width, ctx.measureText(r.country).width) + 14
      const lh      = 44

      ctx.fillStyle = color
      ctx.beginPath()
      ctx.roundRect(sx1, Math.max(0, sy1-lh), tw, lh, 4)
      ctx.fill()

      ctx.fillStyle = 'white'
      ctx.font      = 'bold 14px "DM Mono", monospace'
      ctx.fillText(label, sx1+7, Math.max(lh-26, sy1-26))
      ctx.font      = '12px "DM Sans", sans-serif'
      ctx.fillText(r.country, sx1+7, Math.max(lh-8, sy1-8))
    }

    animRef.current = requestAnimationFrame(drawOverlay)
  }, [])

  // ── Start overlay when camera turns on ──
  useEffect(() => {
    if (cameraOn) {
      animRef.current = requestAnimationFrame(drawOverlay)
    } else {
      cancelAnimationFrame(animRef.current)
      const c = overlayRef.current
      if (c) c.getContext('2d').clearRect(0,0,c.width,c.height)
      latestBox.current = null
    }
    return () => cancelAnimationFrame(animRef.current)
  }, [cameraOn, drawOverlay])

  // ── WebSocket frame sending loop ──
  const startFrameLoop = useCallback(() => {
    runningRef.current = true

    async function loop() {
      if (!runningRef.current) return

      if (
        wsRef.current?.readyState === WebSocket.OPEN &&
        videoRef.current &&
        captureRef.current &&
        !sendingRef.current
      ) {
        sendingRef.current = true
        const canvas = captureRef.current
        canvas.width  = videoRef.current.videoWidth  || 640
        canvas.height = videoRef.current.videoHeight || 480
        canvas.getContext('2d').drawImage(videoRef.current, 0, 0)

        canvas.toBlob(blob => {
          if (blob && wsRef.current?.readyState === WebSocket.OPEN) {
            blob.arrayBuffer().then(buf => {
              wsRef.current.send(buf)
            }).catch(() => {
              sendingRef.current = false
            })
          } else {
            sendingRef.current = false
          }
        }, 'image/jpeg', 0.75)
      }

      if (FRAME_DELAY_MS > 0) {
        setTimeout(loop, FRAME_DELAY_MS)
      } else {
        requestAnimationFrame(loop)
      }
    }

    loop()
  }, [])

  // ── Connect WebSocket ──
  function connectWebSocket(modelFilename) {
    const ws = new WebSocket(
      `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/stream/ws/${encodeURIComponent(modelFilename)}`
    )
    wsRef.current = ws

    ws.onopen = () => {
      setWsStatus('connected')
      setStreaming(true)
      startFrameLoop()
    }

    ws.onmessage = (event) => {
      sendingRef.current = false  // ready for next frame

      try {
        const data = JSON.parse(event.data)
        if (data.error) { console.error('[WS]', data.error); return }

        // Update FPS counter
        fpsCountRef.current++
        if (data.fps !== undefined) setFps(data.fps)

        if (data.status === 'detection') {
          latestBox.current = data
          setResult(data)
          setDetStatus({ plate: data.plate_text || '', country: data.country || '', confidence: data.confidence || 0 })

          // Log entry
          const entry = {
            plate_text:        data.plate_text || '',
            country:           data.country,
            confidence:        data.confidence,
            inference_time_ms: data.inference_time_ms,
            status:            'real',
            source:            'webcam_stream',
            timestamp:         new Date().toLocaleString('ms-MY'),
            crop_base64:       data.crop_base64 || null,
          }

          // Only log when plate text actually changes (avoid duplicates)
          setLog(prev => {
            if (prev[0]?.plate_text === entry.plate_text && prev[0]?.country === entry.country) {
              return prev
            }
            // Telegram + beep for SG
            if (data.country === 'Singapore') {
              playBeep()
              setAlert(entry)
              setTimeout(() => setAlert(null), 8000)
              if (telegramOn) api.post('/alerts/send', entry).catch(() => {})
            }

            return [entry, ...prev].slice(0, 200)
          })
        } else {
          // No detection — fade out box gradually (keep last box visible for 1s)
          setTimeout(() => {
            latestBox.current = null
          }, 1000)
        }
      } catch(e) {}
    }

    ws.onerror = () => setWsStatus('error')
    ws.onclose = () => {
      setWsStatus('disconnected')
      setStreaming(false)
      runningRef.current = false
    }
  }

  // ── Camera controls ──
  async function flipCamera() {
    const newMode = facingMode === 'environment' ? 'user' : 'environment'
    setFacingMode(newMode)
    if (cameraOn) {
      // Restart camera with new facing mode
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { width:{ ideal:1280 }, height:{ ideal:720 }, facingMode: newMode }
        })
        streamRef.current = s
        if (videoRef.current) videoRef.current.srcObject = s
      } catch(e) { setCamError('Cannot switch camera.') }
    }
  }

  async function startCamera() {
    setCamError(null)
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } }
      })
      streamRef.current = s
      if (videoRef.current) videoRef.current.srcObject = s
      setCameraOn(true)
    } catch(e) {
      setCamError('Camera access denied. Please allow camera permission.')
    }
  }

  function startStreaming() {
    if (!activeModel) return
    connectWebSocket(activeModel)
  }

  function stopStreaming() {
    runningRef.current = false
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null }
    setStreaming(false)
    setWsStatus('disconnected')
    latestBox.current = null
  }

  function stopCamera() {
    stopStreaming()
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setCameraOn(false)
    setResult(null)
  }

  async function clearLog() {
    await api.delete('/logs/clear').catch(() => {})
    setLog([])
  }

  useEffect(() => () => { stopCamera(); cancelAnimationFrame(animRef.current) }, [])

  const myCount = log.filter(l => l.country === 'Malaysia').length
  const sgCount = log.filter(l => l.country === 'Singapore').length

  return (
    <div style={{ maxWidth: 1500, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Live Camera</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
          Real-time CCTV-style license plate detection — continuous WebSocket stream.
        </p>
      </div>

      {!activeModel && <NoModelWarning />}

      {/* ── SG Alert Banner ── */}
      {alert && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14,
          padding: '14px 20px',
          background: '#fff1f1', border: '2px solid #e53e3e',
          borderRadius: 'var(--radius-lg)', marginBottom: 16,
          animation: 'pulse 1s ease-in-out 3',
        }}>
          <AlertTriangle size={28} color="#e53e3e" />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: '#e53e3e', marginBottom: 2 }}>
              🚨 Kenderaan Singapura Dikesan! / Singapore Vehicle Detected!
            </div>
            <div style={{ fontSize: 13, color: '#c53030' }}>
              Plat: <strong style={{ fontFamily: 'var(--font-mono)' }}>{alert.plate_text || 'Tidak terbaca'}</strong>
              {' · '}Keyakinan: <strong>{Math.round(alert.confidence * 100)}%</strong>
              {' · '}{alert.timestamp}
            </div>
            <div style={{ fontSize: 12, color: '#c53030', marginTop: 2 }}>
              ⛽ Sila periksa pam dan tolak RON95. / Please check pump and refuse RON95.
            </div>
          </div>
          <button onClick={() => setAlert(null)} style={{
            background: '#e53e3e', color: 'white', border: 'none',
            borderRadius: 'var(--radius)', padding: '6px 14px',
            fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}>Dismiss</button>
        </div>
      )}

      <div className="grid-2col" style={{ marginBottom: 16 }}>

        {/* ── Video Feed ── */}
        <div className="card" style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Camera size={15} color="var(--green)" />
              <span style={{ fontWeight: 600, fontSize: 14 }}>CCTV Feed</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {streaming && (
                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  {fps} FPS
                </span>
              )}
              {/* WS status dot */}
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11,
                color: wsStatus === 'connected' ? 'var(--green)' : wsStatus === 'error' ? '#e53e3e' : 'var(--text-muted)' }}>
                {wsStatus === 'connected' ? <Wifi size={13}/> : <WifiOff size={13}/>}
                {wsStatus === 'connected' ? 'Streaming' : wsStatus === 'error' ? 'Error' : 'Idle'}
              </span>
              {cameraOn && (
                <span style={{ fontSize: 11, color: '#e53e3e', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 700 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#e53e3e', display: 'inline-block',
                    animation: streaming ? 'pulse 1.5s infinite' : 'none' }} />
                  {streaming ? 'REC' : 'CAM'}
                </span>
              )}
              {/* Detection status badge */}
              {streaming && (
                <span style={{
                  fontSize:11, fontWeight:600, padding:'3px 10px', borderRadius:99,
                  display:'inline-flex', alignItems:'center', gap:5,
                  background: detStatus
                    ? detStatus.country === 'Singapore' ? '#fff1f1'
                    : detStatus.country === 'Malaysia'  ? '#e6f7f7' : '#f3f4f6'
                    : '#f3f4f6',
                  color: detStatus
                    ? detStatus.country === 'Singapore' ? '#e53e3e'
                    : detStatus.country === 'Malaysia'  ? '#007A76' : '#9ca3af'
                    : '#9ca3af',
                  border: '1px solid',
                  borderColor: detStatus
                    ? detStatus.country === 'Singapore' ? '#fecaca'
                    : detStatus.country === 'Malaysia'  ? '#99e6e4' : '#e5e7eb'
                    : '#e5e7eb',
                  transition: 'all 0.25s ease',
                }}>
                  <span style={{
                    width:6, height:6, borderRadius:'50%', flexShrink:0,
                    background: detStatus
                      ? detStatus.country === 'Singapore' ? '#e53e3e'
                      : detStatus.country === 'Malaysia'  ? '#00A19C' : '#9ca3af'
                      : '#d1d5db'
                  }}/>
                  {detStatus
                    ? <>
                        {detStatus.country === 'Malaysia' ? '🇲🇾' : detStatus.country === 'Singapore' ? '🇸🇬' : '❓'}
                        {' '}{detStatus.country}
                        {detStatus.plate && (
                          <span style={{ fontFamily:'var(--font-mono)', fontSize:10, opacity:0.8 }}>
                            {' · '}{detStatus.plate}
                          </span>
                        )}
                      </>
                    : <>🔍 Scanning...</>
                  }
                </span>
              )}
            </div>
          </div>

          {/* Video + canvas overlay */}
          <div style={{
            position: 'relative', background: '#0a0a0a',
            borderRadius: 'var(--radius)', overflow: 'hidden',
            aspectRatio: '16/9', marginBottom: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <video ref={videoRef} autoPlay playsInline muted
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: cameraOn ? 'block' : 'none' }}
            />
            <canvas ref={overlayRef} style={{
              position: 'absolute', top: 0, left: 0,
              width: '100%', height: '100%', pointerEvents: 'none',
              display: cameraOn ? 'block' : 'none',
            }}/>
            <canvas ref={captureRef} style={{ display: 'none' }}/>

            {!cameraOn && (
              <div style={{ textAlign: 'center', color: '#555' }}>
                <Camera size={44} color="#333" style={{ marginBottom: 8 }}/>
                <div style={{ fontSize: 13 }}>Camera is off</div>
              </div>
            )}

            {/* Timestamp overlay */}
            {cameraOn && (
              <div style={{
                position: 'absolute', bottom: 8, left: 10,
                fontSize: 11, color: 'rgba(255,255,255,0.7)',
                fontFamily: 'var(--font-mono)',
                textShadow: '0 1px 3px rgba(0,0,0,0.8)',
              }}>
                {new Date().toLocaleString('ms-MY')}
              </div>
            )}
          </div>

          {camError && (
            <div style={{ marginBottom: 10, fontSize: 12, color: 'var(--danger)', background: 'var(--danger-light)', padding: '8px 10px', borderRadius: 'var(--radius)' }}>
              {camError}
            </div>
          )}

          {/* Controls */}
          <div style={{ display: 'flex', gap: 8 }}>
            {!cameraOn ? (
              <button className="btn btn-primary" onClick={startCamera} disabled={!activeModel}
                style={{ flex: 1, justifyContent: 'center' }}>
                <Camera size={14}/> Start Camera
              </button>
            ) : (
              <button className="btn btn-danger" onClick={stopCamera}
                style={{ flex: 1, justifyContent: 'center' }}>
                <Square size={14}/> Stop Camera
              </button>
            )}
            {cameraOn && !streaming ? (
              <button className="btn btn-primary" onClick={startStreaming} disabled={!activeModel}
                style={{ flex: 1, justifyContent: 'center' }}>
                ▶ Start Detection
              </button>
            ) : cameraOn && streaming ? (
              <button className="btn btn-outline" onClick={stopStreaming}
                style={{ flex: 1, justifyContent: 'center' }}>
                ⏹ Stop Detection
              </button>
            ) : null}
          </div>

          <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            💡 Click <strong>Start Camera</strong> first, then <strong>Start Detection</strong> to begin real-time plate recognition.
          </div>
        </div>

        {/* ── Right panel: stats + latest result ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div className="card" style={{ padding: '12px 14px', textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--green)', fontFamily: 'var(--font-mono)' }}>{myCount}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>🇲🇾 Malaysia</div>
            </div>
            <div className="card" style={{ padding: '12px 14px', textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#e53e3e', fontFamily: 'var(--font-mono)' }}>{sgCount}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>🇸🇬 Singapore</div>
            </div>
          </div>

          {/* Telegram status */}
          <div className="card" style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8,
            background: telegramOn ? 'var(--green-light)' : '#f9fafb' }}>
            {telegramOn ? <Bell size={14} color="var(--green)"/> : <BellOff size={14} color="var(--text-muted)"/>}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: telegramOn ? 'var(--green-dark)' : 'var(--text-muted)' }}>
                Telegram {telegramOn ? 'Active' : 'Not configured'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {telegramOn ? 'SG alerts will be sent' : 'Configure in Settings'}
              </div>
            </div>
          </div>

          {/* Latest result */}
          {result && result.status === 'detection' ? (
            <div className="card" style={{ padding: 14 }}>
              <div className="section-title" style={{ marginBottom: 8 }}>Latest Detection</div>
              {result.crop_base64 ? (
                <img src={`data:image/jpeg;base64,${result.crop_base64}`} alt="Plate"
                  style={{ width: '100%', borderRadius: 'var(--radius)', border: '1px solid var(--border)', marginBottom: 8 }}/>
              ) : (
                <div style={{ height: 40, background: 'var(--bg)', borderRadius: 'var(--radius)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>No crop</div>
              )}
              <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-mono)',
                textAlign: 'center', letterSpacing: '0.1em', marginBottom: 8,
                color: result.plate_text ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                {result.plate_text || '— unread —'}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                <span style={{
                  padding: '3px 10px', borderRadius: 99, fontWeight: 600,
                  background: result.country === 'Malaysia' ? 'var(--green-light)' : result.country === 'Singapore' ? '#fff1f1' : '#f3f4f6',
                  color: result.country === 'Malaysia' ? 'var(--green-dark)' : result.country === 'Singapore' ? '#e53e3e' : 'var(--text-muted)',
                }}>
                  {result.country === 'Malaysia' ? '🇲🇾' : result.country === 'Singapore' ? '🇸🇬' : '❓'} {result.country}
                </span>
                <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                  {Math.round(result.confidence*100)}% · {result.inference_time_ms}ms
                </span>
              </div>
            </div>
          ) : (
            <div className="card" style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              <Camera size={28} color="var(--border)" style={{ marginBottom: 8 }}/>
              <div>{streaming ? 'Scanning for plates…' : 'Start detection to begin'}</div>
            </div>
          )}
        </div>
      </div>

      {/* ── Detection Log ── */}
      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Detection Log</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{log.length} entries · saved to file</div>
          </div>
          <button className="btn btn-danger btn-sm" onClick={clearLog} disabled={log.length === 0}>
            <Trash2 size={13}/> Clear
          </button>
        </div>

        {log.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)', fontSize: 13 }}>
            No detections yet.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--bg)', borderBottom: '2px solid var(--border)' }}>
                  {['Time','Plate','Country','Confidence','ms','Source'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {log.slice(0, 50).map((e, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border-light)', background: e.country === 'Singapore' ? '#fff8f8' : 'white' }}>
                    <td style={{ padding: '7px 12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{e.timestamp}</td>
                    <td style={{ padding: '7px 12px', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                      {e.plate_text || <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                    <td style={{ padding: '7px 12px' }}>
                      <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600,
                        background: e.country==='Malaysia' ? 'var(--green-light)' : e.country==='Singapore' ? '#fff1f1' : '#f3f4f6',
                        color: e.country==='Malaysia' ? 'var(--green-dark)' : e.country==='Singapore' ? '#e53e3e' : 'var(--text-muted)' }}>
                        {e.country==='Malaysia'?'🇲🇾':e.country==='Singapore'?'🇸🇬':'❓'} {e.country}
                      </span>
                    </td>
                    <td style={{ padding: '7px 12px', fontFamily: 'var(--font-mono)' }}>{Math.round((e.confidence||0)*100)}%</td>
                    <td style={{ padding: '7px 12px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{e.inference_time_ms}</td>
                    <td style={{ padding: '7px 12px', color: 'var(--text-muted)' }}>{e.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
