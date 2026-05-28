/**
 * MS-PlateNet - No Model Warning Banner
 * Shown on inference pages when no model is selected.
 */

import { AlertTriangle } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function NoModelWarning() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '12px 16px',
      background: 'var(--warning-light)',
      border: '1px solid #fde68a',
      borderRadius: 'var(--radius)',
      marginBottom: 20,
    }}>
      <AlertTriangle size={16} color="var(--warning)" />
      <div style={{ flex: 1 }}>
        <span style={{ fontWeight: 600, color: 'var(--warning)', fontSize: 13 }}>No model selected. </span>
        <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
          Go to{' '}
          <Link to="/models" style={{ color: 'var(--green)', fontWeight: 500 }}>Model Manager</Link>
          {' '}to upload and activate a model.
        </span>
      </div>
    </div>
  )
}
