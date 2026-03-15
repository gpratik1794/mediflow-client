// src/pages/clinic/AppointmentDetail.jsx
import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../utils/AuthContext'
import Layout from '../../components/Layout'
import { Card, CardHeader, Btn, Toast, Empty } from '../../components/UI'
import { getDoc, doc } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { updateAppointment, logActivity, getPrescriptions, getAppointments, VITALS_FIELDS } from '../../firebase/clinicDb'
import WhatsAppLog from '../../components/WhatsAppLog'

const STATUS_FLOW   = ['scheduled', 'waiting', 'in-consultation', 'done']
const STATUS_LABELS = { scheduled: 'Scheduled', waiting: 'Waiting', 'in-consultation': 'In Consultation', done: 'Done', cancelled: 'Cancelled' }
const STATUS_COLORS = {
  scheduled:        { bg: 'var(--border)',      color: 'var(--slate)' },
  waiting:          { bg: 'var(--amber-bg)',     color: 'var(--amber)' },
  'in-consultation':{ bg: 'var(--teal-light)',   color: 'var(--teal)' },
  done:             { bg: 'var(--green-bg)',      color: 'var(--green)' },
  cancelled:        { bg: 'var(--red-bg)',        color: 'var(--red)' },
}

function maskPhone(phone) {
  if (!phone) return ''
  const p = String(phone).replace(/[^0-9]/g,'')
  if (p.length < 6) return '••••••'
  return p.slice(0, 2) + '••••••' + p.slice(-2)
}

// ── Locked placeholder for receptionist ──────────────────────────────────────
function Locked({ label }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      background: 'var(--bg)', borderRadius: 10,
      border: '1px dashed var(--border)', padding: '12px 16px',
      fontSize: 12, color: 'var(--muted)', marginBottom: 8
    }}>
      <svg width="12" height="14" viewBox="0 0 12 14" fill="none">
        <rect x="1" y="6" width="10" height="8" rx="2" stroke="currentColor" strokeWidth="1.4"/>
        <path d="M3.5 6V4.5a2.5 2.5 0 015 0V6" stroke="currentColor" strokeWidth="1.4"/>
      </svg>
      {label}
    </div>
  )
}

