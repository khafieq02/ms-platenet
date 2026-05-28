/**
 * MS-PlateNet - Model Manager Page
 * Upload, list, select active model, delete models.
 */

import { useState, useRef } from 'react'
import { Upload, Cpu, Trash2, CheckCircle, HardDrive, Clock } from 'lucide-react'
import { modelsApi } from '../utils/api'
import { useApp } from '../hooks/useAppContext'

export default function ModelManager() {
  const { models, activeModel, setActiveModel, loadingModels, fetchModels } = useApp()
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadError, setUploadError] = useState(null)
  const [uploadSuccess, setUploadSuccess] = useState(null)
  const [deletingFile, setDeletingFile] = useState(null)
  const fileInputRef = useRef()

  async function handleUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    if (!file.name.endsWith('.pt')) {
      setUploadError('Only .pt model files are supported.')
      return
    }
    setUploading(true)
    setUploadError(null)
    setUploadSuccess(null)
    setUploadProgress(0)
    try {
      await modelsApi.upload(file, (evt) => {
        if (evt.total) setUploadProgress(Math.round((evt.loaded / evt.total) * 100))
      })
      setUploadSuccess(`"${file.name}" uploaded successfully.`)
      fetchModels()
    } catch (err) {
      setUploadError(err.response?.data?.detail || 'Upload failed.')
    } finally {
      setUploading(false)
      setUploadProgress(0)
      e.target.value = ''
    }
  }

  async function handleDelete(filename) {
    if (!window.confirm(`Delete "${filename}"?`)) return
    setDeletingFile(filename)
    try {
      await modelsApi.delete(filename)
      if (activeModel === filename) setActiveModel(null)
      fetchModels()
    } catch (err) {
      alert(err.response?.data?.detail || 'Delete failed.')
    } finally {
      setDeletingFile(null)
    }
  }

  return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Model Manager</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
          Upload your trained <code style={{ fontFamily: 'var(--font-mono)', background: 'var(--border-light)', padding: '1px 5px', borderRadius: 4 }}>.pt</code> model files and select one as active.
        </p>
      </div>

      {/* Upload panel */}
      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <div className="section-title">Upload Model</div>
        <div
          onClick={() => !uploading && fileInputRef.current.click()}
          style={{
            border: '2px dashed var(--border)',
            borderRadius: 'var(--radius)',
            padding: '28px 20px',
            textAlign: 'center',
            cursor: uploading ? 'not-allowed' : 'pointer',
            background: 'var(--bg)',
            transition: 'border-color 0.15s',
          }}
          onMouseEnter={e => { if (!uploading) e.currentTarget.style.borderColor = 'var(--green)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
        >
          <Upload size={28} color="var(--green)" style={{ marginBottom: 10 }} />
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
            {uploading ? `Uploading... ${uploadProgress}%` : 'Click to upload a .pt file'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Only .pt (PyTorch) model files</div>
          {uploading && (
            <div style={{ marginTop: 12, height: 6, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{ width: `${uploadProgress}%`, height: '100%', background: 'var(--green)', transition: 'width 0.2s' }} />
            </div>
          )}
        </div>
        <input ref={fileInputRef} type="file" accept=".pt" style={{ display: 'none' }} onChange={handleUpload} />

        {uploadError && (
          <div style={{ marginTop: 10, fontSize: 13, color: 'var(--danger)', background: 'var(--danger-light)', padding: '8px 12px', borderRadius: 'var(--radius)' }}>
            ⚠ {uploadError}
          </div>
        )}
        {uploadSuccess && (
          <div style={{ marginTop: 10, fontSize: 13, color: 'var(--green-dark)', background: 'var(--green-light)', padding: '8px 12px', borderRadius: 'var(--radius)' }}>
            ✓ {uploadSuccess}
          </div>
        )}
      </div>

      {/* Model list */}
      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div className="section-title" style={{ marginBottom: 0 }}>Uploaded Models</div>
          <button className="btn btn-outline btn-sm" onClick={fetchModels} disabled={loadingModels}>
            {loadingModels ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        {loadingModels ? (
          <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)', fontSize: 13 }}>Loading models…</div>
        ) : models.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 32 }}>
            <Cpu size={32} color="var(--border)" style={{ marginBottom: 10 }} />
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No models uploaded yet. Upload a .pt file above.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {models.map(model => {
              const isActive = activeModel === model.filename
              return (
                <div
                  key={model.filename}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 14px',
                    borderRadius: 'var(--radius)',
                    border: `1px solid ${isActive ? 'var(--green)' : 'var(--border)'}`,
                    background: isActive ? 'var(--green-light)' : 'var(--bg)',
                    transition: 'all 0.15s',
                  }}
                >
                  {/* Icon */}
                  <div style={{
                    width: 36, height: 36, borderRadius: 8,
                    background: isActive ? 'var(--green)' : 'white',
                    border: `1px solid ${isActive ? 'var(--green)' : 'var(--border)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <Cpu size={17} color={isActive ? 'white' : 'var(--text-secondary)'} />
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 13, fontWeight: 600,
                      fontFamily: 'var(--font-mono)',
                      color: isActive ? 'var(--green-dark)' : 'var(--text-primary)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {model.filename}
                    </div>
                    <div style={{ display: 'flex', gap: 12, marginTop: 3 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
                        <HardDrive size={10} /> {model.size_mb} MB
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
                        <Clock size={10} /> {new Date(model.uploaded_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  {/* Active badge */}
                  {isActive && (
                    <span className="tag tag-green" style={{ flexShrink: 0 }}>
                      <CheckCircle size={10} /> Active
                    </span>
                  )}

                  {/* Actions */}
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => setActiveModel(isActive ? null : model.filename)}
                    style={{ flexShrink: 0 }}
                  >
                    {isActive ? 'Deselect' : 'Set Active'}
                  </button>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => handleDelete(model.filename)}
                    disabled={deletingFile === model.filename}
                    style={{ flexShrink: 0 }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
