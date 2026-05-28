/**
 * MS-PlateNet - Settings Page (placeholder)
 * Future: model config, confidence threshold, country filter, etc.
 */

import { Settings, Sliders, Globe, Cpu } from 'lucide-react'

function SettingRow({ icon: Icon, label, description, control }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      padding: '14px 0',
      borderBottom: '1px solid var(--border)',
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 8,
        background: 'var(--green-light)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Icon size={17} color="var(--green)" />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{description}</div>
      </div>
      {control}
    </div>
  )
}

export default function SettingsPage() {
  return (
    <div style={{ maxWidth: 680 }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Settings</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
          Configuration options for inference and display behaviour.
        </p>
      </div>

      <div className="card" style={{ padding: '4px 20px 8px' }}>
        <SettingRow
          icon={Sliders}
          label="Confidence Threshold"
          description="Minimum confidence to show a detection result"
          control={
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="range" min={0} max={100} defaultValue={50}
                style={{ width: 100, accentColor: 'var(--green)' }}
              />
              <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', width: 36, textAlign: 'right' }}>0.50</span>
            </div>
          }
        />
        <SettingRow
          icon={Globe}
          label="Country Filter"
          description="Only show results for a specific country"
          control={
            <select style={{
              fontSize: 12, padding: '5px 10px',
              border: '1px solid var(--border)', borderRadius: 'var(--radius)',
              background: 'white', color: 'var(--text-primary)',
            }}>
              <option value="">All Countries</option>
              <option value="Malaysia">Malaysia 🇲🇾</option>
              <option value="Singapore">Singapore 🇸🇬</option>
              <option value="Unknown">Unknown</option>
            </select>
          }
        />
        <SettingRow
          icon={Cpu}
          label="Auto-Capture Interval"
          description="How often live camera sends a frame (seconds)"
          control={
            <select style={{
              fontSize: 12, padding: '5px 10px',
              border: '1px solid var(--border)', borderRadius: 'var(--radius)',
              background: 'white',
            }}>
              <option value={1}>1s</option>
              <option value={2} selected>2s</option>
              <option value={5}>5s</option>
              <option value={10}>10s</option>
            </select>
          }
        />
      </div>

      <div className="card" style={{ padding: 16, marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Settings size={14} color="var(--text-muted)" />
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Note</span>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7 }}>
          Settings on this page are UI placeholders for future implementation.
          Once connected to real inference, these values will be passed to the FastAPI backend.
        </p>
      </div>
    </div>
  )
}
