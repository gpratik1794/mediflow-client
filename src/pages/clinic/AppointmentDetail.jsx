// src/pages/clinic/AppointmentDetail.jsx
import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../utils/AuthContext'
import Layout from '../../components/Layout'
import { Card, CardHeader, Btn, Input, Toast, Empty } from '../../components/UI'
import { getDoc, doc, collection, query, where, orderBy, getDocs } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { updateAppointment, getPrescriptions, getAppointments, VITALS_FIELDS } from '../../firebase/clinicDb'
import { format } from 'date-fns'

const STATUS_FLOW = ['scheduled', 'waiting', 'in-consultation', 'done']
const STATUS_LABELS = {
  scheduled: 'Scheduled', waiting: 'Waiting', 'in-consultation': 'In Consultation', done: 'Done', cancelled: 'Cancelled'
}
const STATUS_COLORS = {
  scheduled: { bg: 'var(--border)', color: 'var(--slate)' },
  waiting:   { bg: 'var(--amber-bg)', color: 'var(--amber)' },
  'in-consultation': { bg: 'var(--teal-light)', color: 'var(--teal)' },
  done:      { bg: 'var(--green-bg)', color: 'var(--green)' },
  cancelled: { bg: 'var(--red-bg)', color: 'var(--red)' },
}