export default function AppointmentDetail() {
  const { id } = useParams()
  const { user, profile, role, userRecord } = useAuth()
  const centreId    = profile?._centreId || user?.uid
  const canSeePhone = !role || userRecord?.permissions?.showPhone === true

  const isReceptionist = role === 'receptionist'
  const canCallIn      = !isReceptionist
  const canPrescribe   = !isReceptionist
  const canEditFee     = true
  const canSeePrescriptions = !isReceptionist

  const navigate = useNavigate()
  const [appt, setAppt]               = useState(null)
  const [prescriptions, setPresc]     = useState([])
  const [loading, setLoading]         = useState(true)
  const [toast, setToast]             = useState(null)
  const [vitals, setVitals]           = useState({})
  const [notes, setNotes]             = useState('')
  const [savingVitals, setSavingVitals] = useState(false)
  const [fee, setFee]                 = useState('')
  const [paymentStatus, setPaymentStatus] = useState('pending')
  const [savingFee, setSavingFee]     = useState(false)
  const [prescBlockModal, setPrescBlockModal] = useState(false)

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => { if (user && id && centreId) loadData() }, [id, user, centreId])

  async function loadData() {
    setLoading(true)
    try {
      const snap = await getDoc(doc(db, 'centres', centreId, 'appointments', id))
      if (snap.exists()) {
        const data = { id: snap.id, ...snap.data() }
        setAppt(data)
        setVitals(data.vitals || {})
        setNotes(data.clinicalNotes || '')
        setFee(data.consultationFee || '')
        setPaymentStatus(data.paymentStatus || 'pending')
        if (canSeePrescriptions) {
          try {
            const presc = await getPrescriptions(centreId, data.phone)
            setPresc(presc)
          } catch (e) { console.warn('[Prescriptions] Index may be missing:', e) }
        }
      }
    } catch (e) { console.error('[AppointmentDetail] Load failed:', e) }
    setLoading(false)
  }

  function hasPrescriptionForThisAppt() {
    return prescriptions.some(p => p.appointmentId === id || p.apptId === id)
  }

  async function handleStatusUpdate(newStatus) {
    // Gate: only doctor/owner can move past waiting
    if (isReceptionist && newStatus !== 'waiting') return

    // Gate: block done without prescription
    if (newStatus === 'done' && appt.status === 'in-consultation') {
      if (!hasPrescriptionForThisAppt()) { setPrescBlockModal(true); return }
    }

    try {
      if (newStatus === 'waiting' && appt.status === 'scheduled') {
        const penalty = parseInt(profile?.lateCheckinPenalty || '0')
        if (penalty > 0) {
          try {
            const allToday = await getAppointments(centreId, appt.date)
            const checkedIn = allToday.filter(a =>
              a.id !== appt.id && ['waiting', 'in-consultation', 'done'].includes(a.status)
            )
            const skippedPast = checkedIn.filter(a => a.tokenNumber > appt.tokenNumber).length
            if (skippedPast > 0) {
              const maxToken = checkedIn.length > 0 ? Math.max(...checkedIn.map(a => a.tokenNumber)) : appt.tokenNumber
              const newPosition = maxToken + penalty
              await updateAppointment(centreId, id, { status: 'waiting', tokenNumber: newPosition, lateCheckin: true, originalToken: appt.tokenNumber })
              setAppt(a => ({ ...a, status: 'waiting', tokenNumber: newPosition, lateCheckin: true }))
              setToast({ message: `Late check-in: token #${newPosition} (${penalty} patient penalty)`, type: 'info' })
              return
            }
          } catch (penaltyErr) { console.warn('[Penalty check failed]', penaltyErr) }
        }
      }
      await updateAppointment(centreId, id, { status: newStatus })
      const labelMap = { done: 'Appointment Done', cancelled: 'Appointment Cancelled', 'in-consultation': 'In Consultation', waiting: 'Waiting' }
      logActivity(centreId, { action: 'appt_status_changed', label: labelMap[newStatus] || 'Status Changed', detail: appt?.patientName || id, by: user?.email || '' })
      setAppt(a => ({ ...a, status: newStatus }))
      setToast({ message: `Status → ${STATUS_LABELS[newStatus]}`, type: 'success' })
    } catch (e) {
      setToast({ message: 'Failed to update status. Try again.', type: 'error' })
    }
  }

  async function handleSaveVitals() {
    setSavingVitals(true)
    await updateAppointment(centreId, id, { vitals, clinicalNotes: notes })
    setToast({ message: 'Vitals & notes saved', type: 'success' })
    setSavingVitals(false)
  }

  async function handleSaveFee() {
    setSavingFee(true)
    await updateAppointment(centreId, id, { consultationFee: fee, paymentStatus })
    setAppt(a => ({ ...a, consultationFee: fee, paymentStatus }))
    setToast({ message: 'Fee updated', type: 'success' })
    setSavingFee(false)
  }

  if (loading) return <Layout title="Appointment"><Empty icon="⏳" message="Loading…" /></Layout>
  if (!appt)   return <Layout title="Not found"><div style={{ padding: 40, color: 'var(--muted)' }}>Appointment not found</div></Layout>

  const currentIdx = STATUS_FLOW.indexOf(appt.status)
  const sc = STATUS_COLORS[appt.status] || STATUS_COLORS.scheduled
  const showPrescWarning = appt.status === 'in-consultation' && !hasPrescriptionForThisAppt() && canPrescribe

  const iStyle = { width: '100%', border: '1.5px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none', fontFamily: 'DM Sans, sans-serif', color: 'var(--navy)', boxSizing: 'border-box', transition: 'border 0.18s' }

  return (
    <Layout
      title={`#${appt.tokenNumber} — ${appt.patientName}`}
      action={
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn variant="ghost" small onClick={() => navigate(-1)}>← Back</Btn>
          {canPrescribe && appt.status === 'in-consultation' && (
            <Btn small onClick={() => navigate(`/clinic/prescription/new?apptId=${id}&phone=${appt.phone}&name=${encodeURIComponent(appt.patientName)}&age=${appt.age}&gender=${appt.gender}`)}>
              {isMobile ? '✍ Rx' : '✍ Write Prescription'}
            </Btn>
          )}
        </div>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 320px', gap: 20 }}>

        {/* ── LEFT ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Prescription warning (doctor only) */}
          {showPrescWarning && (
            <div style={{ background: '#FFF7ED', border: '1.5px solid #F97316', borderRadius: 12, padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <div style={{ fontWeight: 700, color: '#9A3412', fontSize: 13, marginBottom: 2 }}>✍ Write prescription before marking as Done</div>
                <div style={{ fontSize: 12, color: '#C2410C' }}>A prescription must be saved before this appointment can be closed.</div>
              </div>
              <Btn small onClick={() => navigate(`/clinic/prescription/new?apptId=${id}&phone=${appt.phone}&name=${encodeURIComponent(appt.patientName)}&age=${appt.age}&gender=${appt.gender}`)}>
                ✍ Write Now
              </Btn>
            </div>
          )}

          {/* ── Status tracker — DOCTOR / OWNER only ── */}
          {!isReceptionist && (
            <Card>
              <CardHeader title="Consultation Status" />
              <div style={{ padding: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
                  {STATUS_FLOW.map((s, i) => (
                    <React.Fragment key={s}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                        <div style={{
                          width: isMobile ? 44 : 36, height: isMobile ? 44 : 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: isMobile ? 15 : 13, fontWeight: 600,
                          cursor: i === currentIdx + 1 && !(s === 'done' && showPrescWarning) ? 'pointer' : 'default',
                          background: i <= currentIdx ? 'var(--teal)' : (s === 'done' && showPrescWarning ? '#E5E7EB' : 'var(--border)'),
                          color: i <= currentIdx ? '#fff' : 'var(--muted)', transition: 'all 0.2s'
                        }} onClick={() => {
                          if (i !== currentIdx + 1) return
                          if (s === 'done' && showPrescWarning) { setPrescBlockModal(true); return }
                          handleStatusUpdate(s)
                        }}>
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
                    STATUS_FLOW[currentIdx + 1] === 'done' && showPrescWarning ? (
                      <button onClick={() => setPrescBlockModal(true)} style={{ flex: 1, padding: '10px 16px', borderRadius: 10, border: '1.5px solid #F97316', background: '#FFF7ED', color: '#9A3412', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'DM Sans, sans-serif', textAlign: 'center' }}>
                        🔒 Write Prescription First
                      </button>
                    ) : (
                      <Btn onClick={() => handleStatusUpdate(STATUS_FLOW[currentIdx + 1])} style={{ flex: 1, justifyContent: 'center' }}>
                        → Move to {STATUS_LABELS[STATUS_FLOW[currentIdx + 1]]}
                      </Btn>
                    )
                  )}
                  {appt.status !== 'cancelled' && appt.status !== 'done' && (
                    <Btn variant="danger" onClick={() => handleStatusUpdate('cancelled')} style={{ justifyContent: 'center' }}>Cancel</Btn>
                  )}
                </div>
              </div>
            </Card>
          )}

          {/* ── Receptionist: check-in action only ── */}
          {isReceptionist && appt.status === 'scheduled' && (
            <div style={{ background: 'var(--amber-bg)', border: '1.5px solid var(--amber)', borderRadius: 12, padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--amber)' }}>Patient has arrived — check them in</div>
              <Btn onClick={() => handleStatusUpdate('waiting')}>✓ Check In</Btn>
            </div>
          )}

          {/* ── Vitals — both roles can see and save ── */}
          <Card>
            <CardHeader title="Vitals" sub={isReceptionist ? 'Take before doctor sees patient' : 'Record before consultation'} />
            <div style={{ padding: '20px 24px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: 14, marginBottom: 16 }}>
                {VITALS_FIELDS.map(f => (
                  <div key={f.key}>
                    <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 500, display: 'block', marginBottom: 5 }}>
                      {f.label} <span style={{ color: 'var(--teal)' }}>({f.unit})</span>
                    </label>
                    <input value={vitals[f.key] || ''} onChange={e => setVitals(v => ({ ...v, [f.key]: e.target.value }))}
                      placeholder={f.placeholder}
                      style={iStyle}
                      onFocus={e => e.target.style.borderColor = 'var(--teal)'}
                      onBlur={e => e.target.style.borderColor = 'var(--border)'}
                    />
                  </div>
                ))}
              </div>
              {!isReceptionist && (
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 500, display: 'block', marginBottom: 5 }}>Clinical Notes</label>
                  <textarea value={notes} onChange={e => setNotes(e.target.value)}
                    placeholder="Chief complaint, examination findings, diagnosis…"
                    rows={3} style={{ ...iStyle, resize: 'vertical' }}
                    onFocus={e => e.target.style.borderColor = 'var(--teal)'}
                    onBlur={e => e.target.style.borderColor = 'var(--border)'}
                  />
                </div>
              )}
              <Btn onClick={handleSaveVitals} disabled={savingVitals} small>
                {savingVitals ? 'Saving…' : isReceptionist ? '💾 Save Vitals' : '💾 Save Vitals & Notes'}
              </Btn>
            </div>
          </Card>

          {/* ── Past prescriptions — DOCTOR / OWNER only ── */}
          {canSeePrescriptions && (
            <Card>
              <CardHeader title="Past Prescriptions" sub="Prescription History" />
              {prescriptions.length === 0 ? (
                <Empty icon="📝" message="No previous prescriptions for this patient" />
              ) : (
                <div>
                  {prescriptions.map(p => (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 22px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
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
          )}

          {/* ── Locked: receptionist cannot see prescriptions ── */}
          {isReceptionist && <Locked label="Prescriptions — not visible to receptionist" />}
        </div>

        {/* ── RIGHT ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card>
            <CardHeader title="Patient Info" />
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ width: 52, height: 52, borderRadius: 14, background: 'var(--teal-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 700, color: 'var(--teal)', margin: '4px auto 8px' }}>
                {appt.patientName?.charAt(0)}
              </div>
              {[
                ['Name', appt.patientName],
                ['Phone', canSeePhone ? appt.phone : maskPhone(appt.phone)],
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
                <span style={{ color: 'var(--muted)' }}>Fee</span>
                <span style={{ fontWeight: 600, color: 'var(--navy)' }}>{appt.consultationFee ? `₹${appt.consultationFee}` : '—'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--muted)' }}>Payment</span>
                <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: appt.paymentStatus === 'paid' ? 'var(--green-bg)' : 'var(--amber-bg)', color: appt.paymentStatus === 'paid' ? 'var(--green)' : 'var(--amber)' }}>
                  {appt.paymentStatus === 'paid' ? '✓ Paid' : appt.paymentStatus === 'free' ? 'Free' : 'Pending'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--muted)' }}>Status</span>
                <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: sc.bg, color: sc.color }}>
                  {STATUS_LABELS[appt.status]}
                </span>
              </div>
            </div>
          </Card>

          {/* ── Fee card — always visible, receptionist can collect ── */}
          <Card>
            <CardHeader title="💰 Consultation Fee" sub={isReceptionist ? 'Collect payment after visit' : 'Update fee or mark as paid'} />
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Receptionist: if visit done and fee pending — highlight */}
              {isReceptionist && appt.status === 'done' && appt.paymentStatus === 'pending' && (
                <div style={{ background: 'var(--amber-bg)', border: '1px solid var(--amber)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: 'var(--amber)', fontWeight: 600 }}>
                  ⏳ Visit complete — please collect fee
                </div>
              )}
              {/* Fee amount — doctor/owner can edit; receptionist sees it read-only */}
              {!isReceptionist ? (
                <div>
                  <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 500, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.4 }}>Amount (₹)</label>
                  <input type="text" inputMode="numeric" pattern="[0-9]*"
                    value={fee} onChange={e => setFee(e.target.value.replace(/\D/g, ''))}
                    placeholder="e.g. 500"
                    style={{ ...iStyle, MozAppearance: 'textfield', WebkitAppearance: 'none', appearance: 'none' }}
                    onFocus={e => e.target.style.borderColor = 'var(--teal)'}
                    onBlur={e => e.target.style.borderColor = 'var(--border)'}
                  />
                </div>
              ) : (
                appt.consultationFee ? (
                  <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--navy)', textAlign: 'center', padding: '8px 0' }}>₹{appt.consultationFee}</div>
                ) : (
                  <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>Fee not set by doctor</div>
                )
              )}

              {/* Payment status buttons */}
              <div style={{ display: 'flex', gap: 8 }}>
                {(isReceptionist ? ['paid', 'free'] : ['pending', 'paid', 'free']).map(s => (
                  <button key={s} type="button"
                    onClick={() => setPaymentStatus(s)}
                    // Receptionist cannot undo free — once free, locked
                    disabled={isReceptionist && appt.paymentStatus === 'free'}
                    style={{
                      flex: 1, padding: '8px 4px', borderRadius: 8, border: '1.5px solid',
                      borderColor: paymentStatus === s ? 'var(--teal)' : 'var(--border)',
                      background: paymentStatus === s ? 'var(--teal-light)' : 'var(--surface)',
                      color: paymentStatus === s ? 'var(--teal)' : 'var(--slate)',
                      fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
                      textTransform: 'capitalize', opacity: isReceptionist && appt.paymentStatus === 'free' ? 0.5 : 1
                    }}>
                    {s === 'paid' ? '✓ Paid' : s === 'free' ? '🆓 Free' : '⏳ Pending'}
                  </button>
                ))}
              </div>
              <Btn onClick={handleSaveFee} disabled={savingFee || (isReceptionist && appt.paymentStatus === 'free')} small>
                {savingFee ? 'Saving…' : '💾 Save Fee'}
              </Btn>
            </div>
          </Card>

          {/* Write prescription prompt card — doctor only */}
          {canPrescribe && appt.status === 'in-consultation' && (
            <div style={{ background: 'var(--teal)', borderRadius: 'var(--radius)', padding: '16px 20px', textAlign: 'center' }}>
              <div style={{ color: '#fff', fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Patient is in consultation</div>
              <Btn onClick={() => navigate(`/clinic/prescription/new?apptId=${id}&phone=${appt.phone}&name=${encodeURIComponent(appt.patientName)}&age=${appt.age}&gender=${appt.gender}`)}
                style={{ background: '#fff', color: 'var(--teal)', width: '100%', justifyContent: 'center' }}>
                ✍ Write Prescription
              </Btn>
            </div>
          )}

          {/* WhatsApp Activity — doctor / owner only */}
          {!isReceptionist && (
            <Card>
              <CardHeader title="WhatsApp Activity" sub="Sent messages & patient replies" />
              <WhatsAppLog centreId={centreId} apptId={id} />
            </Card>
          )}
        </div>
      </div>

      {/* Prescription block modal */}
      {prescBlockModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobile ? 0 : 20 }}>
          <div style={{ background: 'white', borderRadius: isMobile ? '20px 20px 0 0' : 16, padding: isMobile ? '28px 20px 36px' : 32, maxWidth: isMobile ? '100%' : 420, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✍</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--navy)', marginBottom: 8 }}>Write Prescription First</div>
            <div style={{ fontSize: 13, color: 'var(--slate)', lineHeight: 1.7, marginBottom: 24 }}>
              This appointment cannot be marked as <strong>Done</strong> until a prescription has been saved for <strong>{appt.patientName}</strong>.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setPrescBlockModal(false)} style={{ flex: 1, padding: '11px', borderRadius: 10, border: '1.5px solid var(--border)', background: 'none', cursor: 'pointer', fontSize: 13, fontFamily: 'DM Sans, sans-serif', color: 'var(--slate)' }}>Not Now</button>
              <button onClick={() => { setPrescBlockModal(false); navigate(`/clinic/prescription/new?apptId=${id}&phone=${appt.phone}&name=${encodeURIComponent(appt.patientName)}&age=${appt.age}&gender=${appt.gender}`) }}
                style={{ flex: 2, padding: '11px', borderRadius: 10, border: 'none', background: 'var(--teal)', color: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'DM Sans, sans-serif' }}>
                ✍ Write Prescription Now
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </Layout>
  )
}
