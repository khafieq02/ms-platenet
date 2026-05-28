/**
 * MS-PlateNet - Inference Tester Page
 * Upload an image or video and run inference.
 */

import { useState, useRef } from 'react'
import { Image, Film, Upload, Play, X } from 'lucide-react'
import { inferenceApi } from '../utils/api'
import { useApp } from '../hooks/useAppContext'
import NoModelWarning from '../components/ui/NoModelWarning'
import ResultCard from '../components/ui/ResultCard'

function FileDropZone({ accept, label, icon: Icon, onFile, file, disabled }) {
  const ref = useRef()
  return (
    <div>
      <div
        onClick={() => !disabled && ref.current.click()}
        style={{
          border: '2px dashed var(--border)',
          borderRadius: 'var(--radius)',
          padding: '22px 16px',
          textAlign: 'center',
          cursor: disabled ? 'not-allowed' : 'pointer',
          background: disabled ? '#fafafa' : 'var(--bg)',
          opacity: disabled ? 0.6 : 1,
          transition: 'border-color 0.15s',
        }}
        onMouseEnter={e => { if (!disabled) e.currentTarget.style.borderColor = 'var(--green)' }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
      >
        <Icon size={24} color="var(--green)" style={{ marginBottom: 8 }} />
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 3 }}>
          {file ? file.name : `Click to select ${label}`}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{accept}</div>
      </div>
      <input
        ref={ref}
        type="file"
        accept={accept}
        style={{ display: 'none' }}
        onChange={e => e.target.files[0] && onFile(e.target.files[0])}
        disabled={disabled}
      />
    </div>
  )
}

export default function InferenceTester() {
  const { activeModel } = useApp()

  // Image inference state
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [imageResult, setImageResult] = useState(null)
  const [imageLoading, setImageLoading] = useState(false)
  const [imageError, setImageError] = useState(null)

  // Video inference state
  const [videoFile, setVideoFile] = useState(null)
  const [videoResult, setVideoResult] = useState(null)
  const [videoLoading, setVideoLoading] = useState(false)
  const [videoError, setVideoError] = useState(null)

  function handleImageSelect(file) {
    setImageFile(file)
    setImageResult(null)
    setImageError(null)
    const url = URL.createObjectURL(file)
    setImagePreview(url)
  }

  function clearImage() {
    setImageFile(null)
    setImagePreview(null)
    setImageResult(null)
    setImageError(null)
  }

  async function runImageInference() {
    if (!imageFile || !activeModel) return
    setImageLoading(true)
    setImageError(null)
    setImageResult(null)
    try {
      const res = await inferenceApi.image(imageFile, activeModel)
      setImageResult(res.data)
    } catch (err) {
      setImageError(err.response?.data?.detail || 'Inference failed.')
    } finally {
      setImageLoading(false)
    }
  }

  async function runVideoInference() {
    if (!videoFile || !activeModel) return
    setVideoLoading(true)
    setVideoError(null)
    setVideoResult(null)
    try {
      const res = await inferenceApi.video(videoFile, activeModel)
      setVideoResult(res.data)
    } catch (err) {
      setVideoError(err.response?.data?.detail || 'Inference failed.')
    } finally {
      setVideoLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Inference Tester</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
          Upload an image or video file to run plate recognition inference.
        </p>
      </div>

      {!activeModel && <NoModelWarning />}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        {/* ── Image Section ── */}
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <Image size={16} color="var(--green)" />
            <span style={{ fontWeight: 600, fontSize: 14 }}>Image Inference</span>
          </div>

          <FileDropZone
            accept="image/jpeg, image/png, image/webp"
            label="image"
            icon={Upload}
            onFile={handleImageSelect}
            file={imageFile}
            disabled={!activeModel}
          />

          {/* Image preview */}
          {imagePreview && (
            <div style={{ marginTop: 12, position: 'relative' }}>
              <img
                src={imagePreview}
                alt="Preview"
                style={{ width: '100%', borderRadius: 'var(--radius)', border: '1px solid var(--border)', maxHeight: 200, objectFit: 'contain', background: '#000' }}
              />
              <button
                onClick={clearImage}
                style={{
                  position: 'absolute', top: 6, right: 6,
                  background: 'rgba(0,0,0,0.55)', border: 'none', borderRadius: '50%',
                  width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <X size={13} color="white" />
              </button>
            </div>
          )}

          <button
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', marginTop: 12 }}
            disabled={!imageFile || !activeModel || imageLoading}
            onClick={runImageInference}
          >
            <Play size={14} />
            {imageLoading ? 'Running…' : 'Run Inference'}
          </button>

          {imageError && (
            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--danger)', background: 'var(--danger-light)', padding: '8px 10px', borderRadius: 'var(--radius)' }}>
              {imageError}
            </div>
          )}

          {imageResult && (
            <div style={{ marginTop: 14 }}>
              <ResultCard result={imageResult} />
            </div>
          )}
        </div>

        {/* ── Video Section ── */}
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <Film size={16} color="var(--green)" />
            <span style={{ fontWeight: 600, fontSize: 14 }}>Video Inference</span>
          </div>

          <FileDropZone
            accept="video/mp4, video/avi, video/quicktime"
            label="video"
            icon={Upload}
            onFile={(f) => { setVideoFile(f); setVideoResult(null); setVideoError(null) }}
            file={videoFile}
            disabled={!activeModel}
          />

          <button
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', marginTop: 12 }}
            disabled={!videoFile || !activeModel || videoLoading}
            onClick={runVideoInference}
          >
            <Play size={14} />
            {videoLoading ? 'Processing…' : 'Run Inference'}
          </button>

          {videoError && (
            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--danger)', background: 'var(--danger-light)', padding: '8px 10px', borderRadius: 'var(--radius)' }}>
              {videoError}
            </div>
          )}

          {/* Video results - show per-frame list */}
          {videoResult && (
            <div style={{ marginTop: 14 }}>
              <div className="section-title">
                {videoResult.total_frames_analyzed} frames analyzed — {videoResult.filename}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 480, overflowY: 'auto' }}>
                {videoResult.frames.map((frame, i) => (
                  <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 12 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>Frame #{frame.frame_index}</div>
                    <ResultCard result={frame} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
