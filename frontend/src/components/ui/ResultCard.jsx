/**
 * MS-PlateNet - Inference Result Card
 * Displays plate text, confidence, country, bbox, crop preview.
 */

import { CheckCircle, MapPin, Target, Clock, Image, AlertCircle } from 'lucide-react'

const COUNTRY_FLAGS = {
  Malaysia:  '🇲🇾',
  Singapore: '🇸🇬',
  Unknown:   '❓',
}

function ConfidenceBar({ value }) {
  const pct   = Math.round(value * 100)
  const color = pct >= 90 ? 'var(--green)' : pct >= 70 ? 'var(--warning)' : 'var(--danger)'
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Detection Confidence</span>
        <span style={{ fontSize: 12, fontWeight: 600, color, fontFamily: 'var(--font-mono)' }}>{pct}%</span>
      </div>
      <div style={{ height: 5, background: 'var(--border)', borderRadius: 99 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 99, transition: 'width 0.4s ease' }} />
      </div>
    </div>
  )
}

export default function ResultCard({ result }) {
  if (!result) return null

  // No plate detected in frame
  if (result.status === 'no_detection') {
    return (
      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-muted)' }}>
          <AlertCircle size={18} />
          <div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>No plate detected</div>
            <div style={{ fontSize: 12 }}>No license plate found in this image.</div>
          </div>
        </div>
      </div>
    )
  }

  const flag      = COUNTRY_FLAGS[result.country] || '❓'
  const isReal    = result.status === 'real'
  const hasText   = result.plate_text && result.plate_text.length > 0

  return (
    <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className="section-title" style={{ marginBottom: 0 }}>Detection Result</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <span className={`tag ${isReal ? 'tag-green' : 'tag-yellow'}`}>
            {isReal ? <><CheckCircle size={10} /> Live</> : '⚠ Stub'}
          </span>
          {result.source && <span className="tag tag-gray">{result.source}</span>}
        </div>
      </div>

      {/* Plate text */}
      <div style={{
        background: 'var(--bg)', borderRadius: 'var(--radius)',
        border: '1px solid var(--border)', padding: '14px 20px', textAlign: 'center',
      }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Plate Number</div>
        <div style={{
          fontSize: 28, fontWeight: 700, fontFamily: 'var(--font-mono)',
          color: hasText ? 'var(--text-primary)' : 'var(--text-muted)',
          letterSpacing: '0.12em',
        }}>
          {hasText ? result.plate_text : '— unread —'}
        </div>
        {!hasText && isReal && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            Plate detected but OCR could not read the text
          </div>
        )}
      </div>

      {/* Confidence */}
      <ConfidenceBar value={result.confidence || 0} />

      {/* Meta */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ background: 'var(--bg)', borderRadius: 'var(--radius)', padding: '10px 12px' }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
            <MapPin size={10} /> Country
          </div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{flag} {result.country}</div>
        </div>
        <div style={{ background: 'var(--bg)', borderRadius: 'var(--radius)', padding: '10px 12px' }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Clock size={10} /> Inference Time
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
            {result.inference_time_ms ?? '—'} ms
          </div>
        </div>
      </div>

      {/* Bounding box */}
      {result.bbox && result.bbox.length === 4 && (
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Target size={10} /> Bounding Box (x1, y1, x2, y2)
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)', background: 'var(--bg)', padding: '6px 10px', borderRadius: 'var(--radius)' }}>
            [{result.bbox.join(', ')}]
          </div>
        </div>
      )}

      {/* Crop preview */}
      <div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
          <Image size={10} /> Plate Crop Preview
        </div>
        {result.crop_base64 ? (
          <img
            src={`data:image/jpeg;base64,${result.crop_base64}`}
            alt="Plate crop"
            style={{ width: '100%', borderRadius: 'var(--radius)', border: '1px solid var(--border)', imageRendering: 'pixelated' }}
          />
        ) : (
          <div style={{
            height: 64, background: 'var(--bg)', border: '1px dashed var(--border)',
            borderRadius: 'var(--radius)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 12, color: 'var(--text-muted)',
          }}>
            {isReal ? 'No crop (plate not detected)' : 'No crop (stub mode)'}
          </div>
        )}
      </div>

      {/* Footer */}
      {result.model_used && (
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, fontSize: 11, color: 'var(--text-muted)' }}>
          Model: <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--green-dark)' }}>{result.model_used}</span>
        </div>
      )}
    </div>
  )
}
