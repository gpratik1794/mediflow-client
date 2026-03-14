import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../utils/AuthContext'
import Layout from '../../components/Layout'
import { Card, CardHeader, Btn, Toast } from '../../components/UI'
import { createPrescription, createFollowUp, getMedicines, saveMedicine, DOSAGE_FREQUENCY, DOSAGE_DURATION, DOSAGE_TIMING, DEFAULT_MEDICINES, logActivity, updateAppointment, deriveTagsFromPrescription, updatePatientTags, getAppointments } from '../../firebase/clinicDb'
import { sendCampaign } from '../../firebase/whatsapp'
import { printPrescription } from '../../utils/printPrescription'
import { format, addDays } from 'date-fns'
import { collection, query, where, getDocs, limit } from 'firebase/firestore'
import { db } from '../../firebase/config'

export default function PrescriptionWriter() {
  const { user, profile } = useAuth()
  const centreId = profile?._centreId || user?.uid
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const apptId    = searchParams.get('apptId') || ''
  const initPhone = searchParams.get('phone')  || ''
  const initName  = searchParams.get('name')   || ''
  const initAge   = searchParams.get('age')    || ''
  const initGender= searchParams.get('gender') || ''

  const [loading, setLoading]     = useState(false)
  const [toast, setToast]         = useState(null)
  const [medicines, setMedicines] = useState([])
  const [medSearch, setMedSearch] = useState('')
  const [showMedPanel, setShowMedPanel] = useState(false)
  const [activeMedIdx, setActiveMedIdx] = useState(null)

  const [patient, setPatient] = useState({ name: initName, phone: initPhone, age: initAge, gender: initGender })
  const [diagnosis, setDiagnosis]   = useState('')
  const [complaints, setComplaints] = useState('')
  const [advice, setAdvice]         = useState('')
  const [selectedMeds, setSelectedMeds] = useState([])
  const [followUpDays, setFollowUpDays] = useState('')
  const [labTests, setLabTests]     = useState([])

  const [patientTags, setPatientTags] = useState([])
  const [manualTags, setManualTags]   = useState([])
  const [savedTags, setSavedTags]     = useState(null)

  // ── Post-save state ──────────────────────────────────────────────────────────
  const [savedPrescId, setSavedPrescId]   = useState(null)   // set after save
  const [nextPatient, setNextPatient]     = useState(null)   // next waiting patient
  const [pendingFees, setPendingFees]     = useState([])     // done patients with pending fee
  const [callingIn, setCallingIn]         = useState(false)
  const [reminderChoice, setReminderChoice] = useState('auto15') // 'auto15'|'auto30'|'now'|'skip'
  const reminderTimerRef = useRef(null)

  const ALL_TAGS   = ['diabetes','hypert','thyroid','asthma','cardiac','ortho','peds','obesity']
  const TAG_LABELS = { diabetes:'Diabetes', hypert:'Hypertension', thyroid:'Thyroid', asthma:'Asthma', cardiac:'Cardiac', ortho:'Ortho', peds:'Paeds', obesity:'Obesity' }
  const TAG_COLORS = { diabetes:'#F59E0B', hypert:'#EF4444', thyroid:'#8B5CF6', asthma:'#3B82F6', cardiac:'#EC4899', ortho:'#10B981', peds:'#06B6D4', obesity:'#F97316' }

  const today = format(new Date(), 'yyyy-MM-dd')

  useEffect(() => { loadMedicines() }, [user])
  useEffect(() => { if (initPhone) loadPatientTags(initPhone) }, [initPhone])

  // Cleanup reminder timer on unmount
  useEffect(() => () => { if (reminderTimerRef.current) clearTimeout(reminderTimerRef.current) }, [])

  async function loadPatientTags(phone) {
    if (!phone) return
    try {
      const snap = await getDocs(query(collection(db, 'centres', centreId, 'patients'), where('phone', '==', phone), limit(1)))
      if (!snap.empty) setPatientTags(snap.docs[0].data().tags || [])
    } catch (e) { console.warn('loadPatientTags:', e) }
  }

  async function loadMedicines() {
    let meds = await getMedicines(centreId)
    if (meds.length === 0) {
      for (const m of DEFAULT_MEDICINES) await saveMedicine(centreId, m)
      meds = await getMedicines(centreId)
    }
    setMedicines(meds)
  }

  const filteredMeds = medSearch
    ? medicines.filter(m => m.name.toLowerCase().includes(medSearch.toLowerCase()))
    : medicines

  function addMedicine(med) {
    setSelectedMeds(s => [...s, { ...med, frequency: '1-0-1', duration: '5 days', timing: 'After food', notes: '' }])
    setMedSearch(''); setShowMedPanel(false)
  }
  function removeMed(idx) { setSelectedMeds(s => s.filter((_, i) => i !== idx)) }
  function updateMed(idx, key, val) { setSelectedMeds(s => s.map((m, i) => i === idx ? { ...m, [key]: val } : m)) }

  const handlePrint = () => printPrescription({ patient, diagnosis, complaints, medicines: selectedMeds, advice, labTests: labTests.filter(t => t.name.trim()), followUpDays, profile, date: today })

  async function handleSave() {
    if (!patient.name || selectedMeds.length === 0) {
      setToast({ message: 'Add patient name and at least one medicine', type: 'error' }); return
    }
    setLoading(true)
    try {
      const prescId = await createPrescription(centreId, {
        patientName: patient.name, patientPhone: patient.phone,
        patientAge: patient.age, patientGender: patient.gender,
        diagnosis, complaints, advice, labTests: labTests.filter(t => t.name.trim()),
        medicines: selectedMeds, date: today, apptId,
        appointmentId: apptId,   // store both for compatibility
        apptId: apptId,
        doctorName: profile?.ownerName || '',
        centreName: profile?.centreName || '',
        centreAddress: profile?.address || '',
        centrePhone: profile?.phone || ''
      })

      // Mark appointment done
      if (apptId) await updateAppointment(centreId, apptId, { status: 'done', prescriptionId: prescId })
      logActivity(centreId, { action: 'prescription_created', label: 'Prescription Created', detail: `${patient?.name || ''} · ${diagnosis || 'No diagnosis'}`, by: user?.email || '' })

      // Follow-up
      if (followUpDays) {
        const followUpDate = format(addDays(new Date(), parseInt(followUpDays)), 'yyyy-MM-dd')
        await createFollowUp(centreId, { patientName: patient.name, patientPhone: patient.phone, followUpDate, prescriptionId: prescId, apptId })
        if (profile?.whatsappCampaigns?.length) {
          sendCampaign(profile.whatsappCampaigns, 'followup', patient.phone, [patient.name, profile?.ownerName || 'Doctor', followUpDate])
        }
      }

      // Auto-tag
      if (patient.phone) {
        const autoTags = deriveTagsFromPrescription({ diagnosis, medicines: selectedMeds })
        const allNewTags = Array.from(new Set([...autoTags, ...manualTags]))
        if (allNewTags.length) { await updatePatientTags(centreId, patient.phone, allNewTags); setSavedTags(allNewTags) }
      }

      setSavedPrescId(prescId)

      // ── Load next waiting + pending fees ──────────────────────────────────
      const allToday = await getAppointments(centreId, today)
      const waiting = allToday
        .filter(a => a.status === 'waiting')
        .sort((a, b) => (a.tokenNumber || 0) - (b.tokenNumber || 0))
      setNextPatient(waiting[0] || null)
      setPendingFees(allToday.filter(a => a.status === 'done' && a.paymentStatus === 'pending'))

      // ── Schedule auto reminder if choice is auto15 ──
      scheduleReminder('auto15', allToday)

      setToast({ message: 'Prescription saved!', type: 'success' })
    } catch (err) {
      console.error(err)
      setToast({ message: 'Save failed. Try again.', type: 'error' })
    }
    setLoading(false)
  }

  function scheduleReminder(choice, allToday) {
    if (reminderTimerRef.current) clearTimeout(reminderTimerRef.current)
    if (choice === 'skip') return
    const delay = choice === 'auto15' ? 15 * 60 * 1000 : choice === 'auto30' ? 30 * 60 * 1000 : 0
    if (delay === 0) {
      sendFeeReminder(allToday)
      return
    }
    reminderTimerRef.current = setTimeout(() => {
      // Re-fetch to get latest fee status before sending
      getAppointments(centreId, today).then(latest => sendFeeReminder(latest))
    }, delay)
  }

  function sendFeeReminder(allToday) {
    const stillPending = (allToday || []).filter(a => a.status === 'done' && a.paymentStatus === 'pending')
    if (stillPending.length === 0) return
    const doc = profile?.doctors?.[0] || {}
    const doctorPhone = doc.phone || profile?.phone
    if (!doctorPhone || !profile?.whatsappCampaigns?.length) return
    const names = stillPending.map(p => p.patientName).join(', ')
    const total = stillPending.reduce((s, a) => s + parseFloat(a.consultationFee || 0), 0)
    sendCampaign(profile.whatsappCampaigns, 'doctor_session_report', doctorPhone,
      [doc.name || 'Doctor', 'Fee Reminder', format(new Date(), 'dd MMM yyyy'), String(stillPending.length), '—', '—', '₹0', `₹${total}`],
      null, { centreId })
  }

  async function handleCallInNext() {
    if (!nextPatient) return
    setCallingIn(true)
    await updateAppointment(centreId, nextPatient.id, { status: 'in-consultation' })
    logActivity(centreId, { action: 'appt_status_changed', label: 'In Consultation', detail: nextPatient.patientName, by: user?.email || '' })
    setCallingIn(false)
    navigate(`/clinic/appointments/${nextPatient.id}`)
  }

  // ── Render the post-save modal ────────────────────────────────────────────
  if (savedPrescId) {
    const isLastPatient = !nextPatient
    const hasPending    = pendingFees.length > 0

    return (
      <Layout title="Prescription Saved">
        <div style={{ maxWidth: 520, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Success header */}
          <div style={{ background: 'var(--green-bg)', border: '1.5px solid var(--green)', borderRadius: 14, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 20, flexShrink: 0 }}>✓</div>
            <div>
              <div style={{ fontWeight: 700, color: 'var(--green)', fontSize: 15 }}>Prescription saved for {patient.name}</div>
              <div style={{ fontSize: 12, color: 'var(--slate)', marginTop: 2 }}>Visit marked as done</div>
            </div>
          </div>

          {/* Pending fee warning */}
          {hasPending && (
            <div style={{ background: 'var(--amber-bg)', border: '1.5px solid var(--amber)', borderRadius: 12, padding: '14px 18px' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--amber)', marginBottom: 6 }}>
                💰 {pendingFees.length} patient fee{pendingFees.length > 1 ? 's' : ''} still pending
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {pendingFees.map(p => (
                  <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--slate)' }}>
                    <span>{p.patientName} (#{p.tokenNumber})</span>
                    <span style={{ fontWeight: 600 }}>₹{p.consultationFee || '?'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Last patient notice */}
          {isLastPatient && (
            <div style={{ background: 'var(--blue-bg,#EFF6FF)', border: '1.5px solid var(--blue,#3B82F6)', borderRadius: 12, padding: '14px 18px', fontSize: 13, color: 'var(--navy)', lineHeight: 1.6 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>🔔 Last checked-in patient</div>
              No more patients in the queue. Please confirm with the receptionist if anyone is waiting outside.
            </div>
          )}

          {/* Next patient action */}
          {!isLastPatient && nextPatient && (
            <div style={{ background: 'var(--navy)', borderRadius: 14, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Next patient waiting</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: '#5DCABC', lineHeight: 1 }}>#{nextPatient.tokenNumber}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', marginTop: 3 }}>{nextPatient.patientName}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
                  {nextPatient.appointmentTime}
                  {nextPatient.vitals && Object.keys(nextPatient.vitals).length > 0 ? ' · vitals recorded' : ''}
                </div>
              </div>
              <button onClick={handleCallInNext} disabled={callingIn}
                style={{ padding: '12px 20px', borderRadius: 10, border: 'none', background: 'var(--teal)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: callingIn ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif', whiteSpace: 'nowrap', opacity: callingIn ? 0.7 : 1 }}>
                {callingIn ? 'Calling…' : 'Save + Call In →'}
              </button>
            </div>
          )}

          {/* Fee reminder options (if pending fees exist) */}
          {hasPending && (
            <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', padding: '16px 18px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>Fee reminder to doctor</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
                Auto-send a WhatsApp to doctor once receptionist marks fees, or on a timer:
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                {[
                  { key: 'auto15', icon: '⏱', label: 'Auto 15 min', sub: 'If still pending' },
                  { key: 'auto30', icon: '⏱', label: 'Auto 30 min', sub: 'Longer wait' },
                  { key: 'now',    icon: '📲', label: 'Send now',    sub: 'Immediate' },
                  { key: 'skip',   icon: '✕',  label: 'Skip',       sub: 'No reminder' },
                ].map(opt => (
                  <button key={opt.key} type="button"
                    onClick={() => {
                      setReminderChoice(opt.key)
                      if (reminderTimerRef.current) clearTimeout(reminderTimerRef.current)
                      scheduleReminder(opt.key, null)
                    }}
                    style={{
                      padding: '10px 8px', borderRadius: 10, textAlign: 'center', cursor: 'pointer',
                      border: `1.5px solid ${reminderChoice === opt.key ? 'var(--teal)' : 'var(--border)'}`,
                      background: reminderChoice === opt.key ? 'var(--teal-light)' : 'var(--bg)',
                      fontFamily: 'DM Sans, sans-serif', transition: 'all 0.15s'
                    }}>
                    <div style={{ fontSize: 16, marginBottom: 4 }}>{opt.icon}</div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--navy)' }}>{opt.label}</div>
                    <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{opt.sub}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Session report + view prescription buttons */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => navigate('/clinic/appointments')}
              style={{ flex: 1, padding: '12px', borderRadius: 10, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--slate)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
              ← Back to Queue
            </button>
            <button onClick={() => navigate(`/clinic/prescription/${savedPrescId}`)}
              style={{ flex: 1, padding: '12px', borderRadius: 10, border: 'none', background: 'var(--teal)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
              View Prescription
            </button>
          </div>

        </div>
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      </Layout>
    )
  }

  // ── Main prescription writer form ─────────────────────────────────────────
  const chips = (opts, val, set) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
      {opts.map(o => (
        <button key={o} type="button" onClick={() => set(o)}
          style={{ padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', border: `1.5px solid ${val === o ? 'var(--teal)' : 'var(--border)'}`, background: val === o ? 'var(--teal-light)' : 'none', color: val === o ? 'var(--teal)' : 'var(--slate)' }}>
          {o}
        </button>
      ))}
    </div>
  )

  return (
    <Layout title="Write Prescription"
      action={
        <div style={{ display: 'flex', gap: 10 }}>
          <Btn variant="ghost" small onClick={() => navigate(-1)}>← Back</Btn>
          <Btn variant="ghost" small onClick={handlePrint}>🖨 Print</Btn>
        </div>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>
        {/* LEFT */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Patient */}
          <Card>
            <CardHeader title="Patient" />
            <div style={{ padding: '16px 22px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              {[
                { label: 'Full Name', key: 'name', placeholder: 'Patient name' },
                { label: 'Phone', key: 'phone', placeholder: '10-digit mobile' },
                { label: 'Age (years)', key: 'age', placeholder: 'e.g. 35' },
                { label: 'Gender', key: 'gender', placeholder: 'Male / Female / Other' },
              ].map(f => (
                <div key={f.key}>
                  <label style={lStyle}>{f.label}</label>
                  <input value={patient[f.key] || ''} onChange={e => setPatient(p => ({ ...p, [f.key]: e.target.value }))}
                    placeholder={f.placeholder} style={inputStyle}
                    onFocus={e => e.target.style.borderColor = 'var(--teal)'}
                    onBlur={e => e.target.style.borderColor = 'var(--border)'}
                  />
                </div>
              ))}
            </div>
          </Card>

          {/* Clinical */}
          <Card>
            <CardHeader title="Clinical Details" />
            <div style={{ padding: '16px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={lStyle}>Chief Complaints</label>
                <textarea value={complaints} onChange={e => setComplaints(e.target.value)}
                  placeholder="What is the patient complaining about?"
                  rows={2} style={{ ...inputStyle, resize: 'vertical' }}
                  onFocus={e => e.target.style.borderColor = 'var(--teal)'}
                  onBlur={e => e.target.style.borderColor = 'var(--border)'}
                />
              </div>
              <div>
                <label style={lStyle}>Diagnosis</label>
                <input value={diagnosis} onChange={e => setDiagnosis(e.target.value)}
                  placeholder="e.g. Upper respiratory tract infection"
                  style={inputStyle}
                  onFocus={e => e.target.style.borderColor = 'var(--teal)'}
                  onBlur={e => e.target.style.borderColor = 'var(--border)'}
                />
              </div>
              <div>
                <label style={lStyle}>Advice / Instructions</label>
                <textarea value={advice} onChange={e => setAdvice(e.target.value)}
                  placeholder="Rest, diet advice, precautions…"
                  rows={2} style={{ ...inputStyle, resize: 'vertical' }}
                  onFocus={e => e.target.style.borderColor = 'var(--teal)'}
                  onBlur={e => e.target.style.borderColor = 'var(--border)'}
                />
              </div>
            </div>
          </Card>

          {/* Medicines */}
          <Card>
            <CardHeader title="℞ Medicines" sub={`${selectedMeds.length} added`}
              action={
                <Btn small onClick={() => setShowMedPanel(v => !v)}>+ Add Medicine</Btn>
              }
            />
            {showMedPanel && (
              <div style={{ padding: '10px 22px', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                <input value={medSearch} onChange={e => setMedSearch(e.target.value)}
                  placeholder="Search medicines…" autoFocus
                  style={{ ...inputStyle, marginBottom: 8 }}
                  onFocus={e => e.target.style.borderColor = 'var(--teal)'}
                  onBlur={e => e.target.style.borderColor = 'var(--border)'}
                />
                <div style={{ maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {filteredMeds.map(m => (
                    <button key={m.id || m.name} type="button" onClick={() => addMedicine(m)}
                      style={{ padding: '8px 12px', borderRadius: 7, background: 'var(--surface)', border: '1px solid var(--border)', textAlign: 'left', cursor: 'pointer', fontSize: 13, fontFamily: 'DM Sans, sans-serif', color: 'var(--navy)' }}>
                      <span style={{ fontWeight: 500 }}>{m.name}</span>
                      <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 8 }}>{m.type}</span>
                    </button>
                  ))}
                  {filteredMeds.length === 0 && (
                    <button type="button" onClick={() => addMedicine({ name: medSearch, type: 'Tab' })}
                      style={{ padding: '8px 12px', borderRadius: 7, background: 'var(--teal-light)', border: '1px solid var(--teal)', textAlign: 'left', cursor: 'pointer', fontSize: 13, fontFamily: 'DM Sans, sans-serif', color: 'var(--teal)', fontWeight: 500 }}>
                      + Add "{medSearch}" as new medicine
                    </button>
                  )}
                </div>
              </div>
            )}
            <div style={{ padding: '0 22px' }}>
              {selectedMeds.length === 0 ? (
                <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No medicines added yet</div>
              ) : selectedMeds.map((m, idx) => (
                <div key={idx} style={{ padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--navy)' }}>
                      {idx + 1}. {m.name} <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}>({m.type})</span>
                    </div>
                    <button type="button" onClick={() => removeMed(idx)}
                      style={{ background: 'var(--red-bg)', border: 'none', borderRadius: 6, padding: '3px 8px', fontSize: 11, color: 'var(--red)', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>Remove</button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div>
                      <label style={lStyle}>Frequency</label>
                      {chips(DOSAGE_FREQUENCY, m.frequency, v => updateMed(idx, 'frequency', v))}
                    </div>
                    <div>
                      <label style={lStyle}>Duration</label>
                      {chips(DOSAGE_DURATION, m.duration, v => updateMed(idx, 'duration', v))}
                    </div>
                    <div>
                      <label style={lStyle}>Timing</label>
                      {chips(DOSAGE_TIMING, m.timing, v => updateMed(idx, 'timing', v))}
                    </div>
                    <div>
                      <label style={lStyle}>Notes (optional)</label>
                      <input value={m.notes || ''} onChange={e => updateMed(idx, 'notes', e.target.value)}
                        placeholder="e.g. Crush before giving"
                        style={{ ...inputStyle, fontSize: 12, padding: '6px 10px' }}
                        onFocus={e => e.target.style.borderColor = 'var(--teal)'}
                        onBlur={e => e.target.style.borderColor = 'var(--border)'}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Lab tests */}
          <Card>
            <CardHeader title="Investigations" sub="Lab tests to order"
              action={<Btn small onClick={() => setLabTests(t => [...t, { name: '', instructions: '' }])}>+ Add Test</Btn>}
            />
            <div style={{ padding: '8px 22px 16px' }}>
              {labTests.length === 0 ? (
                <div style={{ padding: '12px 0', color: 'var(--muted)', fontSize: 13 }}>No tests ordered</div>
              ) : labTests.map((t, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'flex-start' }}>
                  <input value={t.name} onChange={e => setLabTests(ts => ts.map((x, i) => i === idx ? { ...x, name: e.target.value } : x))}
                    placeholder="Test name e.g. CBC, HbA1c"
                    style={{ ...inputStyle, flex: 2, fontSize: 12 }}
                    onFocus={e => e.target.style.borderColor = 'var(--teal)'}
                    onBlur={e => e.target.style.borderColor = 'var(--border)'}
                  />
                  <input value={t.instructions} onChange={e => setLabTests(ts => ts.map((x, i) => i === idx ? { ...x, instructions: e.target.value } : x))}
                    placeholder="Instructions (optional)"
                    style={{ ...inputStyle, flex: 2, fontSize: 12 }}
                    onFocus={e => e.target.style.borderColor = 'var(--teal)'}
                    onBlur={e => e.target.style.borderColor = 'var(--border)'}
                  />
                  <button type="button" onClick={() => setLabTests(ts => ts.filter((_, i) => i !== idx))}
                    style={{ background: 'var(--red-bg)', border: 'none', borderRadius: 6, padding: '8px 10px', color: 'var(--red)', cursor: 'pointer', flexShrink: 0, fontFamily: 'DM Sans, sans-serif', fontSize: 12 }}>✕</button>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* RIGHT */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Follow-up */}
          <Card>
            <CardHeader title="Follow-up" />
            <div style={{ padding: '16px 22px' }}>
              <label style={lStyle}>Follow-up in (days)</label>
              {chips(['3', '5', '7', '10', '14', '30'], followUpDays, setFollowUpDays)}
              {followUpDays && (
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--teal)' }}>
                  📅 Follow-up: {format(addDays(new Date(), parseInt(followUpDays)), 'dd MMM yyyy')}
                </div>
              )}
            </div>
          </Card>

          {/* Tags */}
          <Card>
            <CardHeader title="Patient Tags" />
            <div style={{ padding: '14px 22px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {patientTags.length > 0 && (
                <div>
                  <label style={{ ...lStyle, marginBottom: 6 }}>EXISTING TAGS</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {patientTags.map(tag => (
                      <span key={tag} style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: (TAG_COLORS[tag] || 'var(--teal)') + '20', color: TAG_COLORS[tag] || 'var(--teal)' }}>
                        {TAG_LABELS[tag] || tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <label style={lStyle}>{patientTags.length > 0 ? 'ADD MORE TAGS' : 'TAG THIS PATIENT'}</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {ALL_TAGS.filter(t => !patientTags.includes(t)).map(tag => {
                    const on = manualTags.includes(tag)
                    return (
                      <button key={tag} type="button"
                        onClick={() => setManualTags(ts => on ? ts.filter(t => t !== tag) : [...ts, tag])}
                        style={{ padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, border: `1.5px solid ${on ? TAG_COLORS[tag] : 'var(--border)'}`, background: on ? TAG_COLORS[tag] + '20' : 'none', color: on ? TAG_COLORS[tag] : 'var(--slate)', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', transition: 'all 0.15s' }}>
                        {on ? '✓ ' : ''}{TAG_LABELS[tag] || tag}
                      </button>
                    )
                  })}
                </div>
              </div>

              {(diagnosis || selectedMeds.length > 0) && (() => {
                const preview = deriveTagsFromPrescription({ diagnosis, medicines: selectedMeds }).filter(t => !patientTags.includes(t))
                if (!preview.length) return null
                return (
                  <div style={{ padding: '8px 10px', background: 'var(--teal-light)', borderRadius: 8, fontSize: 11, color: 'var(--teal)' }}>
                    🏷 Will auto-tag: {preview.map(t => TAG_LABELS[t] || t).join(', ')}
                  </div>
                )
              })()}

              {savedTags && (
                <div style={{ padding: '8px 10px', background: '#D1FAE5', borderRadius: 8, fontSize: 11, color: '#065F46', fontWeight: 500 }}>
                  ✓ Tags saved: {savedTags.map(t => TAG_LABELS[t] || t).join(', ')}
                </div>
              )}
            </div>
          </Card>

          <Btn onClick={handleSave} disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
            {loading ? 'Saving…' : '💾 Save & Complete Visit'}
          </Btn>
          <Btn variant="ghost" onClick={handlePrint} style={{ width: '100%', justifyContent: 'center' }}>
            🖨 Print Prescription
          </Btn>
        </div>
      </div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </Layout>
  )
}

const lStyle = { fontSize: 11, color: 'var(--slate)', fontWeight: 500, display: 'block', marginBottom: 5, letterSpacing: 0.3 }
const inputStyle = { width: '100%', border: '1.5px solid var(--border)', borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none', fontFamily: 'DM Sans, sans-serif', color: 'var(--navy)', background: 'var(--surface)', transition: 'border 0.18s', boxSizing: 'border-box' }
