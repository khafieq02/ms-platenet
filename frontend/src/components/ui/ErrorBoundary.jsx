/**
 * MS-PlateNet - Error Boundary
 * Catches React render errors and shows a friendly message instead of blank page.
 */

import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          height: '100vh', background: '#f4f6f8', flexDirection: 'column', gap: 12, padding: 32,
        }}>
          <div style={{
            background: 'white', border: '1px solid #e2e6ea', borderRadius: 12,
            padding: '28px 32px', maxWidth: 540, width: '100%',
          }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#1a1d21', marginBottom: 8 }}>
              ⚠ Something went wrong
            </div>
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 16, lineHeight: 1.6 }}>
              The app crashed on startup. This is usually a missing package or import error.
            </div>
            <pre style={{
              background: '#f4f6f8', borderRadius: 8, padding: '10px 14px',
              fontSize: 11, color: '#e53e3e', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
              border: '1px solid #fecaca',
            }}>
              {this.state.error.toString()}
            </pre>
            <div style={{ marginTop: 16, fontSize: 12, color: '#9ca3af' }}>
              Check the browser console (F12) for the full error trace.
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
