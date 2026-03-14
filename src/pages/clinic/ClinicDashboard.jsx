// src/pages/clinic/ClinicDashboard.jsx
import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../utils/AuthContext'
import Layout from '../../components/Layout'
import { StatCard, Card, CardHeader, Btn, Badge, Empty } from '../../components/UI'
import { getAppointments, getUpcomingFollowUps, subscribeToAppointments } from '../../firebase/clinicDb'
import { format } from 'date-fns'

const APPT_STATUS_COLOR = {
  scheduled:        { bg: 'var(--border)',     color: 'var(--slate)',  label: 'Scheduled' },
  waiting:          { bg: 'var(--amber-bg)',   color: 'var(--amber)',  label: 'Waiting' },
  'in-consultation':{ bg: 'var(--teal-light)', color: 'var(--teal)',   label: 'In Consultation' },
  done:             { bg: 'var(--green-bg)',   color: 'var(--green)',  label: 'Done' },
  cancelled:        { bg: 'var(--red-bg)',     color: 'var(--red)',    label: 'Cancelled' },
}

function ApptBadge({ status }) {
  const s = APPT_STATUS_COLOR[status] || APPT_STATUS_COLOR.scheduled
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 500,
      background: s.bg, color: s.color
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.color }} />
      {s.label}
    </span>
  )
}

function maskPhone(phone) {
  if (!phone) return ''
  const p = String(phone).replace(/[^0-9]/g, '')
  if (p.length < 6) return '••••••'
  return p.slice(0, 2) + '••••••' + p.slice(-2)
}

