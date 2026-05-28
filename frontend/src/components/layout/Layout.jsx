/**
 * MS-PlateNet - Main Layout
 * Wraps all pages with Sidebar + Topbar.
 */

import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Topbar from './Topbar'

export default function Layout() {
  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <Sidebar />

      <div style={{
        marginLeft: 'var(--sidebar-width)',
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}>
        <Topbar />

        <main style={{
          marginTop: 'var(--topbar-height)',
          flex: 1,
          overflowY: 'auto',
          padding: '24px',
          background: 'var(--bg)',
        }}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