export default function AppointmentDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [appt, setAppt]         = useState(null)
  const [prescriptions, setPresc] = useState([])
  const [loading, setLoading]   = useState(true)
  const [toast, setToast]       = useState(null)
  const [vitals, setVitals]     = useState({})
  const [notes, setNotes]       = useState('')
  const [savingVitals, setSavingVitals] = useState(false)

  useEffect(() => { if (user && id) loadData() }, [id, user])

  async function loadData() {
    setLoading(true)
    const snap = await getDoc(doc(db, 'centres', user.uid, 'appointments', id))
    if (snap.exists()) {
      const data = { id: snap.id, ...snap.data() }
      setAppt(data)
      setVitals(data.vitals || {})
      setNotes(data.clinicalNotes || '')
      // Load prescriptions for this patient
      const presc = await getPrescriptions(user.uid, data.phone)
      setPresc(presc)
    }
    setLoading(false)
  }

  async function handleStatusUpdate(newStatus) {
    // Late check-in penalty logic:
    // If this patient was skipped (status=scheduled, but patients after them have already
    // gone in-consultation or done), apply the penalty from profile settings.
    if (newStatus === 'waiting' && appt.status === 'scheduled') {
      const penalty = parseInt(profile?.lateCheckinPenalty || '0')
      if (penalty > 0) {
        // Count how many patients with higher token numbers have been called in or done today
        const allToday = await getAppointments(user.uid, appt.date)
        const skippedPast = allToday.filter(a =>
          a.id !== appt.id &&
          a.tokenNumber > appt.tokenNumber &&
          (a.status === 'in-consultation' || a.status === 'done')
        ).length

        if (skippedPast > 0) {
          // Patient is late — find current last token and push them back by penalty count
          const activeTokens = allToday
            .filter(a => a.status !== 'cancelled')
            .map(a => a.tokenNumber)
          const maxToken = Math.max(...activeTokens)
          const newPosition = maxToken + penalty

          await updateAppointment(user.uid, id, {
            status: 'waiting',
            tokenNumber: newPosition,
            lateCheckin: true,
            originalToken: appt.tokenNumber
          })
          setAppt(a => ({ ...a, status: 'waiting', tokenNumber: newPosition, lateCheckin: true }))
          setToast({
            message: `Late check-in: token reassigned to #${newPosition} (${penalty} patient wait penalty)`,
            type: 'info'
          })
          return
        }
      }
    }

    await updateAppointment(user.uid, id, { status: newStatus })
    setAppt(a => ({ ...a, status: newStatus }))
    setToast({ message: `Status → ${STATUS_LABELS[newStatus]}`, type: 'success' })
  }

  async function handleSaveVitals() {
    setSavingVitals(true)
    await updateAppointment(user.uid, id, { vitals, clinicalNotes: notes })
    setToast({ message: 'Vitals & notes saved', type: 'success' })
    setSavingVitals(false)
  }

  if (loading) return <Layout title="Appointment"><Empty icon="⏳" message="Loading…" /></Layout>
  if (!appt)   return <Layout title="Not found"><div style={{ padding: 40, color: 'var(--muted)' }}>Appointment not found</div></Layout>

  const currentIdx = STATUS_FLOW.indexOf(appt.status)
  const sc = STATUS_COLORS[appt.status] || STATUS_COLORS.scheduled

  return (
    <Layout
      title={`#${appt.tokenNumber} — ${appt.patientName}`}
      action={
        <div style={{ display: 'flex', gap: 10 }}>
          <Btn variant="ghost" small onClick={() => navigate(-1)}>← Back</Btn>
          {appt.status === 'in-consultation' && (
            <Btn onClick={() => navigate(`/clinic/prescription/new?apptId=${id}&phone=${appt.phone}&name=${encodeURIComponent(appt.patientName)}&age=${appt.age}&gender=${appt.gender}`)}>
              ✍ Write Prescription
            </Btn>
          )}
        </div>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20 }}>

        {/* LEFT */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Status tracker */}
          <Card>
            <CardHeader title="Consultation Status" />
            <div style={{ padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
                {STATUS_FLOW.map((s, i) => (
                  <React.Fragment key={s}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 13, fontWeight: 600, cursor: i === currentIdx + 1 ? 'pointer' : 'default',
                        background: i <= currentIdx ? 'var(--teal)' : 'var(--border)',
                        color: i <= currentIdx ? '#fff' : 'var(--muted)', transition: 'all 0.2s'
                      }} onClick={() => i === currentIdx + 1 && handleStatusUpdate(s)}>
                        {i < currentIdx ? '✓' : i + 1}
                      </div>
                      <span style={{ fontSize: 10, color: i <= currentIdx ? 'var(--teal)' : 'var(--muted)', textAlign: 'center', maxWidth: 70 }}>
                        {STATUS_LABELS[s]}
                      </span>
                    </div>
                    {i < STATUS_FLOW.length - 1 && (
                      <div style={{ flex: 1, height: 3, background: i < currentIdx ? 'var(--teal)' : 'var(--border)', margin: '0 6px', marginBottom: 18, transition: 'background 0.3s' }} />
                    )}
                  </React.Fragment>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                {currentIdx < STATUS_FLOW.length - 1 && (
                  <Btn onClick={() => handleStatusUpdate(STATUS_FLOW[currentIdx + 1])} style={{ flex: 1, justifyContent: 'center' }}>
                    → Move to {STATUS_LABELS[STATUS_FLOW[currentIdx + 1]]}
                  </Btn>
                )}
                {appt.status !== 'cancelled' && appt.status !== 'done' && (
                  <Btn variant="danger" onClick={() => handleStatusUpdate('cancelled')} style={{ justifyContent: 'center' }}>
                    Cancel
                  </Btn>
                )}
              </div>
            </div>
          </Card>

          {/* Vitals */}
          <Card>
            <CardHeader title="Vitals" sub="Record before consultation" />
            <div style={{ padding: '20px 24px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 16 }}>
                {VITALS_FIELDS.map(f => (
                  <div key={f.key}>
                    <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 500, display: 'block', marginBottom: 5 }}>
                      {f.label} <span style={{ color: 'var(--teal)' }}>({f.unit})</span>
                    </label>
                    <input value={vitals[f.key] || ''} onChange={e => setVitals(v => ({ ...v, [f.key]: e.target.value }))}
                      placeholder={f.placeholder}
                      style={{ width: '100%', border: '1.5px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none', fontFamily: 'DM Sans, sans-serif', color: 'var(--navy)', transition: 'border 0.18s' }}
                      onFocus={e => e.target.style.borderColor = 'var(--teal)'}
                      onBlur={e => e.target.style.borderColor = 'var(--border)'}
                    />
                  </div>
                ))}
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 500, display: 'block', marginBottom: 5 }}>Clinical Notes</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)}
                  placeholder="Chief complaint, examination findings, diagnosis…"
                  rows={3} style={{ width: '100%', border: '1.5px solid var(--border)', borderRadius: 8, padding: '10px 12px', fontSize: 13, outline: 'none', fontFamily: 'DM Sans, sans-serif', color: 'var(--navy)', resize: 'vertical', transition: 'border 0.18s' }}
                  onFocus={e => e.target.style.borderColor = 'var(--teal)'}
                  onBlur={e => e.target.style.borderColor = 'var(--border)'}
                />
              </div>
              <Btn onClick={handleSaveVitals} disabled={savingVitals} small>
                {savingVitals ? 'Saving…' : '💾 Save Vitals & Notes'}
              </Btn>
            </div>
          </Card>

          {/* Past prescriptions */}
          <Card>
            <CardHeader title="Past Prescriptions" sub="Last 6 months" />
            {prescriptions.length === 0 ? (
              <Empty icon="📝" message="No previous prescriptions for this patient" />
            ) : (
              <div>
                {prescriptions.map(p => (
                  <div key={p.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 22px', borderBottom: '1px solid var(--border)', cursor: 'pointer'
                  }}
                    onClick={() => navigate(`/clinic/prescription/${p.id}`)}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--teal-light)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--navy)' }}>{p.diagnosis || 'Prescription'}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{p.date} · {(p.medicines || []).length} medicines</div>
                    </div>
                    <span style={{ color: 'var(--teal)', fontSize: 18 }}>›</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* RIGHT */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card>
            <CardHeader title="Patient Info" />
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{
                width: 52, height: 52, borderRadius: 14, background: 'var(--teal-light)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22, fontWeight: 700, color: 'var(--teal)', margin: '4px auto 8px'
              }}>
                {appt.patientName?.charAt(0)}
              </div>
              {[
                ['Name', appt.patientName],
                ['Phone', appt.phone],
                ['Age / Gender', `${appt.age}y · ${appt.gender}`],
                ['Visit Type', appt.visitType],
                ['Token', `#${appt.tokenNumber}`],
                ['Time', appt.appointmentTime],
                ['Complaint', appt.chiefComplaint || '—'],
              ].map(([l, v]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'var(--muted)' }}>{l}</span>
                  <span style={{ fontWeight: 500, color: 'var(--navy)', textAlign: 'right', maxWidth: 160 }}>{v}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--muted)' }}>Status</span>
                <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: sc.bg, color: sc.color }}>
                  {STATUS_LABELS[appt.status]}
                </span>
              </div>
            </div>
          </Card>

          {appt.status === 'in-consultation' && (
            <div style={{ background: 'var(--teal)', borderRadius: 'var(--radius)', padding: '16px 20px', textAlign: 'center' }}>
              <div style={{ color: '#fff', fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                Patient is in consultation
              </div>
              <Btn onClick={() => navigate(`/clinic/prescription/new?apptId=${id}&phone=${appt.phone}&name=${encodeURIComponent(appt.patientName)}&age=${appt.age}&gender=${appt.gender}`)}
                style={{ background: '#fff', color: 'var(--teal)', width: '100%', justifyContent: 'center' }}>
                ✍ Write Prescription
              </Btn>
            </div>
          )}
        </div>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </Layout>
  )
}
