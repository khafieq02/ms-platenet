/**
 * MS-PlateNet - Inference Tester Page
 * - Image: upload → run inference → show result
 * - Video: upload → stream via WebSocket → smooth playback with bbox overlay
 *          just like live camera
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { Image, Film, Upload, Play, Square, X, Maximize2, Minimize2 } from 'lucide-react'
import { inferenceApi } from '../utils/api'
import { useApp } from '../hooks/useAppContext'
import NoModelWarning from '../components/ui/NoModelWarning'
import ResultCard from '../components/ui/ResultCard'

// ── Colour per country (same as LiveCamera) ──
const COUNTRY_COLOR = {
  Malaysia:  '#00A19C',
  Singapore: '#e53e3e',
  Unknown:   '#9ca3af',
}

// ── Image inference section ──────────────────────────────────────────────────
function ImageSection({ activeModel }) {
  const [file,     setFile]     = useState(null)
  const [preview,  setPreview]  = useState(null)
  const [result,   setResult]   = useState(null)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState(null)
  const fileRef = useRef()

  function handleFile(f) {
    setFile(f)
    setResult(null)
    setError(null)
    setPreview(URL.createObjectURL(f))
  }

  function clear() {
    setFile(null); setPreview(null); setResult(null); setError(null)
  }

  async function run() {
    if (!file || !activeModel) return
    setLoading(true); setError(null); setResult(null)
    try {
      const res = await inferenceApi.image(file, activeModel)
      setResult(res.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Inference failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
        <Image size={16} color="var(--green)" />
        <span style={{ fontWeight:600, fontSize:14 }}>Image Inference</span>
      </div>

      {/* Drop zone */}
      <div onClick={() => !loading && fileRef.current.click()} style={{
        border:'2px dashed var(--border)', borderRadius:'var(--radius)',
        padding:'22px 16px', textAlign:'center',
        cursor: !activeModel || loading ? 'not-allowed' : 'pointer',
        background: !activeModel ? '#fafafa' : 'var(--bg)',
        opacity: !activeModel ? 0.6 : 1, transition:'border-color 0.15s',
      }}
        onMouseEnter={e => { if (activeModel && !loading) e.currentTarget.style.borderColor='var(--green)' }}
        onMouseLeave={e => { e.currentTarget.style.borderColor='var(--border)' }}
      >
        <Upload size={24} color="var(--green)" style={{ marginBottom:8 }}/>
        <div style={{ fontSize:13, fontWeight:500, marginBottom:3 }}>
          {file ? file.name : 'Click to select image'}
        </div>
        <div style={{ fontSize:11, color:'var(--text-muted)' }}>JPG, PNG, WebP</div>
      </div>
      <input ref={fileRef} type="file" accept="image/*" style={{ display:'none' }}
        onChange={e => e.target.files[0] && handleFile(e.target.files[0])} />

      {/* Preview */}
      {preview && (
        <div style={{ marginTop:12, position:'relative' }}>
          <img src={preview} alt="Preview" style={{
            width:'100%', borderRadius:'var(--radius)',
            border:'1px solid var(--border)', maxHeight:220,
            objectFit:'contain', background:'#000',
          }}/>
          <button onClick={clear} style={{
            position:'absolute', top:6, right:6,
            background:'rgba(0,0,0,0.55)', border:'none', borderRadius:'50%',
            width:24, height:24, display:'flex', alignItems:'center',
            justifyContent:'center', cursor:'pointer',
          }}>
            <X size={13} color="white"/>
          </button>
        </div>
      )}

      <button className="btn btn-primary"
        style={{ width:'100%', justifyContent:'center', marginTop:12 }}
        disabled={!file || !activeModel || loading} onClick={run}>
        <Play size={14}/> {loading ? 'Running…' : 'Run Inference'}
      </button>

      {error && (
        <div style={{ marginTop:10, fontSize:12, color:'var(--danger)',
          background:'var(--danger-light)', padding:'8px 10px', borderRadius:'var(--radius)' }}>
          {error}
        </div>
      )}
      {result && <div style={{ marginTop:14 }}><ResultCard result={result}/></div>}
    </div>
  )
}

