/**
 * MS-PlateNet - Dashboard
 * Analytics: line chart (hourly) + bar chart (day of week) side by side
 */
import { useEffect, useState, useRef, useCallback } from 'react'
import { Cpu, ScanLine, CheckCircle, AlertCircle, ArrowRight, Fuel, Settings, Shield, Lock, Video } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useApp } from '../hooks/useAppContext'
import api from '../utils/api'

// ── Hourly Line Chart (SVG) ───────────────────────────────────────────────────
function HourlyLineChart({ data }) {
  const [tooltip, setTooltip] = useState(null)
  const svgRef = useRef(null)

  if (!data || data.length === 0) return (
    <div style={{ textAlign:'center', padding:'40px 0', color:'var(--text-muted)', fontSize:13 }}>
      No data yet
    </div>
  )

  const W = 460, H = 160
  const padL = 28, padR = 16, padT = 20, padB = 32
  const chartW = W - padL - padR
  const chartH = H - padT - padB
  const maxVal = Math.max(...data.map(d => d.count), 1)
  const peakItem = data.reduce((a,b) => b.count > a.count ? b : a, data[0])

  // Build SVG points
  const pts = data.map((d,i) => ({
    x: padL + (i / (data.length-1)) * chartW,
    y: padT + chartH - (d.count / maxVal) * chartH,
    ...d
  }))

  const linePath = pts.map((p,i) => `${i===0?'M':'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const areaPath = linePath + ` L${pts[pts.length-1].x},${padT+chartH} L${pts[0].x},${padT+chartH} Z`

  // X-axis labels every 4 hours
  const xLabels = data.filter(d => d.hour % 4 === 0)

  function handleMouseMove(e) {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const mouseX = (e.clientX - rect.left) * (W / rect.width)
    // Find nearest point
    let nearest = pts[0], minDist = Infinity
    for (const p of pts) {
      const dist = Math.abs(p.x - mouseX)
      if (dist < minDist) { minDist = dist; nearest = p }
    }
    if (minDist < 30) setTooltip(nearest)
    else setTooltip(null)
  }

  return (
    <div>
      <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between', marginBottom:4 }}>
        <div style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)',
          textTransform:'uppercase', letterSpacing:'0.06em' }}>By Hour of Day</div>
      </div>
      <div style={{ position:'relative', userSelect:'none' }}>
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} style={{ width:'100%', height:'auto', display:'block', overflow:'visible' }}
          onMouseMove={handleMouseMove} onMouseLeave={() => setTooltip(null)}>
          <defs>
            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#00A19C" stopOpacity="0.18"/>
              <stop offset="100%" stopColor="#00A19C" stopOpacity="0.01"/>
            </linearGradient>
          </defs>

          {/* Y grid lines */}
          {[0.25,0.5,0.75,1].map(f => (
            <line key={f}
              x1={padL} y1={padT + chartH*(1-f)}
              x2={padL+chartW} y2={padT + chartH*(1-f)}
              stroke="#f0f0f0" strokeWidth="1"/>
          ))}

          {/* Area fill */}
          <path d={areaPath} fill="url(#areaGrad)"/>

          {/* Line */}
          <path d={linePath} fill="none" stroke="#00A19C" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>

          {/* Peak dot */}
          {peakItem.count > 0 && (() => {
            const p = pts.find(p => p.hour === peakItem.hour)
            return p ? (
              <g>
                <circle cx={p.x} cy={p.y} r="5" fill="#00A19C"/>
                <circle cx={p.x} cy={p.y} r="3" fill="white"/>
              </g>
            ) : null
          })()}

          {/* Tooltip vertical line */}
          {tooltip && (
            <line x1={tooltip.x} y1={padT} x2={tooltip.x} y2={padT+chartH}
              stroke="#ccc" strokeWidth="1" strokeDasharray="4,3"/>
          )}

          {/* Hover dot */}
          {tooltip && (
            <circle cx={tooltip.x} cy={tooltip.y} r="4" fill="#00A19C"/>
          )}

          {/* X-axis labels */}
          {xLabels.map(d => {
            const p = pts.find(p => p.hour === d.hour)
            if (!p) return null
            const label = d.hour === 0 ? 'am' : d.hour < 12 ? `${d.hour}am` : d.hour === 12 ? '12pm' : `${d.hour-12}pm`
            return (
              <text key={d.hour} x={p.x} y={H-6} textAnchor="middle"
                fontSize="10" fill="#9ca3af" fontFamily="DM Sans, sans-serif">
                {label}
              </text>
            )
          })}
        </svg>

        {/* Tooltip popup */}
        {tooltip && (
          <div style={{
            position:'absolute',
            left: `${(tooltip.x / W) * 100}%`,
            top: `${((tooltip.y - padT) / (H - padT - padB)) * 60}%`,
            transform: tooltip.hour > 18 ? 'translate(-110%, -50%)' : 'translate(10%, -50%)',
            background:'#1a1a1a', color:'white', padding:'8px 12px', borderRadius:8,
            fontSize:12, pointerEvents:'none', zIndex:10, minWidth:110,
            boxShadow:'0 4px 16px rgba(0,0,0,0.2)',
          }}>
            <div style={{ fontWeight:700, marginBottom:2 }}>
              {tooltip.hour === 0 ? '12am'
                : tooltip.hour < 12 ? `${tooltip.hour}am`
                : tooltip.hour === 12 ? '12pm'
                : `${tooltip.hour-12}pm`}
            </div>
            <div style={{ color:'#00D4CC', fontWeight:700, fontSize:14 }}>
              {tooltip.count} vehicle{tooltip.count!==1?'s':''}
            </div>
            <div style={{ color:'#aaa', fontSize:10, marginTop:2 }}>Singapore detected</div>
          </div>
        )}
      </div>

      {/* Peak annotation */}
      {peakItem.count > 0 && (
        <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:4 }}>
          Peak hour: <strong style={{ color:'var(--green-dark)' }}>
            {peakItem.hour === 0 ? '12am'
              : peakItem.hour < 12 ? `${peakItem.hour}am`
              : peakItem.hour === 12 ? '12pm'
              : `${peakItem.hour-12}pm`}
          </strong> — {peakItem.count} SG RON97 vehicle{peakItem.count!==1?'s':''}
        </div>
      )}
    </div>
  )
}

// ── Day of Week Bar Chart ─────────────────────────────────────────────────────
function DayOfWeekChart({ data }) {
  const [hovered, setHovered] = useState(null)

  if (!data || data.length === 0) return (
    <div style={{ textAlign:'center', padding:'40px 0', color:'var(--text-muted)', fontSize:13 }}>
      No data yet
    </div>
  )

  const maxVal = Math.max(...data.map(d => d.count), 1)
  const bestDay = data.reduce((a,b) => b.count > a.count ? b : a, data[0])

  return (
    <div>
      <div style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)',
        textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:12 }}>
        By Day of Week (SG RON97 only)
      </div>
      <div style={{ display:'flex', alignItems:'flex-end', gap:8, height:140 }}>
        {data.map(d => {
          const barH = Math.max((d.count/maxVal)*110, d.count>0?8:2)
          const isBest = d.dow === bestDay.dow && bestDay.count > 0
          const isHovered = hovered === d.dow
          return (
            <div key={d.day} style={{ flex:1, display:'flex', flexDirection:'column',
              alignItems:'center', gap:4, cursor:'default' }}
              onMouseEnter={() => setHovered(d.dow)}
              onMouseLeave={() => setHovered(null)}>
              {/* Count label */}
              {(isBest || isHovered) && d.count > 0 && (
                <div style={{ fontSize:10, fontWeight:700,
                  color: isBest ? '#e65100' : 'var(--text-muted)',
                  whiteSpace:'nowrap' }}>
                  {d.count}
                </div>
              )}
              {!(isBest || isHovered) && <div style={{ height:14 }}/>}
              {/* Bar */}
              <div style={{
                width:'100%', borderRadius:'4px 4px 0 0',
                height:`${barH}px`,
                background: isBest ? '#e65100' : isHovered ? '#3b82f6' : '#3b82f6',
                opacity: isBest ? 1 : isHovered ? 0.9 : 0.7,
                transition:'all 0.2s ease',
              }}/>
              {/* Day label */}
              <div style={{ fontSize:10, color: isBest ? '#e65100' : 'var(--text-muted)',
                fontWeight: isBest ? 700 : 400, marginTop:2 }}>
                {d.day}
              </div>
            </div>
          )
        })}
      </div>

      {/* Best day annotation */}
      {bestDay.count > 0 && (
        <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:8 }}>
          Best day: <strong style={{ color:'#e65100' }}>{bestDay.day}</strong> — {bestDay.count} SG RON97 vehicle{bestDay.count!==1?'s':''}
        </div>
      )}
    </div>
  )
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, accent, danger, warning, icon: Icon }) {
  return (
    <div className="card" style={{ padding:'18px 20px' }}>
      <div style={{ marginBottom:12 }}>
        <div style={{
          width:36, height:36, borderRadius:8,
          background:danger?'#fff1f1':warning?'#fffbeb':accent?'var(--green-light)':'#f3f4f6',
          display:'flex', alignItems:'center', justifyContent:'center',
        }}>
          <Icon size={18} color={danger?'#e53e3e':warning?'#d97706':accent?'var(--green)':'var(--text-muted)'}/>
        </div>
      </div>
      <div style={{ fontSize:26, fontWeight:700, fontFamily:'var(--font-mono)', marginBottom:2,
        color:danger?'#e53e3e':warning?'#d97706':'var(--text-primary)' }}>
        {value}
      </div>
      <div style={{ fontSize:13, fontWeight:500, color:'var(--text-primary)' }}>{label}</div>
      {sub && <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2 }}>{sub}</div>}
    </div>
  )
}

// ── Vehicle Breakdown ─────────────────────────────────────────────────────────
function BreakdownChart({ malaysia, sgRon97, sgBlocked }) {
  const total  = malaysia + sgRon97 + sgBlocked || 1
  const maxVal = Math.max(malaysia, sgRon97, sgBlocked, 1)
  const bars = [
    { label:'🇲🇾 Malaysia',   value:malaysia,  color:'#00A19C', pct:Math.round(malaysia /total*100) },
    { label:'🇸🇬 SG RON97',  value:sgRon97,   color:'#3b82f6', pct:Math.round(sgRon97  /total*100) },
    { label:'🇸🇬 SG Blocked', value:sgBlocked, color:'#e53e3e', pct:Math.round(sgBlocked/total*100) },
  ]
  return (
    <div>
      <div style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)',
        textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:14 }}>
        Vehicle Breakdown — All Time
      </div>
      <div style={{ display:'flex', alignItems:'flex-end', gap:12, height:100, marginBottom:10 }}>
        {bars.map(bar => (
          <div key={bar.label} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
            <div style={{ fontSize:13, fontWeight:700, color:bar.color, fontFamily:'var(--font-mono)' }}>{bar.value}</div>
            <div style={{ width:'100%', borderRadius:'5px 5px 0 0',
              height:`${Math.max((bar.value/maxVal)*80, bar.value>0?8:2)}px`,
              background:bar.color, opacity:0.85, transition:'height 0.5s ease' }}/>
          </div>
        ))}
      </div>
      <div style={{ display:'flex', gap:12, marginBottom:12 }}>
        {bars.map(bar => (
          <div key={bar.label} style={{ flex:1, textAlign:'center', fontSize:10, color:'var(--text-muted)', fontWeight:600 }}>
            {bar.label}
          </div>
        ))}
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
        {bars.map(bar => (
          <div key={bar.label}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
              <span style={{ fontSize:11, color:'var(--text-secondary)' }}>{bar.label}</span>
              <span style={{ fontSize:11, fontFamily:'var(--font-mono)', fontWeight:600, color:bar.color }}>
                {bar.value} <span style={{ color:'var(--text-muted)', fontWeight:400 }}>({bar.pct}%)</span>
              </span>
            </div>
            <div style={{ height:5, background:'#f0f0f0', borderRadius:99, overflow:'hidden' }}>
              <div style={{ width:`${bar.pct}%`, height:'100%', background:bar.color, borderRadius:99, transition:'width 0.5s ease' }}/>
            </div>
          </div>
        ))}
        <div style={{ borderTop:'1px solid var(--border)', paddingTop:8, display:'flex', justifyContent:'space-between' }}>
          <span style={{ fontSize:11, color:'var(--text-muted)' }}>Total</span>
          <span style={{ fontSize:12, fontFamily:'var(--font-mono)', fontWeight:700 }}>{malaysia+sgRon97+sgBlocked}</span>
        </div>
      </div>
    </div>
  )
}

// ── Quick Link ────────────────────────────────────────────────────────────────
function QuickLink({ to, title, description, icon: Icon }) {
  return (
    <Link to={to} style={{ textDecoration:'none' }}>
      <div className="card" style={{ padding:'16px 18px', display:'flex', alignItems:'center',
        gap:14, cursor:'pointer', transition:'border-color 0.15s, box-shadow 0.15s' }}
        onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--green)';e.currentTarget.style.boxShadow='0 2px 8px rgba(0,161,156,0.12)'}}
        onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border)';e.currentTarget.style.boxShadow='var(--shadow-sm)'}}>
        <div style={{ width:40, height:40, borderRadius:10, background:'var(--green-light)',
          display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          <Icon size={20} color="var(--green)"/>
        </div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:13, fontWeight:600, marginBottom:2 }}>{title}</div>
          <div style={{ fontSize:12, color:'var(--text-secondary)' }}>{description}</div>
        </div>
        <ArrowRight size={16} color="var(--text-muted)"/>
      </div>
    </Link>
  )
}

// ── Last Detection ────────────────────────────────────────────────────────────
function LastDetected({ det }) {
  if (!det) return (
    <div className="card" style={{ padding:'18px 20px' }}>
      <div className="section-title" style={{ marginBottom:10 }}>Last Detection</div>
      <div style={{ fontSize:13, color:'var(--text-muted)', textAlign:'center', padding:'12px 0' }}>
        No detections yet — start Pump Simulation
      </div>
    </div>
  )
  const isSG = det.country === 'Singapore'
  const isMY = det.country === 'Malaysia'
  const fuelColor = det.fuel_type==='Blocked'?'#e53e3e':det.fuel_type==='RON97'?'#3b82f6':'#00A19C'
  const fuelBg    = det.fuel_type==='Blocked'?'#fff1f1':det.fuel_type==='RON97'?'#eff6ff':'#e6f7f7'
  return (
    <div className="card" style={{ padding:'18px 20px' }}>
      <div className="section-title" style={{ marginBottom:12 }}>Last Detection — Pump Simulation</div>
      <div style={{ display:'flex', alignItems:'center', gap:14 }}>
        <div style={{ width:48, height:48, borderRadius:12, flexShrink:0,
          background:isSG?'#fff1f1':isMY?'#e6f7f7':'#f3f4f6',
          display:'flex', alignItems:'center', justifyContent:'center', fontSize:26 }}>
          {isMY?'🇲🇾':isSG?'🇸🇬':'❓'}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:22, fontWeight:700, fontFamily:'var(--font-mono)', letterSpacing:'0.08em',
            color:isSG?'#e53e3e':isMY?'var(--green-dark)':'var(--text-primary)',
            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {det.plate_text||'—'}
          </div>
          <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>
            {det.country} · {det.pump_id||'Pump 1'}
          </div>
        </div>
        <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:6, flexShrink:0 }}>
          <span style={{ padding:'3px 10px', borderRadius:99, fontSize:11, fontWeight:700,
            background:fuelBg, color:fuelColor, border:`1px solid ${fuelColor}33` }}>
            {det.fuel_type==='Blocked'?'🔒':'⛽'} {det.fuel_type||'—'}
          </span>
          <span style={{ fontSize:11, color:'var(--text-muted)' }}>
            {det.timestamp?det.timestamp.split(',')[1]?.trim():'—'}
          </span>
        </div>
      </div>
    </div>
  )
}

// ── Recent Table ──────────────────────────────────────────────────────────────
function RecentTable({ detections }) {
  if (!detections || detections.length === 0) return (
    <div style={{ textAlign:'center', padding:'20px 0', color:'var(--text-muted)', fontSize:13 }}>
      No detections yet.
    </div>
  )
  return (
    <div style={{ overflowX:'auto' }}>
      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
        <thead>
          <tr style={{ background:'var(--bg)', borderBottom:'2px solid var(--border)' }}>
            {['Time','Plate','Country','Status','Pump'].map(h => (
              <th key={h} style={{ padding:'7px 10px', textAlign:'left', fontSize:11,
                fontWeight:600, color:'var(--text-muted)', textTransform:'uppercase' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {detections.slice(0,10).map((d,i) => (
            <tr key={i} style={{ borderBottom:'1px solid var(--border-light)',
              background:d.fuel_type==='Blocked'?'#fff8f8':'white' }}>
              <td style={{ padding:'7px 10px', color:'var(--text-muted)', fontSize:11, whiteSpace:'nowrap' }}>
                {d.timestamp?d.timestamp.split(',')[1]?.trim():'—'}
              </td>
              <td style={{ padding:'7px 10px', fontFamily:'var(--font-mono)', fontWeight:600 }}>
                {d.plate_text||'—'}
              </td>
              <td style={{ padding:'7px 10px' }}>
                {d.country==='Malaysia'?'🇲🇾':d.country==='Singapore'?'🇸🇬':'❓'} {d.country}
              </td>
              <td style={{ padding:'7px 10px' }}>
                <span style={{ padding:'2px 8px', borderRadius:99, fontSize:11, fontWeight:600,
                  background:d.fuel_type==='Blocked'?'#fff1f1':d.fuel_type==='RON97'?'#eff6ff':'#e6f7f7',
                  color:d.fuel_type==='Blocked'?'#e53e3e':d.fuel_type==='RON97'?'#3b82f6':'#00A19C' }}>
                  {d.fuel_type==='Blocked'?'🔒':'⛽'} {d.fuel_type||'—'}
                </span>
              </td>
              <td style={{ padding:'7px 10px', color:'var(--text-muted)' }}>{d.pump_id||'Pump 1'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Date Range Filter ────────────────────────────────────────────────────────
function getRange(preset) {
  // Get the real Malaysia date (YYYY-MM-DD) using the browser's Intl API.
  // This is correct regardless of the user's OS timezone setting.
  const now = new Date()
  const myt = new Intl.DateTimeFormat('en-CA', {   // en-CA gives YYYY-MM-DD
    timeZone: 'Asia/Kuala_Lumpur',
  }).format(now)                                    // e.g. "2026-09-02"

  // Build midnight MYT as a UTC Date:
  // "2026-09-02T00:00:00+08:00" → correct UTC equivalent
  const todayMidnightMYT = new Date(myt + 'T00:00:00+08:00')
  const endOfToday       = new Date(todayMidnightMYT.getTime() + 24*60*60*1000 - 1)

  if (preset === 'today') return {
    start: todayMidnightMYT.toISOString(),
    end:   endOfToday.toISOString(),
  }
  if (preset === 'yesterday') {
    const s = new Date(todayMidnightMYT.getTime() - 24*60*60*1000)
    const e = new Date(todayMidnightMYT.getTime() - 1)
    return { start: s.toISOString(), end: e.toISOString() }
  }
  if (preset === 'week') {
    const s = new Date(todayMidnightMYT.getTime() - 6*24*60*60*1000)
    return { start: s.toISOString(), end: endOfToday.toISOString() }
  }
  if (preset === 'month') {
    // First day of current month in MYT
    const parts = myt.split('-')
    const s = new Date(`${parts[0]}-${parts[1]}-01T00:00:00+08:00`)
    return { start: s.toISOString(), end: endOfToday.toISOString() }
  }
  if (preset === 'year') {
    const parts = myt.split('-')
    const s = new Date(`${parts[0]}-01-01T00:00:00+08:00`)
    return { start: s.toISOString(), end: endOfToday.toISOString() }
  }
  return { start: null, end: null } // all time
}

function FilterBar({ active, setActive, customStart, setCustomStart, customEnd, setCustomEnd }) {
  const presets = [
    { key:'all',       label:'All Time' },
    { key:'today',     label:'Today' },
    { key:'yesterday', label:'Yesterday' },
    { key:'week',      label:'This Week' },
    { key:'month',     label:'This Month' },
    { key:'year',      label:'This Year' },
    { key:'custom',    label:'Custom' },
  ]
  return (
    <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap', marginBottom:5 }}>
      {presets.map(p => (
        <button key={p.key} onClick={() => setActive(p.key)}
          style={{
            padding:'5px 12px', borderRadius:99, fontSize:12, fontWeight:500, cursor:'pointer',
            border:'1px solid', transition:'all 0.15s',
            borderColor: active===p.key ? 'var(--green)' : 'var(--border)',
            background:  active===p.key ? 'var(--green-light)' : 'white',
            color:       active===p.key ? 'var(--green-dark)' : 'var(--text-secondary)',
          }}>
          {p.label}
        </button>
      ))}
      {active === 'custom' && (
        <div style={{ display:'flex', alignItems:'center', gap:6, marginLeft:4 }}>
          <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
            style={{ padding:'4px 8px', border:'1px solid var(--border)', borderRadius:6, fontSize:12 }}/>
          <span style={{ fontSize:12, color:'var(--text-muted)' }}>to</span>
          <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
            style={{ padding:'4px 8px', border:'1px solid var(--border)', borderRadius:6, fontSize:12 }}/>
        </div>
      )}
    </div>
  )
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { models, activeModel, error } = useApp()
  const [stats,  setStats]  = useState({ malaysia:0, sg_ron97:0, sg_blocked:0, total:0 })
  const [filterPreset,    setFilterPreset]    = useState('all')
  const [customStart,     setCustomStart]     = useState('')
  const [customEnd,       setCustomEnd]       = useState('')
  const [lastDet,setLastDet]= useState(null)
  const [recent, setRecent] = useState([])
  const [hourly, setHourly] = useState([])
  const [dow,    setDow]    = useState([])

  const getQueryParams = () => {
    if (filterPreset === 'custom') {
      const params = new URLSearchParams()
      if (customStart) params.set('start', new Date(customStart).toISOString())
      if (customEnd)   params.set('end',   new Date(customEnd + 'T23:59:59').toISOString())
      return params.toString() ? '?' + params.toString() : ''
    }
    if (filterPreset === 'all') return ''
    const range = getRange(filterPreset)
    const params = new URLSearchParams()
    if (range.start) params.set('start', range.start)
    if (range.end)   params.set('end',   range.end)
    return '?' + params.toString()
  }

  const fetchAll = useCallback(() => {
    const q = getQueryParams()
    api.get('/detections' + q).then(res => {
      const s = res.data.stats || {}
      setStats({ malaysia:s.malaysia||0, sg_ron97:s.sg_ron97||0, sg_blocked:s.sg_blocked||0, total:s.total||0 })
      const dets = res.data.detections || []
      if (dets.length > 0) setLastDet(dets[0])
      setRecent(dets)
    }).catch(() => {})
    api.get('/detections/hourly' + q).then(res => setHourly(res.data||[])).catch(() => {})
    api.get('/detections/dayofweek' + q).then(res => setDow(res.data||[])).catch(() => {})
  }, [filterPreset, customStart, customEnd])

  useEffect(() => {
    fetchAll()
    const interval = setInterval(fetchAll, 5000)
    return () => clearInterval(interval)
  }, [fetchAll])

  return (
    <div style={{ maxWidth:1400, margin:'0 auto', padding:'10px 10px' }}>
      <div style={{ marginBottom:24 }}>
        <h2 style={{ fontSize:20, fontWeight:700, marginBottom:4 }}>System Overview</h2>
        <p style={{ color:'var(--text-secondary)', fontSize:13 }}>
          MS-PlateNet — Real Time License Plate Detection and Classification of Malaysian and Singaporean Vehicles
        </p>
      </div>

      {error && (
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px',
          background:'#fff5f5', border:'1px solid #fecaca', borderRadius:'var(--radius)',
          marginBottom:20, fontSize:13, color:'var(--danger)' }}>
          <AlertCircle size={15}/> {error}
        </div>
      )}

      {/* System Status */}
      <div className="section-title">System Status</div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(160px, 1fr))', gap:16, marginBottom:24 }}>
        <StatCard label="Uploaded Models"  value={models.length}           sub=".pt files on server"          icon={Cpu}         accent={models.length>0}/>
        <StatCard label="Active Model"     value={activeModel?'1':'—'}     sub={activeModel||'None selected'} icon={CheckCircle} accent={!!activeModel}/>
        <StatCard label="Inference Mode"   value={activeModel?'Ready':'Idle'} sub="Webcam / Image / Video"   icon={ScanLine}    accent={!!activeModel}/>
      </div>

      {/* Detection Stats */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'flex-start', flexWrap:'wrap', gap:20, marginBottom:10 }}>
        <div className="section-title" style={{ margin:0 }}>Detection Statistics — Pump Simulation</div>
        <FilterBar
          active={filterPreset} setActive={setFilterPreset}
          customStart={customStart} setCustomStart={setCustomStart}
          customEnd={customEnd} setCustomEnd={setCustomEnd}
        />
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(160px, 1fr))', gap:16, marginBottom:24 }}>
        <StatCard label="Malaysia Detected" value={stats.malaysia}   sub="🇲🇾 Allowed"       icon={CheckCircle} accent={stats.malaysia>0}/>
        <StatCard label="SG — RON97"        value={stats.sg_ron97}   sub="🇸🇬 Allowed fuel"  icon={Fuel}        warning={stats.sg_ron97>0}/>
        <StatCard label="SG — Blocked"      value={stats.sg_blocked} sub="🇸🇬 RON95 locked"  icon={Lock}        danger={stats.sg_blocked>0}/>
        <StatCard label="Total Events"      value={stats.total}      sub="From pump simulation" icon={Shield}   accent={stats.total>0}/>
      </div>

      {/* Last Detection */}
      <div style={{ marginBottom:24 }}>
        <LastDetected det={lastDet}/>
      </div>

      {/* SG Patterns — line + bar side by side */}
      <div className="section-title">SG RON97 Vehicle Patterns</div>
      <div className="card" style={{ padding:'20px 24px', marginBottom:24 }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:32 }}>
          <HourlyLineChart data={hourly}/>
          <div style={{ borderLeft:'1px solid var(--border)', paddingLeft:32 }}>
            <DayOfWeekChart data={dow}/>
          </div>
        </div>
      </div>

      {/* Vehicle Breakdown */}
      <div className="section-title">Vehicle Breakdown</div>
      <div className="card" style={{ padding:'20px 24px', marginBottom:24 }}>
        <BreakdownChart malaysia={stats.malaysia} sgRon97={stats.sg_ron97} sgBlocked={stats.sg_blocked}/>
      </div>

      {/* Recent Detections */}
      <div className="section-title">Recent Detections</div>
      <div className="card" style={{ padding:'16px 20px', marginBottom:24 }}>
        <RecentTable detections={recent}/>
      </div>

      
    </div>
  )
}
