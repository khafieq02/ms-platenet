/**
 * MS-PlateNet - Pump Simulation Page (v2)
 * SV-revised flow:
 *  - Singapore detected → ARMED → RON95 button LOCKED (greyed)
 *  - RON97 still available
 *  - No Telegram alert — system handles access control silently
 *  - Video recording starts on SG detection, stops when car leaves
 *  - All events saved to PostgreSQL via /api/detections/add
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { Camera, Square, CheckCircle, Shield, Lock, Fuel, FlipHorizontal } from 'lucide-react'
import api from '../utils/api'
import { useApp } from '../hooks/useAppContext'
import NoModelWarning from '../components/ui/NoModelWarning'

const STATE = { NORMAL: 'normal', ARMED: 'armed' }

const STATE_CONFIG = {
  normal: {
    label: 'NORMAL',
    color: '#00A19C', bg: '#e6f7f7', border: '#00A19C',
    icon: CheckCircle,
    desc: 'No Singapore vehicle detected. Pump is clear.',
  },
  armed: {
    label: 'ARMED — SG VEHICLE DETECTED',
    color: '#d97706', bg: '#fffbeb', border: '#f59e0b',
    icon: Shield,
    desc: 'Singapore vehicle detected. RON95 is locked. RON97 is available.',
  },
}

function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    osc.type = 'square'
    osc.frequency.setValueAtTime(600, ctx.currentTime)
    gain.gain.setValueAtTime(0.2, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.3)
  } catch(e) {}
}

export default function PumpSimulation() {
  const { activeModel } = useApp()
  const [pumpState,      setPumpState]      = useState(STATE.NORMAL)
  const [lastPlate,      setLastPlate]      = useState(null)
  const [alertLog,       setAlertLog]       = useState([])
  const [cameraOn,       setCameraOn]       = useState(false)
  const [streaming,      setStreaming]       = useState(false)
  const [camError,       setCamError]       = useState(null)
  const [fps,            setFps]            = useState(0)
  const [facingMode,     setFacingMode]     = useState('environment')
  const [servingCustomer,setServingCustomer]= useState(false)
  const [showCleared,    setShowCleared]    = useState(false)
  const [sgBlockedToday, setSgBlockedToday] = useState(0)
  const [myDetectedToday,setMyDetectedToday]= useState(0)

  const videoRef    = useRef(null)
  const overlayRef  = useRef(null)
  const captureRef  = useRef(null)
  const streamRef   = useRef(null)
  const wsRef       = useRef(null)
  const animRef     = useRef(null)
  const sendingRef  = useRef(false)
  const latestBox   = useRef(null)
  const runningRef  = useRef(false)
  const fpsCountRef = useRef(0)
  const fpsTimerRef = useRef(null)

  const activeEventRef   = useRef(null)
  const activeDetectionIdRef = useRef(null)
  const lastPlateRef = useRef(null)  // last SG plate for onCarLeft save
  const fuelSelectedRef = useRef(false) // true if RON97 pressed — skip Blocked save
  const missedFramesRef  = useRef(0)
  const lastMYPlateRef   = useRef(null)
  const videoIdRef       = useRef(null)
  // Frames arrive at roughly 10 FPS. Wait 5 seconds without a plate before
  // treating the vehicle as gone, so brief occlusion does not end the video.
  const MISSED_THRESHOLD = 50

  const pumpStateRef = useRef(STATE.NORMAL)
  useEffect(() => { pumpStateRef.current = pumpState }, [pumpState])

  // Load today stats
  useEffect(() => {
    api.get('/detections').then(r => {
      const today = new Date().toDateString()
      const todayLogs = (r.data.detections || []).filter(d =>
        new Date(d.timestamp).toDateString() === today
      )
      setSgBlockedToday(todayLogs.filter(d => d.country === 'Singapore').length)
      setMyDetectedToday(todayLogs.filter(d => d.country === 'Malaysia').length)
    }).catch(() => {})

    fpsTimerRef.current = setInterval(() => {
      setFps(fpsCountRef.current); fpsCountRef.current = 0
    }, 1000)
    return () => clearInterval(fpsTimerRef.current)
  }, [])

  // ── Video recording ───────────────────────────────────────────────────────
  async function startVideoRecording(plateText) {
    try {
      const res = await api.post('/videos/start', { plate_text: plateText, pump_id: 'Pump 1' })
      videoIdRef.current = res.data.video_id
    } catch(e) {}
  }

  async function stopVideoRecording(detectionId) {
    try {
      await api.post('/videos/stop', { pump_id: 'Pump 1', detection_id: detectionId })
      videoIdRef.current = null
    } catch(e) {}
  }

  // ── Event helpers ─────────────────────────────────────────────────────────
  function startWaitingForCarToLeave() {
    missedFramesRef.current = 0
    setServingCustomer(true)
    setShowCleared(false)
  }

  function clearEvent() {
    activeEventRef.current = null
    activeDetectionIdRef.current = null
    missedFramesRef.current = 0
    lastMYPlateRef.current = null
    lastPlateRef.current = null
    fuelSelectedRef.current = false
    setServingCustomer(false)
    setShowCleared(false)
  }

  function onCarLeft() {
    // Car left without pressing RON97 — save as Blocked
    if (activeEventRef.current && lastPlateRef.current && !fuelSelectedRef.current) {
      const lp = lastPlateRef.current
      api.post('/detections/add', {
        plate_text:        lp.plate_text || '',
        country:           'Singapore',
        confidence:        lp.confidence || 0,
        inference_time_ms: lp.inference_time_ms || 0,
        fuel_type:         'Blocked',
        pump_id:           'Pump 1',
        crop_base64:       lp.crop_base64 || null,
        source:            'pump_simulation',
        status:            'real',
      }).catch(() => {})
    }
    stopVideoRecording(activeDetectionIdRef.current)
    clearEvent()
    setPumpState(STATE.NORMAL)
    setLastPlate(null)
    latestBox.current = null
    setShowCleared(true)
    setTimeout(() => setShowCleared(false), 3000)
  }

  // ── Canvas overlay ────────────────────────────────────────────────────────
  const drawOverlay = useCallback(() => {
    const canvas = overlayRef.current
    const video  = videoRef.current
    if (!canvas || !video) return
    canvas.width  = video.videoWidth  || video.clientWidth  || 640
    canvas.height = video.videoHeight || video.clientHeight || 480
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const r = latestBox.current
    if (r && r.bbox && r.bbox.length === 4) {
      const [x1,y1,x2,y2] = r.bbox
      const color = pumpStateRef.current === STATE.ARMED ? '#d97706' : '#00A19C'
      const scaleX = canvas.width  / (video.videoWidth  || 640)
      const scaleY = canvas.height / (video.videoHeight || 480)
      const sx1=x1*scaleX, sy1=y1*scaleY, sx2=x2*scaleX, sy2=y2*scaleY
      ctx.strokeStyle = color; ctx.lineWidth = 3
      ctx.strokeRect(sx1, sy1, sx2-sx1, sy2-sy1)
      const cs = 14; ctx.lineWidth = 4
      ctx.beginPath(); ctx.moveTo(sx1,sy1+cs); ctx.lineTo(sx1,sy1); ctx.lineTo(sx1+cs,sy1); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(sx2-cs,sy1); ctx.lineTo(sx2,sy1); ctx.lineTo(sx2,sy1+cs); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(sx1,sy2-cs); ctx.lineTo(sx1,sy2); ctx.lineTo(sx1+cs,sy2); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(sx2-cs,sy2); ctx.lineTo(sx2,sy2); ctx.lineTo(sx2,sy2-cs); ctx.stroke()
      const plate = r.plate_text || '?'
      const label = `${plate}  ${Math.round(r.confidence*100)}%`
      ctx.font = 'bold 15px "DM Mono", monospace'
      const tw = ctx.measureText(label).width + 16
      ctx.fillStyle = color
      ctx.fillRect(sx1, Math.max(0, sy1-44), tw, 44)
      ctx.fillStyle = 'white'
      ctx.font = 'bold 14px "DM Mono", monospace'
      ctx.fillText(label, sx1+8, Math.max(20, sy1-26))
      ctx.font = '12px "DM Sans", sans-serif'
      ctx.fillText(r.country||'', sx1+8, Math.max(36, sy1-8))
    }
    animRef.current = requestAnimationFrame(drawOverlay)
  }, [])

  useEffect(() => {
    if (cameraOn) { animRef.current = requestAnimationFrame(drawOverlay) }
    else {
      cancelAnimationFrame(animRef.current)
      const c = overlayRef.current
      if (c) c.getContext('2d').clearRect(0,0,c.width,c.height)
    }
    return () => cancelAnimationFrame(animRef.current)
  }, [cameraOn, drawOverlay])

  // ── Frame loop ────────────────────────────────────────────────────────────
  const startFrameLoop = useCallback(() => {
    runningRef.current = true
    function loop() {
      if (!runningRef.current) return
      if (wsRef.current?.readyState === WebSocket.OPEN &&
          videoRef.current && captureRef.current && !sendingRef.current) {
        sendingRef.current = true
        const canvas = captureRef.current
        canvas.width  = videoRef.current.videoWidth  || 640
        canvas.height = videoRef.current.videoHeight || 480
        canvas.getContext('2d').drawImage(videoRef.current, 0, 0)
        canvas.toBlob(blob => {
          if (blob && wsRef.current?.readyState === WebSocket.OPEN) {
            blob.arrayBuffer().then(buf => wsRef.current.send(buf))
              .catch(() => { sendingRef.current = false })
          } else { sendingRef.current = false }
        }, 'image/jpeg', 0.75)
      }
      setTimeout(loop, 100)
    }
    loop()
  }, [])

  // ── WebSocket ─────────────────────────────────────────────────────────────
  function connectWebSocket() {
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${protocol}://${location.host}/api/stream/ws/${encodeURIComponent(activeModel)}`)
    wsRef.current = ws
    ws.onopen = () => { setStreaming(true); startFrameLoop() }
    ws.onmessage = async (event) => {
      sendingRef.current = false
      fpsCountRef.current++
      try {
        const data = JSON.parse(event.data)
        if (data.error) return
        if (data.status === 'detection') {
          latestBox.current = data
          if (data.country === 'Singapore' && data.plate_text) {
            const eventId = `pump1_${data.plate_text}`
            missedFramesRef.current = 0
            if (pumpStateRef.current === STATE.NORMAL) {
              if (activeEventRef.current !== eventId) {
                // New SG car — arm and start recording
                activeEventRef.current = eventId
                setPumpState(STATE.ARMED)
                playBeep()
                setLastPlate(data)
                setShowCleared(false)
                setSgBlockedToday(p => p + 1)
                startVideoRecording(data.plate_text)
                // Detection saved only when car leaves or RON97 pressed — not on first detection
              }
            } else if (pumpStateRef.current === STATE.ARMED) {
              setLastPlate(data)
              lastPlateRef.current = data
            }
          } else if (data.country === 'Malaysia') {
            missedFramesRef.current = 0
            if (!activeEventRef.current) {
              setLastPlate(data)
              if (data.plate_text && data.plate_text !== lastMYPlateRef.current) {
                lastMYPlateRef.current = data.plate_text
                setMyDetectedToday(p => p + 1)
                const myEntry = {
                  plate_text:        data.plate_text,
                  country:           'Malaysia',
                  confidence:        data.confidence || 0,
                  inference_time_ms: data.inference_time_ms || 0,
                  fuel_type:         'Allowed',
                  pump_id:           'Pump 1',
                  crop_base64:       data.crop_base64 || null,
                  source:            'pump_simulation',
                  status:            'real',
                }
                api.post('/detections/add', myEntry).catch(() => {})
              }
            }
          }
        } else {
          // No detection
          if (activeEventRef.current) {
            missedFramesRef.current += 1
            if (missedFramesRef.current >= MISSED_THRESHOLD) {
              onCarLeft()
            }
          }
          if (pumpStateRef.current !== STATE.ARMED) {
            setTimeout(() => { latestBox.current = null }, 500)
          }
        }
      } catch(e) {}
    }
    ws.onerror = () => setStreaming(false)
    ws.onclose = () => { setStreaming(false); runningRef.current = false }
  }

  // ── Camera controls ───────────────────────────────────────────────────────
  async function startCamera() {
    setCamError(null)
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { width:{ideal:1280}, height:{ideal:720}, facingMode }
      })
      streamRef.current = s
      if (videoRef.current) videoRef.current.srcObject = s
      setCameraOn(true)
    } catch(e) { setCamError('Camera access denied.') }
  }

  async function flipCamera() {
    const newMode = facingMode === 'environment' ? 'user' : 'environment'
    setFacingMode(newMode)
    if (cameraOn) {
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { width:{ideal:1280}, height:{ideal:720}, facingMode: newMode }
        })
        streamRef.current = s
        if (videoRef.current) videoRef.current.srcObject = s
      } catch(e) { setCamError('Cannot switch camera.') }
    }
  }

  function stopDetection() {
    runningRef.current = false
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null }
    setStreaming(false); latestBox.current = null
  }

  function stopCamera() {
    stopDetection()
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setCameraOn(false)
  }

  useEffect(() => () => { stopCamera(); cancelAnimationFrame(animRef.current) }, [])

  // ── RON97 handler ─────────────────────────────────────────────────────────
  async function handleRON97() {
    if (pumpState !== STATE.ARMED) return
    const entry = {
      plate_text:        lastPlate?.plate_text || '',
      country:           'Singapore',
      confidence:        lastPlate?.confidence || 0,
      inference_time_ms: lastPlate?.inference_time_ms || 0,
      fuel_type:         'RON97',
      pump_id:           'Pump 1',
      crop_base64:       lastPlate?.crop_base64 || null,
      source:            'pump_simulation',
      status:            'real',
    }
    fuelSelectedRef.current = true
    const res = await api.post('/detections/add', entry).catch(() => null)
    const detId = res?.data?.id || null
    // Update log table
    setAlertLog(prev => [{
      ...entry,
      timestamp: new Date().toLocaleTimeString('ms-MY'),
      action: 'RON97 Used',
      action_color: '#3b82f6',
    }, ...prev])
    // Keep recording while the customer refuels. The recording is finalised
    // only after the vehicle has left the camera area.
    activeDetectionIdRef.current = detId
    setPumpState(STATE.NORMAL)
    startWaitingForCarToLeave()
  }

  const cfg = STATE_CONFIG[pumpState]
  const StateIcon = cfg.icon

  return (
    <div style={{ maxWidth: 1400 }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Pump Simulation</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
          Real-time RON95 access control — Singapore vehicles are automatically restricted from RON95.
        </p>
      </div>

      {!activeModel && <NoModelWarning />}

      {/* ── Dashboard notification bar ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:16 }}>
        {[
          { label:'🇲🇾 Malaysia Today', value: myDetectedToday, color:'var(--green)', bg:'var(--green-light)' },
          { label:'🇸🇬 SG Blocked Today', value: sgBlockedToday, color:'#d97706', bg:'#fffbeb' },
          { label:'Pump Status', value: pumpState.toUpperCase(), color: cfg.color, bg: cfg.bg },
        ].map(item => (
          <div key={item.label} className="card" style={{ padding:'12px 16px', background: item.bg, borderColor: item.color }}>
            <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:4 }}>{item.label}</div>
            <div style={{ fontSize:20, fontWeight:700, fontFamily:'var(--font-mono)', color: item.color }}>{item.value}</div>
          </div>
        ))}
      </div>

      <div className="grid-2col">
        {/* ── Camera feed ── */}
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div className="card" style={{ padding:16 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <Camera size={15} color="var(--green)" />
                <span style={{ fontWeight:600, fontSize:14 }}>Pump 1 — Camera Feed</span>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                {streaming && <span style={{ fontSize:11, color:'var(--text-muted)', fontFamily:'var(--font-mono)' }}>{fps} FPS</span>}
                {cameraOn && (
                  <span style={{ fontSize:11, color:'#e53e3e', display:'flex', alignItems:'center', gap:4, fontWeight:700 }}>
                    <span style={{ width:7, height:7, borderRadius:'50%', background:'#e53e3e', display:'inline-block',
                      animation: streaming ? 'pulse 1.5s infinite' : 'none' }}/>
                    {streaming ? 'LIVE' : 'CAM'}
                  </span>
                )}
              </div>
            </div>

            <div style={{ position:'relative', background:'#0a0a0a', borderRadius:'var(--radius)',
              overflow:'hidden', aspectRatio:'16/9', marginBottom:12,
              display:'flex', alignItems:'center', justifyContent:'center' }}>
              <video ref={videoRef} autoPlay playsInline muted
                style={{ width:'100%', height:'100%', objectFit:'cover', display: cameraOn?'block':'none' }}/>
              <canvas ref={overlayRef} style={{ position:'absolute', top:0, left:0,
                width:'100%', height:'100%', pointerEvents:'none', display: cameraOn?'block':'none' }}/>
              <canvas ref={captureRef} style={{ display:'none' }}/>
              {!cameraOn && (
                <div style={{ textAlign:'center', color:'#555' }}>
                  <Camera size={40} color="#333" style={{ marginBottom:8 }}/>
                  <div style={{ fontSize:13 }}>Camera off — Pump 1</div>
                </div>
              )}
              {cameraOn && (
                <div style={{ position:'absolute', bottom:8, left:10, fontSize:11,
                  color:'rgba(255,255,255,0.8)', fontFamily:'var(--font-mono)',
                  textShadow:'0 1px 3px rgba(0,0,0,0.8)' }}>
                  CAM-01 | PUMP 1 | {new Date().toLocaleTimeString('ms-MY')}
                </div>
              )}
            </div>

            {camError && (
              <div style={{ marginBottom:10, fontSize:12, color:'var(--danger)',
                background:'var(--danger-light)', padding:'8px 10px', borderRadius:'var(--radius)' }}>
                {camError}
              </div>
            )}

            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {!cameraOn ? (
                <button className="btn btn-primary" onClick={startCamera}
                  disabled={!activeModel} style={{ flex:1, justifyContent:'center' }}>
                  <Camera size={14}/> Start Camera
                </button>
              ) : (
                <button className="btn btn-danger" onClick={stopCamera} style={{ flex:1, justifyContent:'center' }}>
                  <Square size={14}/> Stop Camera
                </button>
              )}
              {cameraOn && !streaming ? (
                <button className="btn btn-primary" onClick={connectWebSocket}
                  disabled={!activeModel} style={{ flex:1, justifyContent:'center' }}>
                  ▶ Start Detection
                </button>
              ) : cameraOn && streaming ? (
                <button className="btn btn-outline" onClick={stopDetection} style={{ flex:1, justifyContent:'center' }}>
                  ⏹ Stop Detection
                </button>
              ) : null}
              {cameraOn && (
                <button className="btn btn-outline" onClick={flipCamera} title="Switch camera" style={{ padding:'8px 10px' }}>
                  <FlipHorizontal size={16}/>
                </button>
              )}
            </div>
          </div>

          {/* Alert log */}
          <div className="card" style={{ padding:20, overflow:'hidden' }}>
            <div style={{ fontWeight:600, fontSize:14, marginBottom:12 }}>Detection History</div>
            {alertLog.length === 0 ? (
              <div style={{ textAlign:'center', padding:'16px 0', color:'var(--text-muted)', fontSize:13 }}>
                No detections yet.
              </div>
            ) : (
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                  <thead>
                    <tr style={{ background:'var(--bg)', borderBottom:'2px solid var(--border)' }}>
                      {['Time','Plate','Country','Action','Pump'].map(h => (
                        <th key={h} style={{ padding:'6px 8px', textAlign:'left', fontSize:11,
                          fontWeight:600, color:'var(--text-muted)', textTransform:'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {alertLog.map((e,i) => (
                      <tr key={i} style={{ borderBottom:'1px solid var(--border-light)' }}>
                        <td style={{ padding:'6px 8px', color:'var(--text-muted)', fontSize:11 }}>{e.timestamp}</td>
                        <td style={{ padding:'6px 8px', fontFamily:'var(--font-mono)', fontWeight:600 }}>{e.plate_text||'—'}</td>
                        <td style={{ padding:'6px 8px' }}>
                          {e.country === 'Malaysia' ? '🇲🇾' : e.country === 'Singapore' ? '🇸🇬' : '❓'} {e.country}
                        </td>
                        <td style={{ padding:'6px 8px' }}>
                          <span style={{ padding:'2px 8px', borderRadius:99, fontSize:11, fontWeight:600,
                            background: e.action_color + '22', color: e.action_color }}>
                            {e.action}
                          </span>
                        </td>
                        <td style={{ padding:'6px 8px', color:'var(--text-muted)' }}>{e.pump_id}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* ── Pump control panel ── */}
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div className="card" style={{ padding:'20px 16px', border:`2px solid ${cfg.border}`,
            background: cfg.bg, transition:'all 0.3s ease', minWidth:0, overflow:'hidden' }}>

            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
              <div style={{ fontSize:13, fontWeight:700, color:'var(--text-muted)' }}>PUMP 1</div>
            </div>

            {/* Status circle */}
            <div style={{ textAlign:'center', marginBottom:20 }}>
              <div style={{
                width:80, height:80, borderRadius:'50%', background: cfg.color,
                margin:'0 auto 12px', display:'flex', alignItems:'center', justifyContent:'center',
                boxShadow: pumpState === STATE.ARMED ? `0 0 0 8px ${cfg.color}33` : 'none',
                animation: pumpState === STATE.ARMED ? 'pulse 1.5s infinite' : 'none',
                transition:'all 0.3s ease',
              }}>
                <StateIcon size={36} color="white"/>
              </div>
              <div style={{ fontSize:16, fontWeight:800, color: cfg.color, letterSpacing:'0.03em', wordBreak:'break-word' }}>
                {cfg.label}
              </div>
              <div style={{ fontSize:12, color:'var(--text-secondary)', marginTop:6, lineHeight:1.5 }}>
                {cfg.desc}
              </div>
            </div>

            {/* Serving customer banner */}
            {pumpState === STATE.NORMAL && servingCustomer && activeEventRef.current && (
              <div style={{ background:'#eff6ff', border:'1px solid #93c5fd',
                borderRadius:'var(--radius)', padding:'12px 14px', marginBottom:14,
                display:'flex', alignItems:'center', gap:12 }}>
                <span style={{ fontSize:20 }}>⛽</span>
                <div>
                  <div style={{ fontSize:12, fontWeight:700, color:'#1d4ed8', marginBottom:2 }}>
                    Serving customer — waiting for vehicle to leave
                  </div>
                  <div style={{ fontSize:11, color:'#1e40af' }}>
                    System will reset when vehicle leaves camera.
                  </div>
                </div>
              </div>
            )}

            {/* Cleared banner */}
            {showCleared && (
              <div style={{ background:'var(--green-light)', border:'1px solid var(--green-mid)',
                borderRadius:'var(--radius)', padding:'8px 14px', marginBottom:14,
                fontSize:12, color:'var(--green-dark)', display:'flex', alignItems:'center', gap:8 }}>
                <CheckCircle size={14} color="var(--green)"/>
                Vehicle cleared — ready for next customer
              </div>
            )}

            {/* Last detected plate */}
            {lastPlate && (
              <div style={{ background:'white', borderRadius:'var(--radius)',
                border:`1px solid ${cfg.border}`, padding:'10px 14px', marginBottom:16 }}>
                <div style={{ fontSize:10, color:'var(--text-muted)', marginBottom:4 }}>DETECTED PLATE</div>
                <div style={{ fontSize:22, fontWeight:700, fontFamily:'var(--font-mono)',
                  letterSpacing:'0.08em', color: cfg.color,
                  overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {lastPlate.plate_text || '—'}
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', marginTop:4, fontSize:11, color:'var(--text-muted)' }}>
                  <span>
                    {lastPlate.country === 'Malaysia' ? '🇲🇾' : lastPlate.country === 'Singapore' ? '🇸🇬' : '❓'}
                    {' '}{lastPlate.country}
                  </span>
                  <span style={{ fontFamily:'var(--font-mono)' }}>{Math.round((lastPlate.confidence||0)*100)}% confidence</span>
                </div>
                {lastPlate.crop_base64 && (
                  <img src={`data:image/jpeg;base64,${lastPlate.crop_base64}`} alt="plate"
                    style={{ width:'100%', marginTop:8, borderRadius:4,
                      border:'1px solid var(--border)', maxHeight:60, objectFit:'contain', background:'#000' }}/>
                )}
              </div>
            )}

            {/* ── Nozzle buttons ── */}
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:11, fontWeight:600, color:'var(--text-muted)',
                textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:10 }}>
                Nozzle Selection
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, minWidth:0 }}>

                {/* RON97 — active when ARMED */}
                <button onClick={handleRON97} disabled={pumpState !== STATE.ARMED}
                  style={{ padding:'16px 8px', borderRadius:'var(--radius)', border:'2px solid',
                    borderColor: pumpState === STATE.ARMED ? '#16a34a' : '#d1d5db',
                    background: pumpState === STATE.ARMED ? '#f0fdf4' : '#f9fafb',
                    color: pumpState === STATE.ARMED ? '#16a34a' : '#9ca3af',
                    cursor: pumpState === STATE.ARMED ? 'pointer' : 'not-allowed',
                    fontWeight:700, fontSize:15, fontFamily:'var(--font)', transition:'all 0.15s' }}>
                  <div style={{ fontSize:24, marginBottom:4 }}>🟢</div>
                  <div>RON97</div>
                  <div style={{ fontSize:10, fontWeight:400, marginTop:2 }}>
                    {pumpState === STATE.ARMED ? 'Available' : 'Inactive'}
                  </div>
                </button>

                {/* RON95 — always locked when SG car detected */}
                <div style={{ position:'relative' }} title={pumpState === STATE.ARMED ? 'RON95 is restricted for Singapore-registered vehicles' : ''}>
                  <button disabled
                    style={{ width:'100%', padding:'16px 8px', borderRadius:'var(--radius)', border:'2px solid',
                      borderColor: pumpState === STATE.ARMED ? '#e53e3e' : '#d1d5db',
                      background: pumpState === STATE.ARMED ? '#fff1f1' : '#f9fafb',
                      color: pumpState === STATE.ARMED ? '#e53e3e' : '#9ca3af',
                      cursor:'not-allowed', fontWeight:700, fontSize:15,
                      fontFamily:'var(--font)', transition:'all 0.15s', opacity: pumpState === STATE.ARMED ? 1 : 0.5 }}>
                    <div style={{ fontSize:24, marginBottom:4, position:'relative', display:'inline-block' }}>
                      🔴
                      {pumpState === STATE.ARMED && (
                        <Lock size={12} color="#e53e3e" style={{ position:'absolute', top:-4, right:-8 }}/>
                      )}
                    </div>
                    <div>RON95</div>
                    <div style={{ fontSize:10, fontWeight:600, marginTop:2, color: pumpState === STATE.ARMED ? '#e53e3e' : '#9ca3af' }}>
                      {pumpState === STATE.ARMED ? '🔒 LOCKED' : 'Inactive'}
                    </div>
                  </button>
                  {/* Tooltip on hover */}
                  {pumpState === STATE.ARMED && (
                    <div style={{ position:'absolute', bottom:'calc(100% + 8px)', left:'50%',
                      transform:'translateX(-50%)', background:'#1a1a1a', color:'white',
                      fontSize:11, padding:'6px 10px', borderRadius:6, whiteSpace:'nowrap',
                      pointerEvents:'none', zIndex:10, boxShadow:'0 2px 8px rgba(0,0,0,0.3)' }}>
                      🚫 RON95 restricted for Singapore vehicles
                      <div style={{ position:'absolute', top:'100%', left:'50%', transform:'translateX(-50%)',
                        width:0, height:0, borderLeft:'5px solid transparent',
                        borderRight:'5px solid transparent', borderTop:'5px solid #1a1a1a' }}/>
                    </div>
                  )}
                </div>
              </div>

              {pumpState === STATE.NORMAL && (
                <div style={{ textAlign:'center', marginTop:10, fontSize:11, color:'var(--text-muted)' }}>
                  Buttons active only when pump is ARMED
                </div>
              )}
            </div>
          </div>

          {/* How it works */}
          <div className="card" style={{ padding:16 }}>
            <div style={{ fontSize:12, fontWeight:600, marginBottom:10, color:'var(--text-secondary)' }}>
              How It Works
            </div>
            {[
              ['🟢','NORMAL',  'No SG vehicle. Pump operates freely.'],
              ['🟠','ARMED',   'SG vehicle detected. RON95 locked. RON97 available.'],
              ['🔒','RON95',   'Automatically locked for Singapore vehicles.'],
              ['✅','RON97',   'Singapore customer selects RON97 → allowed.'],
              ['⛽','SERVING', 'Waiting for vehicle to leave camera.'],
            ].map(([icon, state, desc]) => (
              <div key={state} style={{ display:'flex', gap:10, marginBottom:8, fontSize:12 }}>
                <span style={{ fontSize:14, flexShrink:0 }}>{icon}</span>
                <div><strong>{state}</strong> — {desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