// ── Video streaming section ───────────────────────────────────────────────────
function VideoSection({ activeModel }) {
  const [file,       setFile]       = useState(null)
  const [streaming,  setStreaming]  = useState(false)
  const [status,     setStatus]     = useState('idle') // idle|uploading|streaming|done|error
  const [progress,   setProgress]   = useState(0)
  const [result,     setResult]     = useState(null)
  const [error,      setError]      = useState(null)
  const [fps,        setFps]        = useState(0)

  const canvasRef   = useRef(null)  // single canvas for BOTH video + bbox overlay
  const wsRef       = useRef(null)
  const latestBox   = useRef(null)
  const animRef     = useRef(null)
  const lastImgRef  = useRef(null)  // last received video frame as Image object
  const fpsCountRef = useRef(0)
  const fpsTimerRef = useRef(null)
  const fileRef        = useRef()
  const containerRef   = useRef()
  const [isFullscreen, setIsFullscreen] = useState(false)

  // FPS counter
  useEffect(() => {
    fpsTimerRef.current = setInterval(() => {
      setFps(fpsCountRef.current)
      fpsCountRef.current = 0
    }, 1000)
    return () => clearInterval(fpsTimerRef.current)
  }, [])

  // Single draw loop — draws video frame THEN bbox on top, same canvas
  // This guarantees perfect alignment — no separate overlay needed
  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) { animRef.current = requestAnimationFrame(drawFrame); return }

    const ctx = canvas.getContext('2d')
    const W   = canvas.width   // always 854
    const H   = canvas.height  // always 480

    ctx.clearRect(0, 0, W, H)

    // 1. Draw video frame
    if (lastImgRef.current) {
      ctx.drawImage(lastImgRef.current, 0, 0, W, H)
    }

    // 2. Draw bbox on top of video frame
    const r = latestBox.current
    if (r && r.bbox && r.bbox.length === 4) {
      const [x1,y1,x2,y2] = r.bbox
      const color = COUNTRY_COLOR[r.country] || '#9ca3af'

      // bbox coords already match 854x480 (backend resizes frame before YOLO)
      ctx.strokeStyle = color; ctx.lineWidth = 3
      ctx.strokeRect(x1, y1, x2-x1, y2-y1)

      // Corner accent marks
      const cs = 14; ctx.lineWidth = 4; ctx.strokeStyle = color
      ctx.beginPath(); ctx.moveTo(x1,y1+cs); ctx.lineTo(x1,y1); ctx.lineTo(x1+cs,y1); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(x2-cs,y1); ctx.lineTo(x2,y1); ctx.lineTo(x2,y1+cs); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(x1,y2-cs); ctx.lineTo(x1,y2); ctx.lineTo(x1+cs,y2); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(x2-cs,y2); ctx.lineTo(x2,y2); ctx.lineTo(x2,y2-cs); ctx.stroke()

      // Label
      const plate   = r.plate_text || '?'
      const label   = `${plate}  ${Math.round(r.confidence*100)}%`
      const country = r.country || 'Unknown'
      ctx.font = 'bold 15px "DM Mono", monospace'
      const tw = Math.max(ctx.measureText(label).width, ctx.measureText(country).width) + 16
      const lh = 44

      ctx.fillStyle = color
      ctx.fillRect(x1, Math.max(0, y1-lh), tw, lh)

      ctx.fillStyle = 'white'
      ctx.font = 'bold 14px "DM Mono", monospace'
      ctx.fillText(label,   x1+8, Math.max(20, y1-26))
      ctx.font = '12px "DM Sans", sans-serif'
      ctx.fillText(country, x1+8, Math.max(36, y1-8))
    }

    animRef.current = requestAnimationFrame(drawFrame)
  }, [])

  function startOverlay() {
    animRef.current = requestAnimationFrame(drawFrame)
  }
  function stopOverlay() {
    cancelAnimationFrame(animRef.current)
    latestBox.current  = null
    lastImgRef.current = null
  }

  function toggleFullscreen() {
    const el = containerRef.current
    if (!el) return
    if (!document.fullscreenElement) {
      el.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {})
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {})
    }
  }

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  async function startStream() {
    if (!file || !activeModel) return
    setError(null); setStatus('uploading'); setStreaming(true)
    setProgress(0); setResult(null); latestBox.current = null

    const ws = new WebSocket(
      `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/stream/ws-video/${encodeURIComponent(activeModel)}`
    )
    wsRef.current = ws

    ws.onopen = async () => {
      // Send the video file as binary
      const buf = await file.arrayBuffer()
      ws.send(buf)
      setStatus('streaming')
      startOverlay()
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)

        if (data.status === 'waiting') return

        if (data.status === 'finished') {
          setStatus('done'); setStreaming(false)
          stopOverlay()
          return
        }

        if (data.error) {
          setError(data.error); setStatus('error'); setStreaming(false)
          stopOverlay(); return
        }

        if (data.progress !== undefined) setProgress(data.progress)

        // Update the latest frame reference — drawFrame loop will render it
        if (data.frame_base64) {
          const img = new window.Image()
          img.onload = () => { lastImgRef.current = img }
          img.src = `data:image/jpeg;base64,${data.frame_base64}`
        }

        // Update bbox overlay
        if (data.status === 'detection') {
          latestBox.current = data
          setResult(data)
          fpsCountRef.current++
        } else {
          latestBox.current = null
        }

      } catch(e) {}
    }

    ws.onerror = () => { setError('WebSocket error.'); setStatus('error'); setStreaming(false); stopOverlay() }
    ws.onclose = () => { if (status !== 'done') setStreaming(false); stopOverlay() }
  }

  function stopStream() {
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null }
    setStreaming(false); setStatus('idle'); stopOverlay()
  }

  function reset() {
    stopStream()
    setFile(null); setResult(null); setError(null)
    setProgress(0); setFps(0); setStatus('idle')
    // Clear canvas
    const c = canvasRef.current
    if (c) c.getContext('2d').clearRect(0,0,c.width,c.height)
    lastImgRef.current = null
  }

  useEffect(() => () => { stopStream(); cancelAnimationFrame(animRef.current) }, [])

  const statusLabel = {
    idle:      '',
    uploading: 'Uploading video…',
    streaming: 'Detecting…',
    done:      'Complete ✓',
    error:     'Error',
  }

  return (
    <div className="card" style={{ padding:20 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <Film size={16} color="var(--green)"/>
          <span style={{ fontWeight:600, fontSize:14 }}>Video Inference</span>
          <span style={{ fontSize:11, color:'var(--text-muted)' }}>— real-time stream</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          {streaming && (
            <span style={{ fontSize:11, color:'var(--text-muted)', fontFamily:'var(--font-mono)' }}>
              {fps} FPS
            </span>
          )}
          {status !== 'idle' && (
            <span style={{
              fontSize:11, fontWeight:600,
              color: status==='done' ? 'var(--green)' : status==='error' ? 'var(--danger)' : 'var(--warning)'
            }}>
              {statusLabel[status]}
            </span>
          )}
        </div>
      </div>

      {/* File picker */}
      {!file ? (
        <div onClick={() => fileRef.current.click()} style={{
          border:'2px dashed var(--border)', borderRadius:'var(--radius)',
          padding:'22px 16px', textAlign:'center',
          cursor: !activeModel ? 'not-allowed' : 'pointer',
          background: !activeModel ? '#fafafa' : 'var(--bg)',
          opacity: !activeModel ? 0.6 : 1, transition:'border-color 0.15s',
        }}
          onMouseEnter={e => { if (activeModel) e.currentTarget.style.borderColor='var(--green)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor='var(--border)' }}
        >
          <Upload size={24} color="var(--green)" style={{ marginBottom:8 }}/>
          <div style={{ fontSize:13, fontWeight:500, marginBottom:3 }}>Click to select video</div>
          <div style={{ fontSize:11, color:'var(--text-muted)' }}>MP4, AVI, MOV</div>
        </div>
      ) : (
        <div style={{ fontSize:13, padding:'8px 12px', background:'var(--bg)', borderRadius:'var(--radius)',
          border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ fontWeight:500 }}>📹 {file.name}</span>
          <span style={{ fontSize:11, color:'var(--text-muted)' }}>
            {(file.size/1024/1024).toFixed(1)} MB
          </span>
        </div>
      )}
      <input ref={fileRef} type="file" accept="video/*" style={{ display:'none' }}
        onChange={e => { if (e.target.files[0]) { reset(); setFile(e.target.files[0]) } }} />

      {/* Video display — canvas + overlay */}
      {file && (
        <div ref={containerRef} style={{
          position:'relative', background:'#0a0a0a', borderRadius:'var(--radius)',
          overflow:'hidden', marginTop:12, aspectRatio:'16/9',
          display:'flex', alignItems:'center', justifyContent:'center',
        }}>
          {/* Single canvas — draws video frame + bbox overlay together */}
          <canvas ref={canvasRef} width={854} height={480}
            style={{ width:'100%', height:'100%', display:'block', objectFit:'contain' }}/>
          {/* Fullscreen button */}
          <button onClick={toggleFullscreen} style={{
            position:'absolute', top:8, right:8,
            background:'rgba(0,0,0,0.55)', border:'none', borderRadius:6,
            width:28, height:28, display:'flex', alignItems:'center',
            justifyContent:'center', cursor:'pointer', zIndex:10,
          }}>
            {isFullscreen ? <Minimize2 size={14} color="white"/> : <Maximize2 size={14} color="white"/>}
          </button>

          {/* Progress bar */}
          {(status==='streaming' || status==='uploading') && (
            <div style={{
              position:'absolute', bottom:0, left:0, right:0, height:4,
              background:'rgba(255,255,255,0.15)',
            }}>
              <div style={{
                width:`${progress}%`, height:'100%',
                background:'var(--green)', transition:'width 0.3s',
              }}/>
            </div>
          )}

          {/* Status overlays */}
          {status==='idle' && (
            <div style={{
              position:'absolute', inset:0, display:'flex',
              alignItems:'center', justifyContent:'center',
              color:'#666', flexDirection:'column', gap:8,
            }}>
              <Film size={36} color="#333"/>
              <span style={{ fontSize:13 }}>Click ▶ Start Detection to begin</span>
            </div>
          )}
          {status==='uploading' && (
            <div style={{
              position:'absolute', inset:0, display:'flex',
              alignItems:'center', justifyContent:'center',
              background:'rgba(0,0,0,0.5)', color:'white', fontSize:14, fontWeight:600,
            }}>
              Uploading video…
            </div>
          )}
          {status==='done' && (
            <div style={{
              position:'absolute', top:8, right:8,
              background:'rgba(0,161,156,0.9)', color:'white',
              fontSize:11, fontWeight:600, padding:'3px 10px', borderRadius:99,
            }}>
              ✓ Complete
            </div>
          )}
          {streaming && status==='streaming' && (
            <div style={{
              position:'absolute', top:8, left:10,
              fontSize:11, color:'rgba(255,255,255,0.8)',
              fontFamily:'var(--font-mono)',
            }}>
              {progress}%
            </div>
          )}
        </div>
      )}

      {/* Controls */}
      <div style={{ display:'flex', gap:8, marginTop:12 }}>
        {!streaming ? (
          <button className="btn btn-primary"
            style={{ flex:1, justifyContent:'center' }}
            disabled={!file || !activeModel || status==='uploading'}
            onClick={startStream}>
            <Play size={14}/> Start Detection
          </button>
        ) : (
          <button className="btn btn-danger"
            style={{ flex:1, justifyContent:'center' }}
            onClick={stopStream}>
            <Square size={14}/> Stop
          </button>
        )}
        {file && (
          <button className="btn btn-outline" onClick={reset}
            disabled={streaming}
            style={{ flex:1, justifyContent:'center' }}>
            <X size={14}/> Reset
          </button>
        )}
      </div>

      {error && (
        <div style={{ marginTop:10, fontSize:12, color:'var(--danger)',
          background:'var(--danger-light)', padding:'8px 10px', borderRadius:'var(--radius)' }}>
          {error}
        </div>
      )}

      {/* Latest detection result */}
      {result && result.status === 'detection' && (
        <div style={{ marginTop:14 }}>
          <div className="section-title">Latest Detection</div>
          <div style={{ padding:'10px 14px', background:'var(--bg)', borderRadius:'var(--radius)',
            border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div style={{ fontSize:20, fontWeight:700, fontFamily:'var(--font-mono)', letterSpacing:'0.1em' }}>
              {result.plate_text || <span style={{ color:'var(--text-muted)', fontSize:14 }}>Plate detected — reading text…</span>}
            </div>
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              <span style={{
                padding:'3px 10px', borderRadius:99, fontWeight:600, fontSize:12,
                background: result.country==='Malaysia' ? 'var(--green-light)' : result.country==='Singapore' ? '#fff1f1' : '#f3f4f6',
                color: result.country==='Malaysia' ? 'var(--green-dark)' : result.country==='Singapore' ? '#e53e3e' : 'var(--text-muted)',
              }}>
                {result.country==='Malaysia'?'🇲🇾':result.country==='Singapore'?'🇸🇬':'❓'} {result.country}
              </span>
              <span style={{ fontSize:11, color:'var(--text-muted)', fontFamily:'var(--font-mono)' }}>
                {Math.round(result.confidence*100)}%
              </span>
            </div>
          </div>
          {result.crop_base64 && (
            <img src={`data:image/jpeg;base64,${result.crop_base64}`} alt="Plate crop"
              style={{ width:'100%', marginTop:8, borderRadius:'var(--radius)',
                border:'1px solid var(--border)', maxHeight:80, objectFit:'contain', background:'#000' }}/>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function InferenceTester() {
  const { activeModel } = useApp()

  return (
    <div style={{ maxWidth: 1500, margin: '0 auto', padding: '20px 16px' }}>
      <div style={{ marginBottom:24 }}>
        <h2 style={{ fontSize:20, fontWeight:700, marginBottom:4 }}>Inference Tester</h2>
        <p style={{ color:'var(--text-secondary)', fontSize:13 }}>
          Test your model on images or video files with real-time detection.
        </p>
      </div>

      {!activeModel && <NoModelWarning/>}

      <div className="grid-2col-equal">
        <ImageSection activeModel={activeModel}/>
        <VideoSection activeModel={activeModel}/>
      </div>
    </div>
  )
}
