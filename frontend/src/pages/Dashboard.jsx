/**
 * MS-PlateNet - Dashboard Page
 * Summary overview of system state.
 */

import { Cpu, ScanLine, Camera, CheckCircle, AlertCircle, ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useApp } from '../hooks/useAppContext'

function StatCard({ label, value, sub, accent, icon: Icon }) {
  return (
    <div className="card" style={{ padding: '18px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          background: accent ? 'var(--green-light)' : '#f3f4f6',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <Icon size={18} color={accent ? 'var(--green)' : 'var(--text-muted)'} />
        </div>
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', marginBottom: 2 }}>
        {value}
      </div>
      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function QuickLink({ to, title, description, icon: Icon }) {
  return (
    <Link to={to} style={{ textDecoration: 'none' }}>
      <div className="card" style={{
        padding: '16px 18px',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        cursor: 'pointer',
        transition: 'border-color 0.15s, box-shadow 0.15s',
      }}
        onMouseEnter={e => {
          e.currentTarget.style.borderColor = 'var(--green)'
          e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,161,156,0.12)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.borderColor = 'var(--border)'
          e.currentTarget.style.boxShadow = 'var(--shadow-sm)'
        }}
      >
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: 'var(--green-light)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Icon size={20} color="var(--green)" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{title}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{description}</div>
        </div>
        <ArrowRight size={16} color="var(--text-muted)" />
      </div>
    </Link>
  )
}

export default function Dashboard() {
  const { models, activeModel, error } = useApp()

  return (
    <div style={{ maxWidth: 900 }}>
      {/* Page header */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>System Overview</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
          MS-PlateNet — License Plate Recognition Inference Dashboard (FYP)
        </p>
      </div>

      {/* Backend alert */}
      {error && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px',
          background: '#fff5f5',
          border: '1px solid #fecaca',
          borderRadius: 'var(--radius)',
          marginBottom: 20,
          fontSize: 13,
          color: 'var(--danger)',
        }}>
          <AlertCircle size={15} />
          {error}
        </div>
      )}

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        <StatCard
          label="Uploaded Models"
          value={models.length}
          sub=".pt files on server"
          icon={Cpu}
          accent={models.length > 0}
        />
        <StatCard
          label="Active Model"
          value={activeModel ? '1' : '—'}
          sub={activeModel || 'None selected'}
          icon={CheckCircle}
          accent={!!activeModel}
        />
        <StatCard
          label="Inference Mode"
          value={activeModel ? 'Ready' : 'Idle'}
          sub="Image / Video / Webcam"
          icon={ScanLine}
          accent={!!activeModel}
        />
      </div>

      {/* Quick nav */}
      <div className="section-title">Quick Navigation</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 28 }}>
        <QuickLink
          to="/models"
          icon={Cpu}
          title="Model Manager"
          description="Upload and manage your .pt model files"
        />
        <QuickLink
          to="/inference"
          icon={ScanLine}
          title="Inference Tester"
          description="Test models on images or video files"
        />
        <QuickLink
          to="/camera"
          icon={Camera}
          title="Live Camera"
          description="Real-time webcam plate recognition"
        />
      </div>

      {/* About */}
      <div className="card" style={{ padding: '18px 20px' }}>
        <div className="section-title">About this Project</div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
          <p style={{ marginBottom: 8 }}>
            <strong style={{ color: 'var(--text-primary)' }}>MS-PlateNet</strong> is a Final Year Project license plate
            recognition inference dashboard. It allows you to upload trained <code style={{ fontFamily: 'var(--font-mono)', background: 'var(--bg)', padding: '1px 5px', borderRadius: 4 }}>.pt</code> model
            weights and run inference on images, video clips, or a live webcam feed.
          </p>
          <p>
            The backend is built with <strong style={{ color: 'var(--text-primary)' }}>FastAPI</strong> (Python) and
            structured to accept real YOLO/PyTorch inference once the models are ready.
            The frontend is built with <strong style={{ color: 'var(--text-primary)' }}>React + Vite</strong>.
          </p>
        </div>
        <div className="divider" />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['React + Vite', 'FastAPI', 'Python', 'YOLO', 'FYP 2026'].map(tag => (
            <span key={tag} className="tag tag-gray">{tag}</span>
          ))}
        </div>
      </div>
    </div>
  )
}
