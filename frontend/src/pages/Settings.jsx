/**
 * MS-PlateNet - Settings Page
 * Configure Telegram bot token and chat ID.
 */

import { useState, useEffect } from 'react'
import { Bell, Save, CheckCircle, AlertCircle, HelpCircle } from 'lucide-react'
import api from '../utils/api'

export default function Settings() {
  const [botToken,  setBotToken]  = useState('')
  const [chatId,    setChatId]    = useState('')
  const [status,    setStatus]    = useState(null)  // 'ok' | 'error' | null
  const [message,   setMessage]   = useState('')
  const [loading,   setLoading]   = useState(false)
  const [configured, setConfigured] = useState(false)

  useEffect(() => {
    api.get('/alerts/status').then(res => {
      setConfigured(res.data.configured)
    }).catch(() => {})
  }, [])

  async function handleSave() {
    if (!botToken.trim() || !chatId.trim()) {
      setStatus('error')
      setMessage('Please fill in both Bot Token and Chat ID.')
      return
    }
    setLoading(true)
    setStatus(null)
    try {
      await api.post('/alerts/configure', { bot_token: botToken, chat_id: chatId })
      setStatus('ok')
      setMessage('Telegram configured successfully! Alerts will be sent when Singapore plates are detected.')
      setConfigured(true)
    } catch (err) {
      setStatus('error')
      setMessage(err.response?.data?.detail || 'Failed to save configuration.')
    } finally {
      setLoading(false)
    }
  }

  async function handleTest() {
    setLoading(true)
    setStatus(null)
    try {
      await api.post('/alerts/send', {
        plate_text: 'SJP9988',
        country: 'Singapore',
        confidence: 0.95,
        inference_time_ms: 45.2,
        timestamp: new Date().toLocaleString('ms-MY'),
        crop_base64: null,
      })
      setStatus('ok')
      setMessage('Test alert sent! Check your Telegram.')
    } catch (err) {
      setStatus('error')
      setMessage(err.response?.data?.detail || 'Failed to send test alert.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 1500, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Settings</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
          Configure Telegram alerts for Singapore plate detections.
        </p>
      </div>

      {/* Telegram config card */}
      <div className="card" style={{ padding: 24, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--green-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Bell size={18} color="var(--green)" />
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Telegram Alert Bot</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Status: {configured
                ? <span style={{ color: 'var(--green)', fontWeight: 600 }}>✓ Configured</span>
                : <span style={{ color: 'var(--text-muted)' }}>Not configured</span>}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
              Bot Token
            </label>
            <input
              type="password"
              value={botToken}
              onChange={e => setBotToken(e.target.value)}
              placeholder="1234567890:ABCdefGHIjklMNOpqrSTUvwxYZ"
              style={{
                width: '100%', padding: '9px 12px',
                border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                fontSize: 13, fontFamily: 'var(--font-mono)',
                outline: 'none',
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
              Chat ID
            </label>
            <input
              type="text"
              value={chatId}
              onChange={e => setChatId(e.target.value)}
              placeholder="-1001234567890 or 123456789"
              style={{
                width: '100%', padding: '9px 12px',
                border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                fontSize: 13, fontFamily: 'var(--font-mono)',
                outline: 'none',
              }}
            />
          </div>

          {status && (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 8,
              padding: '10px 12px', borderRadius: 'var(--radius)',
              background: status === 'ok' ? 'var(--green-light)' : 'var(--danger-light)',
              border: `1px solid ${status === 'ok' ? 'var(--green-mid)' : '#fecaca'}`,
              fontSize: 13,
              color: status === 'ok' ? 'var(--green-dark)' : 'var(--danger)',
            }}>
              {status === 'ok' ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
              {message}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={loading}
              style={{ flex: 1, justifyContent: 'center' }}
            >
              <Save size={14} />
              {loading ? 'Saving…' : 'Save Configuration'}
            </button>
            <button
              className="btn btn-outline"
              onClick={handleTest}
              disabled={loading || !configured}
              style={{ flex: 1, justifyContent: 'center' }}
            >
              Send Test Alert
            </button>
          </div>
        </div>
      </div>

      {/* How to setup guide */}
      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <HelpCircle size={15} color="var(--green)" />
          <span style={{ fontWeight: 600, fontSize: 13 }}>How to set up Telegram Bot</span>
        </div>
        <ol style={{ paddingLeft: 18, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 2 }}>
          <li>Open Telegram → search <strong>@BotFather</strong> → send <code style={{ background: 'var(--bg)', padding: '1px 5px', borderRadius: 4 }}>/newbot</code></li>
          <li>Give your bot a name e.g. <strong>MS-PlateNet Alert</strong></li>
          <li>BotFather gives you a <strong>Bot Token</strong> — copy it above</li>
          <li>Search <strong>@userinfobot</strong> on Telegram → send any message → it replies with your <strong>Chat ID</strong></li>
          <li>Paste both above → click <strong>Save Configuration</strong></li>
          <li>Click <strong>Send Test Alert</strong> to verify it works</li>
        </ol>
        <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--green-light)', borderRadius: 'var(--radius)', fontSize: 12, color: 'var(--green-dark)' }}>
          💡 For a group chat, add your bot to the group, then use the group's Chat ID (starts with -100...)
        </div>
      </div>
    </div>
  )
}
