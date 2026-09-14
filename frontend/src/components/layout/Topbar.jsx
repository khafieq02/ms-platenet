/**
 * MS-PlateNet - Topbar
 * Shows hamburger menu on mobile.
 */

import { useLocation } from 'react-router-dom'
import { CheckCircle, AlertCircle, Menu } from 'lucide-react'
import { useApp } from '../../hooks/useAppContext'

const PAGE_TITLES = {
  '/':          'Dashboard',
  '/models':    'Model Manager',
  '/inference': 'Inference Tester',
  '/camera':    'Live Camera',
  '/pump':      'Pump Simulation',
  '/recordings': 'Recording Archive',
  '/settings':  'Settings',
}

export default function Topbar({ isMobile, onMenuClick }) {
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
      padding: '0 16px',
      position: 'fixed',
      top: 0,
      left: isMobile ? 0 : 'var(--sidebar-width)',
      right: 0,
      zIndex: 99,
      gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* Hamburger — mobile only */}
        {isMobile && (
          <button onClick={onMenuClick} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: 4, display: 'flex', alignItems: 'center',
          }}>
            <Menu size={22} color="var(--text-primary)" />
          </button>
        )}
        <h1 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
          {title}
        </h1>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        {/* Backend status */}
        {error ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--danger)' }}>
            <AlertCircle size={13} /> {!isMobile && 'Backend offline'}
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--green)' }}>
            <CheckCircle size={13} /> {!isMobile && 'Backend connected'}
          </div>
        )}

        {/* Active model pill */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '3px 10px',
          background: activeModel ? 'var(--green-light)' : '#f3f4f6',
          borderRadius: 99, fontSize: 11, fontWeight: 500,
          color: activeModel ? 'var(--green-dark)' : 'var(--text-muted)',
          border: `1px solid ${activeModel ? 'var(--green-mid)' : 'var(--border)'}`,
          fontFamily: activeModel ? 'var(--font-mono)' : 'var(--font)',
          maxWidth: isMobile ? 100 : 200,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
            background: activeModel ? 'var(--green)' : '#d1d5db',
          }}/>
          {activeModel ? activeModel : 'No model'}
        </div>
      </div>
    </header>
  )
}
