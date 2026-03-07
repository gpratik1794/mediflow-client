// src/pages/clinic/Appointments.jsx
import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../utils/AuthContext'
import Layout from '../../components/Layout'
import { Card, CardHeader, Btn, Empty } from '../../components/UI'
import { getAppointments, updateAppointment } from '../../firebase/clinicDb'
import { sendCampaign } from '../../firebase/whatsapp'
import { format } from 'date-fns'

const STATUS_COLOR = {
  scheduled: { bg: 'var(--border)', color: 'var(--slate)', label: 'Scheduled' },
  waiting:   { bg: 'var(--amber-bg)', color: 'var(--amber)', label: 'Waiting' },
  'in-consultation': { bg: 'var(--teal-light)', color: 'var(--teal)', label: 'In Consultation' },
  done:      { bg: 'var(--green-bg)', color: 'var(--green)', label: 'Done' },
  cancelled: { bg: 'var(--red-bg)', color: 'var(--red)', label: 'Cancelled' },
}

export default function Appointments() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [appointments, setAppointments] = useState([])
  const [loading, setLoading]           = useState(true)
  const [filter, setFilter]             = useState('all')
  const [search, setSearch]             = useState('')
  const [showEndModal, setShowEndModal] = useState(false)
  const [endSession, setEndSession]     = useState(null)   // 'morning' | 'evening'
  const [sendingReport, setSendingReport] = useState(false)
  const [reportSent, setReportSent]     = useState({ morning: false, evening: false })
  const today = format(new Date(), 'yyyy-MM-dd')

  useEffect(() => { if (user) load() }, [user])

  async function load() {
    setLoading(true)
    const data = await getAppointments(user.uid, today)
    setAppointments(data)
    setLoading(false)
  }

  async function quickStatus(e, apptId, status) {
    e.stopPropagation()
    await updateAppointment(user.uid, apptId, { status })
    setAppointments(a => a.map(x => x.id === apptId ? { ...x, status } : x))
  }

  // ── Session helpers ──
  function getSessionFromTime(timeStr) {
    if (!timeStr || timeStr === 'Walk-in (no slot)') return null
    const parts = timeStr.trim().split(' ')
    const hm = parts[0].split(':')
    let h = Number(hm[0])
    if (parts[1] === 'PM' && h !== 12) h += 12
    if (parts[1] === 'AM' && h === 12) h = 0
    return h < 14 ? 'morning' : 'evening'
  }

  function getSessionAppts(sess) {
    return appointments.filter(a => {
      const s = a.session || getSessionFromTime(a.appointmentTime)
      return s === sess
    }).filter(a => a.status !== 'cancelled')
  }

  function buildSummary(sess) {
    const appts = getSessionAppts(sess)
    const done  = appts.filter(a => a.status === 'done')
    const newV  = done.filter(a => a.visitType === 'New Visit').length
    const followUp = done.filter(a => a.visitType !== 'New Visit').length
    const collection = done.reduce((sum, a) => {
      const fee = parseFloat(a.consultationFee) || 0
      const paid = a.paymentStatus === 'paid'
      return sum + (paid ? fee : 0)
    }, 0)
    const pending = done.reduce((sum, a) => {
      const fee = parseFloat(a.consultationFee) || 0
      const notPaid = a.paymentStatus === 'pending'
      return sum + (notPaid ? fee : 0)
    }, 0)
    return { total: done.length, newV, followUp, collection, pending, waiting: appts.filter(a => a.status !== 'done').length }
  }

  function canEndSession(sess) {
    const appts = getSessionAppts(sess)
    if (appts.length === 0) return false
    if (reportSent[sess]) return false
    return true
  }

  async function handleSendReport() {
    if (!endSession) return
    setSendingReport(true)
    try {
      const s   = buildSummary(endSession)
      const doc = profile?.doctors?.[0] || {}
      const doctorName  = doc.name || 'Doctor'
      const doctorPhone = doc.phone || profile?.phone
      const centreName  = profile?.centreName || 'Clinic'
      const dateLabel   = format(new Date(), 'dd MMM yyyy')
      const sessLabel   = endSession === 'morning' ? 'Morning' : 'Evening'

      const msg =
        `📋 *${sessLabel} Session Report — ${dateLabel}*
` +
        `Clinic: ${centreName}

` +
        `👥 *Patients Seen:* ${s.total}
` +
        `  • New Visits: ${s.newV}
` +
        `  • Follow-ups: ${s.followUp}

` +
        `💰 *Collection:*
` +
        `  • Collected: ₹${s.collection}
` +
        `  • Pending: ₹${s.pending}

` +
        (s.waiting > 0 ? `⚠️ ${s.waiting} patient(s) not marked done

` : '') +
        `_Sent via MediFlow_`

      if (profile?.whatsappCampaigns?.length && doctorPhone) {
        sendCampaign(profile.whatsappCampaigns, 'doctor_session_report',
          doctorPhone,
          [doctorName, sessLabel, dateLabel, String(s.total), String(s.newV), String(s.followUp), `₹${s.collection}`, `₹${s.pending}`],
          null, { centreId: user.uid }
        )
      }

      // Also send to fallback number if set
      if (profile?.fallbackNotifyNumber) {
        sendCampaign(profile.whatsappCampaigns, 'doctor_session_report',
          profile.fallbackNotifyNumber,
          [doctorName, sessLabel, dateLabel, String(s.total), String(s.newV), String(s.followUp), `₹${s.collection}`, `₹${s.pending}`],
          null, { centreId: user.uid }
        )
      }

      setReportSent(prev => ({ ...prev, [endSession]: true }))
      setShowEndModal(false)
      alert(`✅ Session report sent for ${sessLabel} session!`)
    } catch (e) {
      console.error(e)
      alert('Failed to send report. Please try again.')
    }
    setSendingReport(false)
    setEndSession(null)
  }

  function openEndModal(sess) {
    setEndSession(sess)
    setShowEndModal(true)
  }

  const currentSession = (() => {
    const now = new Date()
    const currentMins = now.getHours() * 60 + now.getMinutes()
    const [endH, endM] = (profile?.morningEnd || '13:00').split(':').map(Number)
    return currentMins < (endH * 60 + endM) ? 'morning' : 'evening'
  })()

  const filtered = appointments.filter(a => {
    const matchFilter = filter === 'all' || a.status === filter
    const matchSearch = !search || a.patientName?.toLowerCase().includes(search.toLowerCase()) || a.phone?.includes(search)
    return matchFilter && matchSearch
  })

  const sessAppts = getSessionAppts(currentSession)
  const allDoneThisSession = sessAppts.length > 0 && sessAppts.every(a => a.status === 'done' || a.status === 'cancelled')

  return (
    <Layout
      title="Appointments"
      action={
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {canEndSession(currentSession) && (
            <Btn
              variant="ghost"
              onClick={() => openEndModal(currentSession)}
              style={{
                borderColor: allDoneThisSession ? 'var(--green)' : 'var(--border)',
                color: allDoneThisSession ? 'var(--green)' : 'var(--slate)'
              }}
            >
              {allDoneThisSession ? '✓ End Session & Send Report' : '📋 Send Session Report'}
            </Btn>
          )}
          {reportSent[currentSession] && (
            <span style={{ fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>✓ Report sent</span>
          )}
          <Btn onClick={() => navigate('/clinic/appointments/new')}>+ Book Appointment</Btn>
        </div>
      }
    >
      <Card>
        <CardHeader
          title={`${appointments.length} appointments today`}
          sub={format(new Date(), 'EEEE, dd MMMM yyyy')}
          action={
            <div style={{ display: 'flex', gap: 10 }}>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="🔍 Search name or phone…"
                style={{ border: '1.5px solid var(--border)', borderRadius: 8, padding: '7px 14px', fontSize: 13, outline: 'none', fontFamily: 'DM Sans, sans-serif', color: 'var(--navy)', width: 220 }} />
              <Btn variant="ghost" small onClick={load}>🔄</Btn>
            </div>
          }
        />

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 4, padding: '10px 22px', borderBottom: '1px solid var(--border)' }}>
          {['all', 'scheduled', 'waiting', 'in-consultation', 'done', 'cancelled'].map(s => (
            <button key={s} onClick={() => setFilter(s)} style={{
              padding: '5px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
              fontSize: 11, fontFamily: 'DM Sans, sans-serif', textTransform: 'capitalize',
              background: filter === s ? 'var(--navy)' : 'var(--bg)',
              color: filter === s ? '#fff' : 'var(--slate)',
              fontWeight: filter === s ? 500 : 400
            }}>
              {s === 'all' ? `All (${appointments.length})` : `${STATUS_COLOR[s]?.label} (${appointments.filter(a => a.status === s).length})`}
            </button>
          ))}
        </div>

        {loading ? <Empty icon="⏳" message="Loading…" /> :
         filtered.length === 0 ? <Empty icon="📅" message="No appointments found" /> : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg)' }}>
                {['Token', 'Patient', 'Time', 'Type', 'Status', 'Quick Action', ''].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 18px', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--muted)', fontWeight: 500, borderBottom: '1px solid var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(a => {
                const sc = STATUS_COLOR[a.status] || STATUS_COLOR.scheduled
                return (
                  <tr key={a.id} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                    onClick={() => navigate(`/clinic/appointments/${a.id}`)}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--teal-light)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '12px 18px' }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: 10, fontSize: 14, fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: a.status === 'in-consultation' ? 'var(--teal)' : 'var(--bg)',
                        color: a.status === 'in-consultation' ? '#fff' : 'var(--navy)'
                      }}>
                        {a.tokenNumber}
                      </div>
                    </td>
                    <td style={{ padding: '12px 18px' }}>
                      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)' }}>{a.patientName}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{a.phone} · {a.age}y · {a.gender}</div>
                    </td>
                    <td style={{ padding: '12px 18px', fontSize: 13, color: 'var(--slate)' }}>{a.appointmentTime}</td>
                    <td style={{ padding: '12px 18px', fontSize: 12, color: 'var(--muted)' }}>{a.visitType}</td>
                    <td style={{ padding: '12px 18px' }}>
                      <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 500, background: sc.bg, color: sc.color }}>
                        {sc.label}
                      </span>
                    </td>
                    <td style={{ padding: '12px 18px' }}>
                      {a.status === 'scheduled' && (
                        <button onClick={e => quickStatus(e, a.id, 'waiting')} style={{ padding: '5px 12px', borderRadius: 8, border: 'none', background: 'var(--amber-bg)', color: 'var(--amber)', fontSize: 11, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontWeight: 500 }}>
                          → Check In
                        </button>
                      )}
                      {a.status === 'waiting' && (
                        <button onClick={e => quickStatus(e, a.id, 'in-consultation')} style={{ padding: '5px 12px', borderRadius: 8, border: 'none', background: 'var(--teal-light)', color: 'var(--teal)', fontSize: 11, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontWeight: 500 }}>
                          → Call In
                        </button>
                      )}
                      {a.status === 'in-consultation' && (
                        <button onClick={e => { e.stopPropagation(); navigate(`/clinic/prescription/new?apptId=${a.id}&phone=${a.phone}&name=${encodeURIComponent(a.patientName)}&age=${a.age}&gender=${a.gender}`) }}
                          style={{ padding: '5px 12px', borderRadius: 8, border: 'none', background: 'var(--teal)', color: '#fff', fontSize: 11, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontWeight: 500 }}>
                          ✍ Prescribe
                        </button>
                      )}
                    </td>
                    <td style={{ padding: '12px 18px', color: 'var(--teal)', fontSize: 18 }}>›</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Card>
      {/* End Session Modal */}
      {showEndModal && endSession && (() => {
        const s = buildSummary(endSession)
        const sessLabel = endSession === 'morning' ? '🌅 Morning' : '🌆 Evening'
        const doctorName = profile?.doctors?.[0]?.name || 'Doctor'
        return (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(13,27,42,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: 20
          }}>
            <div style={{
              background: 'var(--surface)', borderRadius: 20, padding: 32,
              width: '100%', maxWidth: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.2)'
            }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--navy)', marginBottom: 4 }}>
                End {sessLabel} Session
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 24 }}>
                This report will be sent to {doctorName} via WhatsApp
              </div>

              {/* Summary preview */}
              <div style={{ background: 'var(--bg)', borderRadius: 14, padding: '20px 22px', marginBottom: 24 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 }}>Session Summary</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  {[
                    { label: 'Total Seen', value: s.total, color: 'var(--navy)' },
                    { label: 'Waiting/Pending', value: s.waiting, color: s.waiting > 0 ? 'var(--amber)' : 'var(--muted)' },
                    { label: 'New Visits', value: s.newV, color: 'var(--teal)' },
                    { label: 'Follow-ups', value: s.followUp, color: 'var(--teal)' },
                    { label: 'Collected', value: `₹${s.collection}`, color: 'var(--green)' },
                    { label: 'Pending', value: `₹${s.pending}`, color: s.pending > 0 ? 'var(--amber)' : 'var(--muted)' },
                  ].map(item => (
                    <div key={item.label} style={{ background: 'var(--surface)', borderRadius: 10, padding: '12px 16px' }}>
                      <div style={{ fontSize: 20, fontWeight: 800, color: item.color }}>{item.value}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{item.label}</div>
                    </div>
                  ))}
                </div>
                {s.waiting > 0 && (
                  <div style={{ marginTop: 12, fontSize: 12, color: 'var(--amber)', background: 'var(--amber-bg)', borderRadius: 8, padding: '8px 12px' }}>
                    ⚠️ {s.waiting} patient(s) not yet marked as Done
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => { setShowEndModal(false); setEndSession(null) }}
                  style={{ flex: 1, padding: '11px', borderRadius: 10, border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--slate)', fontSize: 13, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontWeight: 500 }}>
                  Cancel
                </button>
                <button onClick={handleSendReport} disabled={sendingReport}
                  style={{ flex: 2, padding: '11px', borderRadius: 10, border: 'none', background: 'var(--teal)', color: '#fff', fontSize: 13, cursor: sendingReport ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif', fontWeight: 600, opacity: sendingReport ? 0.7 : 1 }}>
                  {sendingReport ? 'Sending…' : '📤 Send Report via WhatsApp'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </Layout>
  )
}
