/**
 * MS-PlateNet - Sidebar Navigation
 */

import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Cpu, ScanLine,
  Settings, Fuel, Video, X,
} from 'lucide-react'
import { useApp } from '../../hooks/useAppContext'

const NAV_ITEMS = [
  { to: '/',          label: 'Dashboard',       icon: LayoutDashboard },
  { to: '/models',    label: 'Model Manager',    icon: Cpu },
  { to: '/inference', label: 'Inference Tester', icon: ScanLine },
  { to: '/pump',      label: 'Pump Simulation',   icon: Fuel },
  { to: '/recordings', label: 'Recording Archive', icon: Video },
  { to: '/settings',  label: 'Settings',          icon: Settings },
]

export default function Sidebar({ onClose }) {
  const { activeModel } = useApp()

  return (
    <aside style={{
      width: 'var(--sidebar-width)',
      background: 'var(--surface)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
    }}>
      {/* Logo + close button */}
      <div style={{
        padding: '16px 16px 14px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img
            src="/icon-192.png"
            alt="MS-PlateNet"
            style={{ width: 50, height: 50, borderRadius: 8, objectFit: 'contain' }}
          />
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
              MS-PlateNet
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500 }}>
              LPR Dashboard
            </div>
          </div>
        </div>
        {/* Close button — mobile only visual, always rendered */}
        {onClose && (
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: 4, display: 'flex', alignItems: 'center',
            color: 'var(--text-muted)',
          }}>
            <X size={18} />
          </button>
        )}
      </div>

      {/* Nav links */}
      <nav style={{ flex: 1, padding: '10px 10px' }}>
        <div className="section-title" style={{ padding: '8px 10px 4px' }}>Navigation</div>
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            onClick={onClose}
            style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 12px', borderRadius: 'var(--radius)', marginBottom: 2,
              fontWeight: isActive ? 600 : 400,
              color: isActive ? 'var(--green-dark)' : 'var(--text-secondary)',
              background: isActive ? 'var(--green-light)' : 'transparent',
              fontSize: 13, transition: 'all 0.12s ease', textDecoration: 'none',
            })}
          >
            {({ isActive }) => (
              <>
                <Icon size={16} strokeWidth={isActive ? 2.2 : 1.8} />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Active model */}
      <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border)', background: 'var(--border-light)' }}>
        <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>
          Active Model
        </div>
        {activeModel ? (
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--green-dark)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {activeModel}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>None selected</div>
        )}
      </div>
    </aside>
  )
}
