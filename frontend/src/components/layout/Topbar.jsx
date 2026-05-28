/**
 * MS-PlateNet - Topbar
 */

import { useLocation } from 'react-router-dom'
import { CheckCircle, AlertCircle } from 'lucide-react'
import { useApp } from '../../hooks/useAppContext'

const PAGE_TITLES = {
  '/': 'Dashboard',
  '/models': 'Model Manager',
  '/inference': 'Inference Tester',
  '/camera': 'Live Camera',
  '/settings': 'Settings',
}

export default function Topbar() {
  const location = useLocation()
  const { activeModel, error } = useApp()
  const title = PAGE_TITLES[location.pathname] || 'MS-PlateNet'

  return (
    <header style={{
      height: 'var(--topbar-height)',
      background: 'var(--surface)',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 24px',
      position: 'fixed',
      top: 0,
      left: 'var(--sidebar-width)',
      right: 0,
      zIndex: 99,
    }}>
      <h1 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
        {title}
      </h1>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {/* Backend status */}
        {error ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--danger)' }}>
            <AlertCircle size={14} />
            Backend offline
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--green)' }}>
            <CheckCircle size={14} />
            Backend connected
          </div>
        )}

        {/* Active model pill */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 12px',
          background: activeModel ? 'var(--green-light)' : '#f3f4f6',
          borderRadius: 99,
          fontSize: 12,
          fontWeight: 500,
          color: activeModel ? 'var(--green-dark)' : 'var(--text-muted)',
          border: `1px solid ${activeModel ? 'var(--green-mid)' : 'var(--border)'}`,
          fontFamily: activeModel ? 'var(--font-mono)' : 'var(--font)',
          maxWidth: 220,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          <span style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: activeModel ? 'var(--green)' : '#d1d5db',
            flexShrink: 0,
          }} />
          {activeModel || 'No model active'}
        </div>
      </div>
    </header>
  )
}