export default function ClinicDashboard() {
  const { user, profile } = useAuth()
  const centreId = profile?._centreId || user?.uid
  const navigate = useNavigate()
  const [appointments, setAppointments] = useState([])
  const [followUps, setFollowUps]       = useState([])
  const [loading, setLoading]           = useState(true)
  const unsubRef = useRef(null)
  const today    = format(new Date(), 'yyyy-MM-dd')
  const hour     = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  // ── Mobile detection ──
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    if (!user || !centreId) return
    if (unsubRef.current) unsubRef.current()
    setLoading(true)
    unsubRef.current = subscribeToAppointments(centreId, today, data => {
      setAppointments(data)
      setLoading(false)
    })
    getUpcomingFollowUps(centreId).then(setFollowUps)
    return () => { if (unsubRef.current) unsubRef.current() }
  }, [user, centreId])

  async function loadData() {
    if (centreId) getUpcomingFollowUps(centreId).then(setFollowUps)
  }

  const total     = appointments.length
  const waiting   = appointments.filter(a => a.status === 'waiting').length
  const done      = appointments.filter(a => a.status === 'done').length
  const inConsult = appointments.filter(a => a.status === 'in-consultation').length
  const revenue   = appointments
    .filter(a => a.paymentStatus === 'paid')
    .reduce((sum, a) => sum + (Number(a.consultationFee) || 0), 0)
  const pending   = appointments
    .filter(a => a.paymentStatus !== 'paid' && a.status !== 'cancelled')
    .reduce((sum, a) => sum + (Number(a.consultationFee) || 0), 0)

  // ── Mobile queue card ──
  function QueueCard({ a }) {
    return (
      <div
        onClick={() => navigate(`/clinic/appointments/${a.id}`)}
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '13px 16px', borderBottom: '1px solid var(--border)',
          cursor: 'pointer',
        }}
      >
        {/* Token */}
        <div style={{
          width: 40, height: 40, borderRadius: 10, flexShrink: 0,
          background: a.status === 'in-consultation' ? 'var(--teal)' : 'var(--bg)',
          color: a.status === 'in-consultation' ? '#fff' : 'var(--navy)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 15, fontWeight: 700,
        }}>
          {a.tokenNumber}
        </div>
        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--navy)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {a.patientName}
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
            {a.appointmentTime || '—'} · {a.visitType || 'New Visit'}
          </div>
        </div>
        {/* Status badge */}
        <ApptBadge status={a.status} />
        <span style={{ color: 'var(--teal)', fontSize: 18, flexShrink: 0 }}>›</span>
      </div>
    )
  }

  return (
    <Layout
      title={`${greeting}, Dr. ${profile?.ownerName?.split(' ').pop() || ''} 👋`}
      action={
        <Btn onClick={() => navigate('/clinic/appointments/new')}>
          {isMobile ? '+ Book' : '+ Book Appointment'}
        </Btn>
      }
    >

      {/* ── STATS ── */}
      {isMobile ? (
        // Mobile: 2x2 grid + revenue full width
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <StatCard icon="👥" label="Today"         value={total}     color="teal"  />
            <StatCard icon="⏳" label="Waiting"       value={waiting}   color="amber" />
            <StatCard icon="🩺" label="Consulting"    value={inConsult} color="teal"  />
            <StatCard icon="✅" label="Done"          value={done}      color="green" />
          </div>
          <StatCard icon="₹" label="Revenue Today" value={`₹${revenue.toLocaleString('en-IN')}`} color="teal" />
        </div>
      ) : (
        // Desktop: 5 columns
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 16, marginBottom: 24 }}>
          <StatCard icon="👥" label="Appointments Today" value={total}     color="teal"  />
          <StatCard icon="⏳" label="Waiting"            value={waiting}   color="amber" />
          <StatCard icon="🩺" label="In Consultation"    value={inConsult} color="teal"  />
          <StatCard icon="✅" label="Completed"          value={done}      color="green" />
          <StatCard icon="₹"  label="Revenue Today"      value={`₹${revenue.toLocaleString('en-IN')}`} color="teal" />
        </div>
      )}

      {/* ── MAIN CONTENT ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '1fr 320px',
        gap: 20,
      }}>

        {/* QUEUE */}
        <Card>
          <CardHeader
            title="Today's Queue"
            sub={`${total} appointments · Token-based queue`}
            action={
              <div style={{ display: 'flex', gap: 8 }}>
                <Btn variant="ghost" small onClick={loadData}>🔄</Btn>
                {!isMobile && <Btn small onClick={() => navigate('/clinic/appointments/new')}>+ Book</Btn>}
              </div>
            }
          />

          {/* Queue status bar */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
            {[
              { label: 'Waiting',    count: waiting,   color: 'var(--amber)' },
              { label: 'Consulting', count: inConsult,  color: 'var(--teal)'  },
              { label: 'Done',       count: done,       color: 'var(--green)' },
            ].map(s => (
              <div key={s.label} style={{ flex: 1, textAlign: 'center', padding: '10px 0', borderRight: '1px solid var(--border)' }}>
                <div style={{ fontSize: isMobile ? 22 : 20, fontWeight: 700, color: s.color }}>{s.count}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>{s.label}</div>
              </div>
            ))}
          </div>

          {loading ? <Empty icon="⏳" message="Loading queue…" /> :
           appointments.length === 0 ? (
            <Empty icon="📅" message="No appointments today. Book the first one!" />
          ) : isMobile ? (
            // Mobile: card rows
            <div>
              {appointments.map(a => <QueueCard key={a.id} a={a} />)}
            </div>
          ) : (
            // Desktop: table
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg)' }}>
                  {['Token', 'Patient', 'Type', 'Time', 'Status', ''].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '10px 18px', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--muted)', fontWeight: 500, borderBottom: '1px solid var(--border)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {appointments.map(a => (
                  <tr key={a.id}
                    style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                    onClick={() => navigate(`/clinic/appointments/${a.id}`)}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--teal-light)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '12px 18px' }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: 10,
                        background: a.status === 'in-consultation' ? 'var(--teal)' : 'var(--bg)',
                        color: a.status === 'in-consultation' ? '#fff' : 'var(--navy)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 14, fontWeight: 700,
                      }}>
                        {a.tokenNumber}
                      </div>
                    </td>
                    <td style={{ padding: '12px 18px' }}>
                      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)' }}>{a.patientName}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{maskPhone(a.phone)} · {a.age}y</div>
                    </td>
                    <td style={{ padding: '12px 18px', fontSize: 12, color: 'var(--slate)' }}>{a.visitType || 'New Visit'}</td>
                    <td style={{ padding: '12px 18px', fontSize: 12, color: 'var(--muted)' }}>{a.appointmentTime || '—'}</td>
                    <td style={{ padding: '12px 18px' }}><ApptBadge status={a.status} /></td>
                    <td style={{ padding: '12px 18px', color: 'var(--teal)', fontSize: 18 }}>›</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        {/* RIGHT COLUMN */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Follow-ups */}
          <Card>
            <CardHeader
              title="Follow-ups Due"
              sub="Next 7 days"
              action={<Btn variant="ghost" small onClick={() => navigate('/clinic/followups')}>View All</Btn>}
            />
            {followUps.length === 0 ? (
              <Empty icon="📆" message="No follow-ups due this week" />
            ) : (
              <div style={{ padding: '8px 0' }}>
                {followUps.slice(0, 5).map(f => (
                  <div key={f.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '11px 18px', borderBottom: '1px solid var(--border)',
                    cursor: 'pointer',
                  }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                      background: f.followUpDate === today ? 'var(--red-bg)' : 'var(--teal-light)',
                      color: f.followUpDate === today ? 'var(--red)' : 'var(--teal)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 13, fontWeight: 700,
                    }}>
                      {f.patientName?.charAt(0)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--navy)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.patientName}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{f.followUpDate}</div>
                    </div>
                    {f.followUpDate === today && (
                      <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--red)', background: 'var(--red-bg)', padding: '2px 8px', borderRadius: 20, flexShrink: 0 }}>TODAY</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Quick actions */}
          <Card>
            <CardHeader title="Quick Actions" />
            <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { label: '+ Book Appointment',   to: '/clinic/appointments/new' },
                { label: '📋 All Appointments',   to: '/clinic/appointments' },
                { label: '👥 Patients',           to: '/clinic/patients' },
                { label: '💊 New Prescription',   to: '/clinic/prescription/new' },
                { label: '🔔 Follow-up Schedule', to: '/clinic/followups' },
              ].map(a => (
                <button key={a.label} onClick={() => navigate(a.to)} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '12px 14px', borderRadius: 10, border: '1.5px solid var(--border)',
                  background: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--slate)',
                  fontFamily: 'DM Sans, sans-serif', textAlign: 'left', transition: 'all 0.18s',
                  minHeight: 44,
                }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--teal)'; e.currentTarget.style.color = 'var(--teal)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--slate)' }}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </Layout>
  )
}
