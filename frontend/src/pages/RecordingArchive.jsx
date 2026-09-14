/**
 * Recording Archive
 * Lets station staff review videos saved after a Singapore-vehicle detection.
 */

import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, Calendar, Clock, Download, Play, RefreshCw, Search, Video, X } from 'lucide-react'
import api from '../utils/api'

const BACKEND_ORIGIN = (import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://127.0.0.1:8000' : window.location.origin)).replace(/\/$/, '')

function formatDuration(seconds) {
  if (seconds === null || seconds === undefined) return 'Recording in progress'
  const total = Math.max(0, Math.round(seconds))
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function videoUrl(path) {
  return `${BACKEND_ORIGIN}${path}`
}

export default function RecordingArchive() {
  const [videos, setVideos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(null)
  const [query, setQuery] = useState('')
  const [pumpFilter, setPumpFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState('')

  const loadVideos = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await api.get('/videos')
      setVideos(response.data)
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not load saved recordings. Check that the backend is running.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadVideos() }, [loadVideos])

  const pumps = [...new Set(videos.map(video => video.pump_id).filter(Boolean))]
  const filteredVideos = videos.filter(video => {
    const matchesQuery = `${video.plate_text || ''} ${video.filename || ''}`.toLowerCase().includes(query.trim().toLowerCase())
    const matchesPump = pumpFilter === 'all' || video.pump_id === pumpFilter
    const matchesDate = !dateFilter || video.start_time_iso?.slice(0, 10) === dateFilter
    return matchesQuery && matchesPump && matchesDate
  })

  return (
    <div style={{ maxWidth: 1500, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Recording Archive</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
            Review recordings captured when a vehicle requires attention. Videos remain available for 14 days.
          </p>
        </div>
        <button className="btn btn-outline" onClick={loadVideos} disabled={loading}>
          <RefreshCw size={14} style={{ animation: loading ? 'spin 0.8s linear infinite' : undefined }} />
          Refresh
        </button>
      </div>

      {error && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '12px 14px', marginBottom: 16, borderRadius: 'var(--radius)', color: 'var(--danger)', background: 'var(--danger-light)', border: '1px solid #fecaca', fontSize: 13 }}>
          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} /> {error}
        </div>
      )}

      {!loading && videos.length > 0 && (
        <div className="card" style={{ padding: 14, marginBottom: 16, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
          <div style={{ position: 'relative', flex: '1 1 220px' }}>
            <Search size={15} color="var(--text-muted)" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search plate number" style={{ width: '100%', padding: '8px 10px 8px 32px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 13, outline: 'none' }} />
          </div>
          <select value={pumpFilter} onChange={event => setPumpFilter(event.target.value)} style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-secondary)', background: 'white' }}>
            <option value="all">All pumps</option>
            {pumps.map(pump => <option key={pump} value={pump}>{pump}</option>)}
          </select>
          <input type="date" value={dateFilter} onChange={event => setDateFilter(event.target.value)} aria-label="Filter recordings by date" style={{ padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-secondary)' }} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{filteredVideos.length} of {videos.length} recordings</span>
        </div>
      )}

      {loading ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Loading recordings...</div>
      ) : videos.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: 'center' }}>
          <Video size={36} color="var(--border)" style={{ marginBottom: 10 }} />
          <div style={{ fontWeight: 600, marginBottom: 4 }}>No recordings saved yet</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>New Singapore-vehicle recordings will appear here automatically.</div>
        </div>
      ) : filteredVideos.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No recordings match your filters.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {filteredVideos.map(video => (
            <article className="card" key={video.id} style={{ overflow: 'hidden' }}>
              <button onClick={() => setSelected(video)} aria-label={`Play recording for ${video.plate_text || 'unknown vehicle'}`} style={{ width: '100%', aspectRatio: '16 / 9', display: 'block', background: '#112321', color: 'white', position: 'relative', overflow: 'hidden' }}>
                <video muted preload="metadata" src={videoUrl(video.url)} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'rgba(0, 0, 0, 0.18)' }}><Play size={32} fill="white" /></span>
                <span style={{ position: 'absolute', bottom: 10, right: 10, padding: '3px 7px', fontSize: 11, borderRadius: 4, background: 'rgba(0,0,0,0.7)' }}>{formatDuration(video.duration)}</span>
              </button>
              <div style={{ padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                  <strong style={{ fontFamily: 'var(--font-mono)', fontSize: 16, letterSpacing: '0.05em' }}>{video.plate_text || 'Unknown plate'}</strong>
                  <span className="tag tag-red">Recorded</span>
                </div>
                <div style={{ display: 'grid', gap: 5, fontSize: 12, color: 'var(--text-secondary)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Video size={13} /> {video.pump_id || 'Pump 1'}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Clock size={13} /> {video.start_time || 'Time unavailable'}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Calendar size={13} /> Available until {video.expires_at || 'unknown date'}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                  <button className="btn btn-primary" onClick={() => setSelected(video)} style={{ flex: 1, justifyContent: 'center' }}><Play size={13} fill="white" /> Play</button>
                  <a className="btn btn-outline" href={videoUrl(video.download_url)} style={{ justifyContent: 'center' }} title="Download recording"><Download size={14} /></a>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {selected && (
        <div onClick={() => setSelected(null)} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.7)', display: 'grid', placeItems: 'center', padding: 20 }}>
          <div className="card" onClick={event => event.stopPropagation()} style={{ width: 'min(920px, 100%)', overflow: 'hidden', background: '#111' }}>
            <div style={{ padding: '12px 14px', background: 'var(--surface)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div><strong style={{ fontFamily: 'var(--font-mono)' }}>{selected.plate_text || 'Unknown plate'}</strong><span style={{ marginLeft: 8, color: 'var(--text-muted)', fontSize: 12 }}>{selected.start_time}</span></div>
              <button onClick={() => setSelected(null)} aria-label="Close video" style={{ display: 'flex', color: 'var(--text-secondary)', padding: 4 }}><X size={20} /></button>
            </div>
            <video controls autoPlay style={{ display: 'block', width: '100%', maxHeight: '70vh', background: '#000' }} src={videoUrl(selected.url)}>
              Your browser does not support embedded video playback.
            </video>
          </div>
        </div>
      )}
    </div>
  )
}
