// src/pages/clinic/ClinicReports.jsx
import React, { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../../utils/AuthContext'
import Layout from '../../components/Layout'
import { Card, CardHeader, Empty } from '../../components/UI'
import { getAppointmentsByRange } from '../../firebase/clinicDb'
import { format, subDays, subMonths, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear } from 'date-fns'

// ── Date range presets ────────────────────────────────────────────────────────
function getRange(preset, custom) {
  const today = new Date()
  const fmt = d => format(d, 'yyyy-MM-dd')
  switch (preset) {
    case 'today':        return { from: fmt(today), to: fmt(today) }
    case 'yesterday':    return { from: fmt(subDays(today, 1)), to: fmt(subDays(today, 1)) }
    case 'this_week':    return { from: fmt(startOfWeek(today, { weekStartsOn: 1 })), to: fmt(endOfWeek(today, { weekStartsOn: 1 })) }
    case 'last_week':    { const s = subDays(startOfWeek(today, { weekStartsOn: 1 }), 7); return { from: fmt(s), to: fmt(subDays(s, -6)) } }
    case 'last_7':       return { from: fmt(subDays(today, 6)), to: fmt(today) }
    case 'this_month':   return { from: fmt(startOfMonth(today)), to: fmt(endOfMonth(today)) }
    case 'last_month':   { const s = startOfMonth(subMonths(today, 1)); return { from: fmt(s), to: fmt(endOfMonth(s)) } }
    case 'last_30':      return { from: fmt(subDays(today, 29)), to: fmt(today) }
    case 'last_3m':      return { from: fmt(subMonths(today, 3)), to: fmt(today) }
    case 'last_6m':      return { from: fmt(subMonths(today, 6)), to: fmt(today) }
    case 'last_1y':      return { from: fmt(subDays(startOfYear(today), 0)), to: fmt(today) }
    case 'custom':       return custom
    default:             return { from: fmt(today), to: fmt(today) }
  }
}

const PRESETS = [
  { key: 'today',      label: 'Today' },
  { key: 'yesterday',  label: 'Yesterday' },
  { key: 'this_week',  label: 'This Week' },
  { key: 'last_week',  label: 'Last Week' },
  { key: 'last_7',     label: 'Last 7 Days' },
  { key: 'this_month', label: 'This Month' },
  { key: 'last_month', label: 'Last Month' },
  { key: 'last_30',    label: 'Last 30 Days' },
  { key: 'last_3m',    label: 'Last 3 Months' },
  { key: 'last_6m',    label: 'Last 6 Months' },
  { key: 'last_1y',    label: 'Last 1 Year' },
  { key: 'custom',     label: 'Custom' },
]

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color = 'var(--navy)', icon }) {
  return (
    <div style={{
      background: 'var(--surface)', borderRadius: 14, padding: '20px 22px',
      border: '1px solid var(--border)', flex: 1, minWidth: 130
    }}>
      {icon && <div style={{ fontSize: 20, marginBottom: 8 }}>{icon}</div>}
      <div style={{ fontSize: 28, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--slate)', marginTop: 5, fontWeight: 500 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

// ── Section header ────────────────────────────────────────────────────────────
function SectionHead({ title, icon }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, marginTop: 8 }}>
      <span style={{ fontSize: 16 }}>{icon}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', textTransform: 'uppercase', letterSpacing: 0.8 }}>{title}</span>
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function ClinicReports() {
  const { user, profile } = useAuth()
  const [preset, setPreset]     = useState('today')
  const [custom, setCustom]     = useState({ from: '', to: '' })
  const [appts, setAppts]       = useState([])
  const [loading, setLoading]   = useState(false)

  const range = getRange(preset, custom)

  useEffect(() => {
    if (!user) return
    if (preset === 'custom' && (!custom.from || !custom.to)) return
    load()
  }, [preset, custom.from, custom.to, user])

  async function load() {
    setLoading(true)
    try {
      const data = await getAppointmentsByRange(user.uid, range.from, range.to)
      setAppts(data)
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  // ── Computed metrics ──
  const metrics = useMemo(() => {
    const active = appts.filter(a => a.status !== 'cancelled')
    const done   = appts.filter(a => a.status === 'done')
    const cancelled = appts.filter(a => a.status === 'cancelled')
    const noShow = appts.filter(a => a.status === 'scheduled') // scheduled but never checked in (old dates)

    const newVisits  = done.filter(a => a.visitType === 'New Visit').length
    const followUps  = done.filter(a => a.visitType !== 'New Visit').length

    const collected = done.reduce((s, a) => s + (a.paymentStatus === 'paid' ? parseFloat(a.consultationFee || 0) : 0), 0)
    const pending   = done.reduce((s, a) => s + (a.paymentStatus === 'pending' ? parseFloat(a.consultationFee || 0) : 0), 0)
    const free      = done.filter(a => a.paymentStatus === 'free').length

    // Doctor breakdown
    const byDoctor = {}
    done.forEach(a => {
      const d = a.doctorName || 'Unassigned'
      if (!byDoctor[d]) byDoctor[d] = { name: d, total: 0, newVisits: 0, followUps: 0, collected: 0, pending: 0 }
      byDoctor[d].total++
      if (a.visitType === 'New Visit') byDoctor[d].newVisits++
      else byDoctor[d].followUps++
      if (a.paymentStatus === 'paid') byDoctor[d].collected += parseFloat(a.consultationFee || 0)
      if (a.paymentStatus === 'pending') byDoctor[d].pending += parseFloat(a.consultationFee || 0)
    })

    // Slot utilisation — by date
    const byDate = {}
    appts.forEach(a => {
      if (!byDate[a.date]) byDate[a.date] = { date: a.date, booked: 0, done: 0, cancelled: 0, noShow: 0 }
      byDate[a.date].booked++
      if (a.status === 'done') byDate[a.date].done++
      if (a.status === 'cancelled') byDate[a.date].cancelled++
      if (a.status === 'scheduled') byDate[a.date].noShow++
    })

    // Peak slots
    const slotCount = {}
    active.forEach(a => {
      if (a.appointmentTime && a.appointmentTime !== 'Walk-in (no slot)') {
        slotCount[a.appointmentTime] = (slotCount[a.appointmentTime] || 0) + 1
      }
    })
    const peakSlots = Object.entries(slotCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)

    // Session breakdown
    const morning = active.filter(a => {
      const s = a.session || (() => {
        if (!a.appointmentTime || a.appointmentTime === 'Walk-in (no slot)') return null
        const parts = a.appointmentTime.trim().split(' ')
        const h = parseInt(parts[0].split(':')[0])
        const isPM = parts[1] === 'PM'
        let h24 = h; if (isPM && h !== 12) h24 += 12; if (!isPM && h === 12) h24 = 0
        return h24 < 14 ? 'morning' : 'evening'
      })()
      return s === 'morning'
    })
    const evening = active.filter(a => {
      const s = a.session || (() => {
        if (!a.appointmentTime || a.appointmentTime === 'Walk-in (no slot)') return null
        const parts = a.appointmentTime.trim().split(' ')
        const h = parseInt(parts[0].split(':')[0])
        const isPM = parts[1] === 'PM'
        let h24 = h; if (isPM && h !== 12) h24 += 12; if (!isPM && h === 12) h24 = 0
        return h24 < 14 ? 'morning' : 'evening'
      })()
      return s === 'evening'
    })

    return {
      total: active.length, done: done.length, cancelled: cancelled.length,
      noShow: noShow.length, newVisits, followUps,
      collected, pending, free,
      cancellationRate: active.length > 0 ? Math.round((cancelled.length / (active.length + cancelled.length)) * 100) : 0,
      byDoctor: Object.values(byDoctor).sort((a, b) => b.total - a.total),
      byDate: Object.values(byDate).sort((a, b) => b.date.localeCompare(a.date)),
      peakSlots, morning: morning.length, evening: evening.length
    }
  }, [appts])

  const rangeLabel = preset === 'custom'
    ? `${custom.from} → ${custom.to}`
    : PRESETS.find(p => p.key === preset)?.label

  return (
    <Layout title="Reports">
      {/* ── Date range filter ── */}
      <Card style={{ marginBottom: 20 }}>
        <div style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: preset === 'custom' ? 14 : 0 }}>
            {PRESETS.map(p => (
              <button key={p.key} onClick={() => setPreset(p.key)} style={{
                padding: '6px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
                fontSize: 12, fontFamily: 'DM Sans, sans-serif', fontWeight: preset === p.key ? 600 : 400,
                background: preset === p.key ? 'var(--navy)' : 'var(--bg)',
                color: preset === p.key ? '#fff' : 'var(--slate)',
                transition: 'all 0.15s'
              }}>{p.label}</button>
            ))}
          </div>
          {preset === 'custom' && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8 }}>From</span>
                <input type="date" value={custom.from} onChange={e => setCustom(p => ({ ...p, from: e.target.value }))}
                  style={{ padding: '8px 12px', borderRadius: 8, border: '1.5px solid var(--border)', fontFamily: 'DM Sans', fontSize: 13, outline: 'none', color: 'var(--navy)' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8 }}>To</span>
                <input type="date" value={custom.to} onChange={e => setCustom(p => ({ ...p, to: e.target.value }))}
                  style={{ padding: '8px 12px', borderRadius: 8, border: '1.5px solid var(--border)', fontFamily: 'DM Sans', fontSize: 13, outline: 'none', color: 'var(--navy)' }} />
              </div>
            </div>
          )}
        </div>
      </Card>

      {loading ? (
        <Empty icon="⏳" message="Loading report…" />
      ) : appts.length === 0 && !loading ? (
        <Empty icon="📊" message={`No appointments found for ${rangeLabel}`} />
      ) : (
        <>
          {/* ── Appointment Summary ── */}
          <Card style={{ marginBottom: 20 }}>
            <CardHeader title="Appointment Summary" sub={rangeLabel} />
            <div style={{ padding: '4px 20px 20px' }}>
              <SectionHead title="Overview" icon="📅" />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
                <StatCard label="Total Booked"   value={metrics.total}      icon="📋" />
                <StatCard label="Seen / Done"    value={metrics.done}       icon="✅" color="var(--green)" />
                <StatCard label="New Visits"     value={metrics.newVisits}  icon="👤" color="var(--teal)" />
                <StatCard label="Follow-ups"     value={metrics.followUps}  icon="🔁" color="var(--teal)" />
                <StatCard label="Cancelled"      value={metrics.cancelled}  icon="✗"  color="var(--red)"
                  sub={metrics.cancellationRate > 0 ? `${metrics.cancellationRate}% rate` : null} />
                <StatCard label="No-show"        value={metrics.noShow}     icon="👻" color="var(--amber)" />
              </div>

              <SectionHead title="Session Split" icon="🕐" />
              <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
                <StatCard label="Morning Session" value={metrics.morning} icon="🌅" color="var(--amber)" />
                <StatCard label="Evening Session" value={metrics.evening} icon="🌆" color="var(--navy)" />
              </div>
            </div>
          </Card>

          {/* ── Collection Summary ── */}
          <Card style={{ marginBottom: 20 }}>
            <CardHeader title="Collection Summary" sub={rangeLabel} />
            <div style={{ padding: '4px 20px 20px' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
                <StatCard label="Total Collected" value={`₹${metrics.collected.toLocaleString('en-IN')}`} icon="💰" color="var(--green)" />
                <StatCard label="Pending"          value={`₹${metrics.pending.toLocaleString('en-IN')}`}   icon="⏳" color="var(--amber)" />
                <StatCard label="Free / Waived"    value={metrics.free}                                     icon="🎁" color="var(--muted)" />
                <StatCard label="Total Revenue"
                  value={`₹${(metrics.collected + metrics.pending).toLocaleString('en-IN')}`}
                  icon="📈" color="var(--teal)"
                  sub="Collected + Pending" />
              </div>

              {/* Collection bar */}
              {(metrics.collected + metrics.pending) > 0 && (() => {
                const total = metrics.collected + metrics.pending
                const collectedPct = Math.round((metrics.collected / total) * 100)
                const pendingPct = 100 - collectedPct
                return (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 11, color: 'var(--green)', fontWeight: 600 }}>Collected {collectedPct}%</span>
                      <span style={{ fontSize: 11, color: 'var(--amber)', fontWeight: 600 }}>Pending {pendingPct}%</span>
                    </div>
                    <div style={{ height: 10, borderRadius: 10, overflow: 'hidden', background: 'var(--border)', display: 'flex' }}>
                      <div style={{ width: `${collectedPct}%`, background: 'var(--green)', transition: 'width 0.5s' }} />
                      <div style={{ width: `${pendingPct}%`, background: 'var(--amber)' }} />
                    </div>
                  </div>
                )
              })()}
            </div>
          </Card>

          {/* ── Doctor-wise Breakdown ── */}
          {metrics.byDoctor.length > 0 && (
            <Card style={{ marginBottom: 20 }}>
              <CardHeader title="Doctor-wise Breakdown" sub={rangeLabel} />
              <div style={{ padding: '0 20px 20px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg)' }}>
                      {['Doctor', 'Total Seen', 'New Visits', 'Follow-ups', 'Collected', 'Pending'].map(h => (
                        <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--muted)', fontWeight: 500, borderBottom: '1px solid var(--border)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.byDoctor.map(d => (
                      <tr key={d.name} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '12px 14px', fontWeight: 600, color: 'var(--navy)', fontSize: 13 }}>{d.name}</td>
                        <td style={{ padding: '12px 14px', fontSize: 13, color: 'var(--slate)' }}>{d.total}</td>
                        <td style={{ padding: '12px 14px', fontSize: 13, color: 'var(--teal)', fontWeight: 500 }}>{d.newVisits}</td>
                        <td style={{ padding: '12px 14px', fontSize: 13, color: 'var(--teal)', fontWeight: 500 }}>{d.followUps}</td>
                        <td style={{ padding: '12px 14px', fontSize: 13, color: 'var(--green)', fontWeight: 600 }}>₹{d.collected.toLocaleString('en-IN')}</td>
                        <td style={{ padding: '12px 14px', fontSize: 13, color: d.pending > 0 ? 'var(--amber)' : 'var(--muted)', fontWeight: d.pending > 0 ? 600 : 400 }}>
                          {d.pending > 0 ? `₹${d.pending.toLocaleString('en-IN')}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* ── Slot Utilisation & Peak Hours ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>

            {/* Peak slots */}
            <Card>
              <CardHeader title="Peak Time Slots" sub="Most booked slots" />
              <div style={{ padding: '0 20px 20px' }}>
                {metrics.peakSlots.length === 0 ? (
                  <Empty icon="🕐" message="No slot data" />
                ) : metrics.peakSlots.map(([slot, count], i) => {
                  const max = metrics.peakSlots[0][1]
                  const pct = Math.round((count / max) * 100)
                  return (
                    <div key={slot} style={{ marginBottom: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                        <span style={{ fontSize: 13, color: 'var(--navy)', fontWeight: i === 0 ? 700 : 400 }}>{slot}</span>
                        <span style={{ fontSize: 13, color: 'var(--teal)', fontWeight: 600 }}>{count} bookings</span>
                      </div>
                      <div style={{ height: 6, borderRadius: 6, background: 'var(--border)' }}>
                        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 6, background: i === 0 ? 'var(--teal)' : 'var(--border)', filter: i === 0 ? 'none' : 'brightness(0.85)', transition: 'width 0.5s' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </Card>

            {/* Daily summary */}
            <Card>
              <CardHeader title="Daily Summary" sub={`${metrics.byDate.length} days`} />
              <div style={{ padding: '0 20px 20px', maxHeight: 280, overflowY: 'auto' }}>
                {metrics.byDate.length === 0 ? (
                  <Empty icon="📅" message="No data" />
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg)' }}>
                        {['Date', 'Booked', 'Done', 'Cancel'].map(h => (
                          <th key={h} style={{ textAlign: 'left', padding: '8px 10px', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--muted)', fontWeight: 500, borderBottom: '1px solid var(--border)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {metrics.byDate.map(d => (
                        <tr key={d.date} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '9px 10px', fontSize: 12, fontWeight: 500, color: 'var(--navy)' }}>{d.date}</td>
                          <td style={{ padding: '9px 10px', fontSize: 12, color: 'var(--slate)' }}>{d.booked}</td>
                          <td style={{ padding: '9px 10px', fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>{d.done}</td>
                          <td style={{ padding: '9px 10px', fontSize: 12, color: d.cancelled > 0 ? 'var(--red)' : 'var(--muted)' }}>{d.cancelled || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </Card>
          </div>
        </>
      )}
    </Layout>
  )
}
