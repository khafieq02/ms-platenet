/**
 * MS-PlateNet - Main Layout
 * Mobile-responsive: sidebar hidden by default on small screens,
 * toggled by hamburger button in topbar.
 */

import { useState, useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Topbar from './Topbar'

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)

  useEffect(() => {
    const handler = () => {
      const mobile = window.innerWidth < 768
      setIsMobile(mobile)
      if (!mobile) setSidebarOpen(false)
    }
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  // Close sidebar when clicking outside on mobile
  function handleOverlayClick() {
    setSidebarOpen(false)
  }

  return (
    <div style={{ display: 'flex', height: '100vh' }}>

      {/* Mobile overlay */}
      {isMobile && sidebarOpen && (
        <div onClick={handleOverlayClick} style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.4)',
          zIndex: 99,
        }}/>
      )}

      {/* Sidebar */}
      <div style={{
        position: 'fixed',
        left: isMobile ? (sidebarOpen ? 0 : '-100%') : 0,
        top: 0,
        zIndex: 100,
        transition: 'left 0.25s ease',
        height: '100vh',
      }}>
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </div>

      {/* Main content */}
      <div style={{
        marginLeft: isMobile ? 0 : 'var(--sidebar-width)',
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        width: '100%',
      }}>
        <Topbar
          isMobile={isMobile}
          onMenuClick={() => setSidebarOpen(o => !o)}
        />

        <main style={{
          marginTop: 'var(--topbar-height)',
          flex: 1,
          overflowY: 'auto',
          padding: isMobile ? '16px 12px' : '24px',
          background: 'var(--bg)',
        }}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
