// src/pages/clinic/Appointments.jsx
import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../utils/AuthContext'
import Layout from '../../components/Layout'
import { Card, CardHeader, Btn, Empty } from '../../components/UI'
import { getAppointments, updateAppointment, saveSessionReport, subscribeToAppointments, logActivity, getSessionFromTime } from '../../firebase/clinicDb'
import { sendCampaign } from '../../firebase/whatsapp'
import { format } from 'date-fns'

const STATUS_COLOR = {
  scheduled:        { bg: 'var(--border)',      color: 'var(--slate)',  label: 'Scheduled' },
  waiting:          { bg: 'var(--amber-bg)',     color: 'var(--amber)',  label: 'Waiting' },
  'in-consultation':{ bg: 'var(--teal-light)',   color: 'var(--teal)',   label: 'In Consultation' },
  done:             { bg: 'var(--green-bg)',      color: 'var(--green)',  label: 'Done' },
  cancelled:        { bg: 'var(--red-bg)',        color: 'var(--red)',    label: 'Cancelled' },
}

function maskPhone(phone) {
  if (!phone) return ''
  const p = String(phone).replace(/\D/g,'')
  if (p.length < 6) return '••••••'
  return p.slice(0, 2) + '••••••' + p.slice(-2)
}

export default function Appointments() {
  const { user, profile, role, userRecord } = useAuth()
  const centreId    = profile?._centreId || user?.uid
  const canSeePhone = !role || userRecord?.permissions?.showPhone === true
  const isReceptionist = role === 'receptionist'
  const isDoctor       = role === 'doctor'
  const canCallIn      = !isReceptionist
  const canPrescribe   = !isReceptionist
  const canCheckIn     = true
  const canMarkFee     = isReceptionist || !role
  const canSendReport  = !isReceptionist

  // ── Mobile detection ──
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const navigate = useNavigate()
  const [appointments, setAppointments] = useState([])
  const [loading, setLoading]           = useState(true)
  const [filter, setFilter]             = useState('all')
  const [search, setSearch]             = useState('')
  const [showEndModal, setShowEndModal] = useState(false)
  const [endSession, setEndSession]     = useState(null)
  const [sendingReport, setSendingReport] = useState(false)
  const [reportSent, setReportSent]     = useState({ morning: false, evening: false })
  const [markingFee, setMarkingFee]     = useState({})
  const today    = format(new Date(), 'yyyy-MM-dd')
  const [viewDate, setViewDate] = useState(today)
  const isToday  = viewDate === today
  const unsubRef = useRef(null)

  useEffect(() => {
    if (!user || !centreId) return
    setLoading(true)
    if (unsubRef.current) unsubRef.current()
    unsubRef.current = subscribeToAppointments(centreId, viewDate, data => {
      setAppointments(data)
      setLoading(false)
    })
    return () => { if (unsubRef.current) unsubRef.current() }
  }, [user, centreId, viewDate])

  async function load() {
    const data = await getAppointments(centreId, viewDate)
    setAppointments(data)
  }

  async function reTokenizeToday() {
    const appts = await getAppointments(centreId, viewDate)
    const nonCancelled = appts.filter(a => a.status !== 'cancelled')
    const sessions = { morning: [], evening: [], walkin: [] }
    nonCancelled.forEach(a => {
      if (!a.appointmentTime || a.appointmentTime === 'Walk-in (no slot)') {
        sessions.walkin.push(a)
      } else {
        const sess = a.session || getSessionFromTime(a.appointmentTime)
        if (sess === 'morning') sessions.morning.push(a)
        else sessions.evening.push(a)
      }
    })
    const toMins = t => {
      if (!t) return 9999
      const parts = t.trim().split(' ')
      let h = Number(parts[0].split(':')[0])
      const min = Number(parts[0].split(':')[1] || 0)
      if (parts[1] === 'PM' && h !== 12) h += 12
      if (parts[1] === 'AM' && h === 12) h = 0
      return h * 60 + min
    }
    let updates = []
    const mSorted = [...sessions.morning].sort((a, b) => toMins(a.appointmentTime) - toMins(b.appointmentTime))
    mSorted.forEach((a, i) => { if (a.tokenNumber !== i + 1) updates.push({ id: a.id, tokenNumber: i + 1 }) })
    const eSorted = [...sessions.evening].sort((a, b) => toMins(a.appointmentTime) - toMins(b.appointmentTime))
    eSorted.forEach((a, i) => { if (a.tokenNumber !== i + 1) updates.push({ id: a.id, tokenNumber: i + 1 }) })
    const wOffset = Math.max(mSorted.length, eSorted.length)
    sessions.walkin.forEach((a, i) => { if (a.tokenNumber !== wOffset + i + 1) updates.push({ id: a.id, tokenNumber: wOffset + i + 1 }) })
    if (updates.length === 0) { alert('Tokens are already correct — no changes needed.'); return }
    await Promise.all(updates.map(u => updateAppointment(centreId, u.id, { tokenNumber: u.tokenNumber })))
    await load()
    alert(`✓ Re-assigned tokens for ${updates.length} appointment${updates.length !== 1 ? 's' : ''}.`)
  }

  async function quickStatus(e, apptId, status) {
    e.stopPropagation()
    await updateAppointment(centreId, apptId, { status })
    setAppointments(a => a.map(x => x.id === apptId ? { ...x, status } : x))
    const appt = appointments.find(x => x.id === apptId)
    const labelMap = { waiting: 'Marked Waiting', 'in-consultation': 'Marked In Consultation', done: 'Marked Done', cancelled: 'Appointment Cancelled', scheduled: 'Marked Scheduled' }
    logActivity(centreId, { action: 'appt_status_changed', label: labelMap[status] || 'Status Changed', detail: appt?.patientName || apptId, by: user?.email || '' })
  }

  async function quickMarkFee(e, apptId, paymentStatus) {
    e.stopPropagation()
    setMarkingFee(m => ({ ...m, [apptId]: true }))
    await updateAppointment(centreId, apptId, { paymentStatus })
    setAppointments(a => a.map(x => x.id === apptId ? { ...x, paymentStatus } : x))
    setMarkingFee(m => ({ ...m, [apptId]: false }))
  }

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
    const collection = done.reduce((sum, a) => sum + (a.paymentStatus === 'paid' ? parseFloat(a.consultationFee || 0) : 0), 0)
    const pending    = done.reduce((sum, a) => sum + (a.paymentStatus === 'pending' ? parseFloat(a.consultationFee || 0) : 0), 0)
    const pendingPatients = done.filter(a => a.paymentStatus === 'pending')
    return { total: done.length, newV, followUp, collection, pending, pendingPatients, waiting: appts.filter(a => a.status !== 'done').length }
  }

  function canEndSession(sess) {
    const appts = getSessionAppts(sess)
    if (appts.length === 0) return false
    if (reportSent[sess]) return false
    return true
  }

  function allDoneForSession(sess) {
    const appts = getSessionAppts(sess)
    if (appts.length === 0) return false
    return appts.every(a => a.status === 'done' || a.status === 'cancelled')
  }

  async function handleSendReport() {
    if (!endSession) return
    setSendingReport(true)
    try {
      const s          = buildSummary(endSession)
      const doc        = profile?.doctors?.[0] || {}
      const doctorName = doc.name || 'Doctor'
      const doctorPhone = doc.phone || profile?.phone
      const centreName = profile?.centreName || 'Clinic'
      const dateLabel  = format(new Date(), 'dd MMM yyyy')
      const sessLabel  = endSession === 'morning' ? 'Morning' : 'Evening'

      const msg =
        `📋 *${sessLabel} Session Report — ${dateLabel}*\n` +
        `Clinic: ${centreName}\n\n` +
        `👥 *Patients Seen:* ${s.total}\n` +
        `  • New Visits: ${s.newV}\n` +
        `  • Follow-ups: ${s.followUp}\n\n` +
        `💰 *Collection:*\n` +
        `  • Collected: ₹${s.collection}\n` +
        `  • Pending: ₹${s.pending}\n` +
        (s.pendingPatients.length > 0
          ? `  • Pending patients: ${s.pendingPatients.map(p => p.patientName).join(', ')}\n\n`
          : '\n') +
        (s.waiting > 0 ? `⚠️ ${s.waiting} patient(s) not marked done\n` : '') +
        `_Sent via MediFlow_`

      if (profile?.whatsappCampaigns?.length && doctorPhone) {
        sendCampaign(profile.whatsappCampaigns, 'doctor_session_report', doctorPhone,
          [doctorName, sessLabel, dateLabel, String(s.total), String(s.newV), String(s.followUp), `₹${s.collection}`, `₹${s.pending}`],
          null, { centreId })
      }
      if (profile?.fallbackNotifyNumber) {
        sendCampaign(profile.whatsappCampaigns, 'doctor_session_report', profile.fallbackNotifyNumber,
          [doctorName, sessLabel, dateLabel, String(s.total), String(s.newV), String(s.followUp), `₹${s.collection}`, `₹${s.pending}`],
          null, { centreId })
      }

      try {
        await saveSessionReport(centreId, {
          date: today, session: endSession,
          doctorName: profile?.doctors?.[0]?.name || 'Doctor',
          total: s.total, newVisits: s.newV, followUps: s.followUp,
          collected: s.collection, pending: s.pending, waiting: s.waiting,
          centreName: profile?.centreName || 'Clinic',
        })
      } catch (saveErr) { console.error('Report save failed:', saveErr) }

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

  function openEndModal(sess) { setEndSession(sess); setShowEndModal(true) }

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

  const allDone = allDoneForSession(currentSession)
  const canShow = canEndSession(currentSession)
  const nextWaiting = appointments
    .filter(a => a.status === 'waiting')
    .sort((a, b) => (a.tokenNumber || 0) - (b.tokenNumber || 0))[0] || null
  const pendingFeePatients = appointments.filter(a => a.status === 'done' && a.paymentStatus === 'pending')

  const iStyle = { padding: '5px 12px', borderRadius: 8, border: 'none', fontSize: 11, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontWeight: 500 }

  // ── Fee cell — shared between table and card view ──
  function FeeCell({ a }) {
    if (a.status !== 'done') return null
    if (a.paymentStatus === 'paid') return (
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--green)' }}>
        ✓ {a.consultationFee ? `₹${a.consultationFee}` : 'Paid'}
      </span>
    )
    if (a.paymentStatus === 'free') return (
      <span style={{ fontSize: 11, color: 'var(--muted)' }}>Free</span>
    )
    if (canMarkFee) return (
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        <button onClick={e => quickMarkFee(e, a.id, 'paid')} disabled={markingFee[a.id]}
          style={{ ...iStyle, background: 'var(--green-bg)', color: 'var(--green)', padding: '4px 9px', opacity: markingFee[a.id] ? 0.5 : 1 }}>
          {markingFee[a.id] ? '…' : `₹${a.consultationFee || '?'} Paid`}
        </button>
        <button onClick={e => quickMarkFee(e, a.id, 'free')} disabled={markingFee[a.id]}
          style={{ ...iStyle, background: 'var(--bg)', color: 'var(--muted)', padding: '4px 9px', border: '1px solid var(--border)', opacity: markingFee[a.id] ? 0.5 : 1 }}>
          Free
        </button>
      </div>
    )
    return <span style={{ fontSize: 11, color: 'var(--amber)', fontWeight: 600 }}>⏳ Pending</span>
  }

  // ── Action cell — shared between table and card view ──
  function ActionCell({ a }) {
    if (isReceptionist) {
      if (a.status === 'scheduled') return (
        <button onClick={e => quickStatus(e, a.id, 'waiting')}
          style={{ ...iStyle, background: 'var(--amber-bg)', color: 'var(--amber)' }}>✓ Check In</button>
      )
      if (a.status === 'waiting') return (
        <span style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>Waiting for doctor</span>
      )
      if (a.status === 'in-consultation') return (
        <span style={{ fontSize: 11, color: 'var(--teal)', fontStyle: 'italic' }}>With doctor</span>
      )
      return null
    }
    // doctor / owner
    if (a.status === 'scheduled') return (
      <button onClick={e => quickStatus(e, a.id, 'waiting')}
        style={{ ...iStyle, background: 'var(--amber-bg)', color: 'var(--amber)' }}>✓ Check In</button>
    )
    if (a.status === 'waiting') return (
      <button onClick={e => { e.stopPropagation(); quickStatus(e, a.id, 'in-consultation') }}
        style={{ ...iStyle, background: 'var(--teal-light)', color: 'var(--teal)' }}>→ Call In</button>
    )
    if (a.status === 'in-consultation' && canPrescribe) return (
      <button onClick={e => { e.stopPropagation(); navigate(`/clinic/prescription/new?apptId=${a.id}&phone=${a.phone}&name=${encodeURIComponent(a.patientName)}&age=${a.age}&gender=${a.gender}`) }}
        style={{ ...iStyle, background: 'var(--teal)', color: '#fff' }}>✍ Prescribe</button>
    )
    return null
  }

  // ── Mobile card for a single appointment ──
  function AppointmentCard({ a }) {
    const sc = STATUS_COLOR[a.status] || STATUS_COLOR.scheduled
    return (
      <div
        onClick={() => navigate(`/clinic/appointments/${a.id}`)}
        style={{
          background: 'var(--surface)',
          border: '1.5px solid var(--border)',
          borderRadius: 14,
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          cursor: 'pointer',
          marginBottom: 10,
        }}
      >
        {/* Top row: token + name + status badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Token circle */}
          <div style={{
            width: 40, height: 40, borderRadius: 10, fontSize: 15, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            background: a.status === 'in-consultation' ? 'var(--teal)' : 'var(--bg)',
            color: a.status === 'in-consultation' ? '#fff' : 'var(--navy)',
          }}>
            {a.tokenNumber}
          </div>
          {/* Name + sub-info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--navy)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {a.patientName}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
              {canSeePhone ? a.phone : maskPhone(a.phone)} · {a.age}y · {a.gender}
            </div>
          </div>
          {/* Status badge */}
          {canCallIn && a.status === 'waiting' ? (
            <span
              onClick={e => { e.stopPropagation(); quickStatus(e, a.id, 'in-consultation') }}
              style={{ padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 500, background: sc.bg, color: sc.color, border: '1.5px solid var(--amber)', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
              {sc.label} →
            </span>
          ) : (
            <span style={{ padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 500, background: sc.bg, color: sc.color, whiteSpace: 'nowrap', flexShrink: 0 }}>
              {sc.label}
            </span>
          )}
        </div>

        {/* Middle row: time + visit type */}
        <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--slate)' }}>
          <span>🕐 {a.appointmentTime}</span>
          <span>· {a.visitType}</span>
        </div>

        {/* Bottom row: action + fee */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <div onClick={e => e.stopPropagation()}>
            <ActionCell a={a} />
          </div>
          <div onClick={e => e.stopPropagation()}>
            <FeeCell a={a} />
          </div>
          <span style={{ color: 'var(--teal)', fontSize: 18, marginLeft: 'auto' }}>›</span>
        </div>
      </div>
    )
  }

  return (
    <Layout
      title="Appointments"
      action={
        <div style={{ display: 'flex', gap: isMobile ? 6 : 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {canSendReport && canShow && (
            <button
              onClick={() => { if (allDone) openEndModal(currentSession) }}
              disabled={!allDone}
              title={!allDone ? 'Mark all patients as Done before ending session' : ''}
              style={{
                padding: isMobile ? '8px 10px' : '9px 16px',
                borderRadius: 10, fontSize: isMobile ? 11 : 13, fontWeight: 600,
                fontFamily: 'DM Sans, sans-serif', cursor: allDone ? 'pointer' : 'not-allowed',
                border: `1.5px solid ${allDone ? 'var(--green)' : 'var(--border)'}`,
                background: allDone ? 'var(--green-bg)' : 'var(--bg)',
                color: allDone ? 'var(--green)' : 'var(--muted)',
                opacity: allDone ? 1 : 0.6, transition: 'all 0.2s',
                whiteSpace: 'nowrap',
              }}
            >
              {allDone ? (isMobile ? '✓ End Session' : '✓ End Session & Send Report') : (isMobile ? '📋 Report' : '📋 Send Session Report')}
            </button>
          )}
          {canSendReport && reportSent[currentSession] && (
            <span style={{ fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>✓ Sent</span>
          )}
          {!isReceptionist && (
            <>
              {isToday && !isMobile && (
                <button onClick={reTokenizeToday}
                  title="Re-assign token numbers based on slot time"
                  style={{ padding: '7px 12px', borderRadius: 9, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--muted)', fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                  🔢 Fix Tokens
                </button>
              )}
              <Btn onClick={() => navigate('/clinic/appointments/new')}>
                {isMobile ? '+ Book' : '+ Book Appointment'}
              </Btn>
            </>
          )}
        </div>
      }
    >

      {/* ── Doctor: next patient card ── */}
      {canCallIn && nextWaiting && isToday && (
        <div style={{
          background: 'var(--navy)', borderRadius: 14,
          padding: isMobile ? '14px 16px' : '16px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 16, gap: 12,
        }}>
          <div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Next patient waiting</div>
            <div style={{ fontSize: isMobile ? 22 : 28, fontWeight: 800, color: 'var(--teal-mid,#5DCABC)', lineHeight: 1 }}>#{nextWaiting.tokenNumber}</div>
            <div style={{ fontSize: isMobile ? 13 : 15, fontWeight: 600, color: '#fff', marginTop: 3 }}>{nextWaiting.patientName}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
              {nextWaiting.appointmentTime} · {nextWaiting.visitType}
              {nextWaiting.vitals && Object.keys(nextWaiting.vitals).length > 0 ? ' · vitals recorded' : ''}
            </div>
          </div>
          <button
            onClick={async e => { e.stopPropagation(); await quickStatus(e, nextWaiting.id, 'in-consultation') }}
            style={{ padding: isMobile ? '10px 14px' : '12px 20px', borderRadius: 10, border: 'none', background: 'var(--teal)', color: '#fff', fontSize: isMobile ? 12 : 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            Call in →
          </button>
        </div>
      )}

      {/* ── Receptionist: pending fee banner ── */}
      {isReceptionist && pendingFeePatients.length > 0 && isToday && (
        <div style={{
          background: 'var(--amber-bg)', border: '1.5px solid var(--amber)', borderRadius: 12,
          padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ fontSize: 18 }}>💰</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--amber)' }}>
              {pendingFeePatients.length} fee{pendingFeePatients.length > 1 ? 's' : ''} pending
            </div>
            <div style={{ fontSize: 11, color: 'var(--slate)', marginTop: 2 }}>
              {pendingFeePatients.map(p => `${p.patientName} (#${p.tokenNumber})`).join(' · ')}
            </div>
          </div>
        </div>
      )}

      <Card>
        <CardHeader
          title={`${appointments.length} appointment${appointments.length !== 1 ? 's' : ''} · ${isToday ? 'Today' : format(new Date(viewDate + 'T00:00:00'), 'dd MMM yyyy')}`}
          sub={isToday ? format(new Date(), 'EEEE, dd MMMM yyyy') : format(new Date(viewDate + 'T00:00:00'), 'EEEE, dd MMMM yyyy')}
          action={
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              {/* Date navigator */}
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => { const d = new Date(viewDate + 'T00:00:00'); d.setDate(d.getDate()-1); setViewDate(format(d,'yyyy-MM-dd')) }}
                  style={{ padding: '6px 10px', borderRadius: 7, border: '1.5px solid var(--border)', background: '#fff', cursor: 'pointer', fontSize: 13, fontFamily: 'DM Sans, sans-serif', color: 'var(--slate)', minWidth: 36, minHeight: 36 }}>‹</button>
                <input type="date" value={viewDate} onChange={e => setViewDate(e.target.value)}
                  style={{ border: '1.5px solid var(--border)', borderRadius: 7, padding: '6px 8px', fontSize: 13, fontFamily: 'DM Sans, sans-serif', color: 'var(--navy)', cursor: 'pointer', maxWidth: isMobile ? 130 : 'auto' }} />
                <button onClick={() => { const d = new Date(viewDate + 'T00:00:00'); d.setDate(d.getDate()+1); setViewDate(format(d,'yyyy-MM-dd')) }}
                  style={{ padding: '6px 10px', borderRadius: 7, border: '1.5px solid var(--border)', background: '#fff', cursor: 'pointer', fontSize: 13, fontFamily: 'DM Sans, sans-serif', color: 'var(--slate)', minWidth: 36, minHeight: 36 }}>›</button>
                {!isToday && (
                  <button onClick={() => setViewDate(today)}
                    style={{ padding: '6px 10px', borderRadius: 7, border: '1.5px solid var(--teal)', background: 'var(--teal-light)', color: 'var(--teal)', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'DM Sans, sans-serif' }}>
                    Today
                  </button>
                )}
              </div>
              {/* Search — full width on mobile */}
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="🔍 Search…"
                style={{ border: '1.5px solid var(--border)', borderRadius: 8, padding: '7px 12px', fontSize: 13, outline: 'none', fontFamily: 'DM Sans, sans-serif', color: 'var(--navy)', width: isMobile ? '100%' : 200 }} />
              <Btn variant="ghost" small onClick={load}>🔄</Btn>
            </div>
          }
        />

        {/* ── Filter tabs — scrollable on mobile ── */}
        <div style={{
          display: 'flex', gap: 4,
          padding: '10px 16px',
          borderBottom: '1px solid var(--border)',
          overflowX: 'auto',
          // hide scrollbar visually but keep functionality
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}>
          {['all', 'scheduled', 'waiting', 'in-consultation', 'done', 'cancelled'].map(s => (
            <button key={s} onClick={() => setFilter(s)} style={{
              padding: '5px 12px', borderRadius: 20, border: 'none', cursor: 'pointer',
              fontSize: 11, fontFamily: 'DM Sans, sans-serif', textTransform: 'capitalize',
              background: filter === s ? 'var(--navy)' : 'var(--bg)',
              color: filter === s ? '#fff' : 'var(--slate)',
              fontWeight: filter === s ? 500 : 400,
              whiteSpace: 'nowrap', flexShrink: 0,
              minHeight: 32,
            }}>
              {s === 'all' ? `All (${appointments.length})` : `${STATUS_COLOR[s]?.label} (${appointments.filter(a => a.status === s).length})`}
            </button>
          ))}
        </div>

        {loading ? <Empty icon="⏳" message="Loading…" /> :
         filtered.length === 0 ? <Empty icon="📅" message="No appointments found" /> :

         /* ── MOBILE: card list ── */
         isMobile ? (
           <div style={{ padding: '12px 12px' }}>
             {filtered.map(a => <AppointmentCard key={a.id} a={a} />)}
           </div>
         ) : (

         /* ── DESKTOP: original table ── */
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg)' }}>
                {['Token', 'Patient', 'Time', 'Type', 'Status', 'Action', 'Fee', ''].map(h => (
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
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{canSeePhone ? a.phone : maskPhone(a.phone)} · {a.age}y · {a.gender}</div>
                    </td>
                    <td style={{ padding: '12px 18px', fontSize: 13, color: 'var(--slate)' }}>{a.appointmentTime}</td>
                    <td style={{ padding: '12px 18px', fontSize: 12, color: 'var(--muted)' }}>{a.visitType}</td>
                    <td style={{ padding: '12px 18px' }} onClick={canCallIn && a.status === 'waiting' ? e => { e.stopPropagation(); quickStatus(e, a.id, 'in-consultation') } : undefined}>
                      {canCallIn && a.status === 'waiting' ? (
                        <span title="Click to call in"
                          style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 500, background: sc.bg, color: sc.color, cursor: 'pointer', border: '1.5px solid var(--amber)', display: 'inline-block' }}>
                          {sc.label} →
                        </span>
                      ) : (
                        <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 500, background: sc.bg, color: sc.color }}>
                          {sc.label}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '12px 18px' }}>
                      <ActionCell a={a} />
                    </td>
                    <td style={{ padding: '12px 18px' }}>
                      <FeeCell a={a} />
                    </td>
                    <td style={{ padding: '12px 18px', color: 'var(--teal)', fontSize: 18 }}>›</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Card>

      {/* ── End Session Modal ── */}
      {showEndModal && endSession && (() => {
        const s = buildSummary(endSession)
        const sessLabel  = endSession === 'morning' ? '🌅 Morning' : '🌆 Evening'
        const doctorName = profile?.doctors?.[0]?.name || 'Doctor'
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(13,27,42,0.7)', display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', zIndex: 1000, padding: isMobile ? 0 : 20 }}>
            <div style={{ background: 'var(--surface)', borderRadius: isMobile ? '20px 20px 0 0' : 20, padding: isMobile ? '24px 20px 32px' : 32, width: '100%', maxWidth: isMobile ? '100%' : 480, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--navy)', marginBottom: 4 }}>End {sessLabel} Session</div>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 24 }}>Report will be sent to {doctorName} via WhatsApp</div>

              <div style={{ background: 'var(--bg)', borderRadius: 14, padding: '20px 22px', marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 }}>Session Summary</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  {[
                    { label: 'Total Seen',      value: s.total,            color: 'var(--navy)' },
                    { label: 'Waiting/Pending', value: s.waiting,          color: s.waiting > 0 ? 'var(--amber)' : 'var(--muted)' },
                    { label: 'New Visits',       value: s.newV,             color: 'var(--teal)' },
                    { label: 'Follow-ups',       value: s.followUp,         color: 'var(--teal)' },
                    { label: 'Collected',        value: `₹${s.collection}`, color: 'var(--green)' },
                    { label: 'Pending',          value: `₹${s.pending}`,    color: s.pending > 0 ? 'var(--amber)' : 'var(--muted)' },
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
                {s.pendingPatients.length > 0 && (
                  <div style={{ marginTop: 8, fontSize: 12, color: 'var(--amber)', background: 'var(--amber-bg)', borderRadius: 8, padding: '8px 12px' }}>
                    💰 Fee pending: {s.pendingPatients.map(p => `${p.patientName} (#${p.tokenNumber})`).join(', ')}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => { setShowEndModal(false); setEndSession(null) }}
                  style={{ flex: 1, padding: '13px', borderRadius: 10, border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--slate)', fontSize: 13, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontWeight: 500 }}>
                  Cancel
                </button>
                <button onClick={handleSendReport} disabled={sendingReport}
                  style={{ flex: 2, padding: '13px', borderRadius: 10, border: 'none', background: 'var(--teal)', color: '#fff', fontSize: 13, cursor: sendingReport ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif', fontWeight: 600, opacity: sendingReport ? 0.7 : 1 }}>
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
