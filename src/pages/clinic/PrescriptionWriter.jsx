import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../utils/AuthContext'
import Layout from '../../components/Layout'
import { Card, CardHeader, Btn, Input, Toast } from '../../components/UI'
import { createPrescription, createFollowUp, getMedicines, saveMedicine, DOSAGE_FREQUENCY, DOSAGE_DURATION, DOSAGE_TIMING, DEFAULT_MEDICINES , logActivity } from '../../firebase/clinicDb'
import { updateAppointment } from '../../firebase/clinicDb'
import { sendCampaign } from '../../firebase/whatsapp'
import { printPrescription } from '../../utils/printPrescription'
import { format, addDays } from 'date-fns'

export default function PrescriptionWriter() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  // Pre-fill from appointment query params
  const apptId   = searchParams.get('apptId') || ''
  const initPhone = searchParams.get('phone') || ''
  const initName  = searchParams.get('name') || ''
  const initAge   = searchParams.get('age') || ''
  const initGender = searchParams.get('gender') || ''

  const [loading, setLoading]   = useState(false)
  const [toast, setToast]       = useState(null)
  const [medicines, setMedicines] = useState([])
  const [medSearch, setMedSearch] = useState('')
  const [showMedPanel, setShowMedPanel] = useState(false)
  const [activeMedIdx, setActiveMedIdx] = useState(null)

  // Patient
  const [patient, setPatient] = useState({
    name: initName, phone: initPhone, age: initAge, gender: initGender
  })

  // Prescription fields
  const [diagnosis, setDiagnosis]       = useState('')
  const [complaints, setComplaints]     = useState('')
  const [advice, setAdvice]             = useState('')
  const [selectedMeds, setSelectedMeds] = useState([])
  const [followUpDays, setFollowUpDays] = useState('')

  // Lab tests to order
  const [labTests, setLabTests] = useState([])  // [{name, instructions}]

  const today = format(new Date(), 'yyyy-MM-dd')

  useEffect(() => { loadMedicines() }, [user])

  async function loadMedicines() {
    let meds = await getMedicines(user.uid)
    if (meds.length === 0) {
      // Seed defaults on first use
      for (const m of DEFAULT_MEDICINES) await saveMedicine(user.uid, m)
      meds = await getMedicines(user.uid)
    }
    setMedicines(meds)
  }

  const filteredMeds = medSearch
    ? medicines.filter(m => m.name.toLowerCase().includes(medSearch.toLowerCase()))
    : medicines

  function addMedicine(med) {
    setSelectedMeds(s => [...s, {
      ...med,
      frequency: '1-0-1',
      duration:  '5 days',
      timing:    'After food',
      notes:     ''
    }])
    setMedSearch('')
    setShowMedPanel(false)
  }

  function removeMed(idx) {
    setSelectedMeds(s => s.filter((_, i) => i !== idx))
  }

  function updateMed(idx, key, val) {
    setSelectedMeds(s => s.map((m, i) => i === idx ? { ...m, [key]: val } : m))
  }

  const handlePrint = () => printPrescription({
    patient, diagnosis, complaints, medicines: selectedMeds,
    advice, labTests: labTests.filter(t => t.name.trim()), followUpDays, profile, date: today
  })

  async function handleSave() {
    if (!patient.name || selectedMeds.length === 0) {
      setToast({ message: 'Add patient name and at least one medicine', type: 'error' }); return
    }
    setLoading(true)
    try {
      const prescId = await createPrescription(user.uid, {
        patientName: patient.name, patientPhone: patient.phone,
        patientAge: patient.age, patientGender: patient.gender,
        diagnosis, complaints, advice, labTests: labTests.filter(t => t.name.trim()),
        medicines: selectedMeds,
        date: today, apptId,
        doctorName: profile?.ownerName || '',
        centreName: profile?.centreName || '',
        centreAddress: profile?.address || '',
        centrePhone: profile?.phone || ''
      })

      // Mark appointment done
      if (apptId) await updateAppointment(user.uid, apptId, { status: 'done', prescriptionId: prescId })
      logActivity(user.uid, { action: 'prescription_created', label: 'Prescription Created', detail: `${patient?.name || ''} · ${diagnosis || 'No diagnosis'}`, by: user?.email || '' })

      // Create follow-up if specified
      if (followUpDays) {
        const followUpDate = format(addDays(new Date(), parseInt(followUpDays)), 'yyyy-MM-dd')
        await createFollowUp(user.uid, {
          patientName: patient.name, patientPhone: patient.phone,
          followUpDate, prescriptionId: prescId, apptId
        })
        // WhatsApp follow-up reminder (will fire day before via scheduled job - for now save it)
        if (profile?.whatsappCampaigns?.length) {
          sendCampaign(profile.whatsappCampaigns, 'followup', patient.phone,
            [patient.name, profile?.ownerName || 'Doctor', followUpDate]
          )
        }
      }

      setToast({ message: 'Prescription saved!', type: 'success' })
      setTimeout(() => navigate(`/clinic/prescription/${prescId}`), 800)
    } catch (err) {
      setToast({ message: 'Save failed. Try again.', type: 'error' })
    }
    setLoading(false)
  }

  const chips = (opts, val, set) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
      {opts.map(o => (
        <button key={o} type="button" onClick={() => set(o)} style={{
          padding: '4px 10px', borderRadius: 20, border: '1.5px solid',
          borderColor: val === o ? 'var(--teal)' : 'var(--border)',
          background: val === o ? 'var(--teal-light)' : 'none',
          color: val === o ? 'var(--teal)' : 'var(--slate)',
          fontSize: 11, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
          fontWeight: val === o ? 600 : 400, transition: 'all 0.15s'
        }}>{o}</button>
      ))}
    </div>
  )

  return (
    <Layout
      title="Write Prescription"
      action={
        <div style={{ display: 'flex', gap: 10 }}>
          <Btn variant="ghost" small onClick={handlePrint}>🖨 Print</Btn>
          <Btn onClick={handleSave} disabled={loading}>
            {loading ? 'Saving…' : '💾 Save & Complete'}
          </Btn>
        </div>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20 }}>

        {/* MAIN */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Patient + Clinical */}
          <Card>
            <CardHeader title="Clinical Details" />
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 2 }}>
                  <label style={lStyle}>Patient Name</label>
                  <input value={patient.name} onChange={e => setPatient(p => ({ ...p, name: e.target.value }))}
                    style={inputStyle} placeholder="Patient full name" />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={lStyle}>Age</label>
                  <input value={patient.age} onChange={e => setPatient(p => ({ ...p, age: e.target.value }))}
                    style={inputStyle} placeholder="Years" />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={lStyle}>Gender</label>
                  <select value={patient.gender} onChange={e => setPatient(p => ({ ...p, gender: e.target.value }))}
                    style={{ ...inputStyle, appearance: 'none' }}>
                    <option value="">Select</option>
                    <option>Male</option><option>Female</option><option>Other</option>
                  </select>
                </div>
              </div>
              <div>
                <label style={lStyle}>Chief Complaints</label>
                <textarea value={complaints} onChange={e => setComplaints(e.target.value)}
                  placeholder="e.g. Fever, cough and cold since 3 days. Sore throat." rows={2}
                  style={{ ...inputStyle, resize: 'vertical' }} />
              </div>
              <div>
                <label style={lStyle}>Diagnosis</label>
                <input value={diagnosis} onChange={e => setDiagnosis(e.target.value)}
                  style={inputStyle} placeholder="e.g. Viral Upper Respiratory Tract Infection" />
              </div>
            </div>
          </Card>

          {/* Medicines */}
          <Card>
            <CardHeader title={`Medicines (${selectedMeds.length})`}
              action={
                <Btn small onClick={() => setShowMedPanel(!showMedPanel)}>
                  + Add Medicine
                </Btn>
              }
            />

            {/* Medicine search panel */}
            {showMedPanel && (
              <div style={{ padding: '14px 22px', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                <input value={medSearch} onChange={e => setMedSearch(e.target.value)}
                  placeholder="🔍 Search medicine name…" autoFocus
                  style={{ ...inputStyle, marginBottom: 10 }} />
                <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {filteredMeds.slice(0, 20).map(m => (
                    <div key={m.id} onClick={() => addMedicine(m)} style={{
                      padding: '9px 14px', borderRadius: 8, cursor: 'pointer',
                      background: 'var(--surface)', border: '1px solid var(--border)',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                    }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--teal)'}
                      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                    >
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--navy)' }}>{m.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>{m.type} · {m.category}</div>
                      </div>
                      <span style={{ color: 'var(--teal)', fontSize: 18 }}>+</span>
                    </div>
                  ))}
                  {filteredMeds.length === 0 && (
                    <div style={{ padding: 16, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                      Not found. <button onClick={() => {
                        setShowMedPanel(false)
                        setSelectedMeds(s => [...s, { name: medSearch, type: 'Tablet', frequency: '1-0-1', duration: '5 days', timing: 'After food', notes: '' }])
                        setMedSearch('')
                      }} style={{ color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontSize: 13 }}>
                        Add "{medSearch}" directly
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {selectedMeds.length === 0 ? (
              <div style={{ padding: '32px', textAlign: 'center', color: 'var(--muted)' }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>💊</div>
                <div style={{ fontSize: 14 }}>Click "+ Add Medicine" to start the prescription</div>
              </div>
            ) : (
              <div style={{ padding: '12px 0' }}>
                {selectedMeds.map((med, idx) => (
                  <div key={idx} style={{ padding: '16px 22px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--navy)' }}>{med.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>{med.type}</div>
                      </div>
                      <button onClick={() => removeMed(idx)} style={{
                        background: 'var(--red-bg)', color: 'var(--red)', border: 'none',
                        borderRadius: 8, width: 28, height: 28, cursor: 'pointer', fontSize: 16
                      }}>×</button>
                    </div>

                    {/* Frequency chips */}
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6, fontWeight: 500 }}>FREQUENCY (M-A-E)</div>
                      {chips(DOSAGE_FREQUENCY, med.frequency, v => updateMed(idx, 'frequency', v))}
                    </div>

                    {/* Duration + Timing */}
                    <div style={{ display: 'flex', gap: 20, marginBottom: 10 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6, fontWeight: 500 }}>DURATION</div>
                        {chips(DOSAGE_DURATION, med.duration, v => updateMed(idx, 'duration', v))}
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6, fontWeight: 500 }}>TIMING</div>
                      {chips(DOSAGE_TIMING, med.timing, v => updateMed(idx, 'timing', v))}
                    </div>

                    {/* Special instructions */}
                    <div style={{ marginTop: 10 }}>
                      <input value={med.notes} onChange={e => updateMed(idx, 'notes', e.target.value)}
                        placeholder="Special instructions (optional)…"
                        style={{ ...inputStyle, fontSize: 12 }} />
                    </div>

                    {/* Preview line */}
                    <div style={{ marginTop: 8, padding: '8px 12px', background: 'var(--teal-light)', borderRadius: 8, fontSize: 12, color: 'var(--teal)', fontStyle: 'italic' }}>
                      {med.name} — {med.frequency} × {med.duration} ({med.timing})
                      {med.notes && ` · ${med.notes}`}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Advice + Lab tests */}
          <Card>
            <CardHeader title="Advice & Lab Tests" />
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={lStyle}>General Advice</label>
                <textarea value={advice} onChange={e => setAdvice(e.target.value)}
                  placeholder="e.g. Drink plenty of fluids. Rest for 3 days. Avoid cold drinks." rows={2}
                  style={{ ...inputStyle, resize: 'vertical' }} />
              </div>
              <div>
                <label style={lStyle}>Lab Tests Advised</label>
                {labTests.map((t, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'flex-start' }}>
                    <input
                      value={t.name}
                      onChange={e => setLabTests(ts => ts.map((x,i) => i===idx ? {...x, name: e.target.value} : x))}
                      placeholder="Test name e.g. CBC, HbA1c"
                      style={{ ...inputStyle, flex: 1.5 }}
                    />
                    <input
                      value={t.instructions}
                      onChange={e => setLabTests(ts => ts.map((x,i) => i===idx ? {...x, instructions: e.target.value} : x))}
                      placeholder="Instructions e.g. Fasting, 8am"
                      style={{ ...inputStyle, flex: 1 }}
                    />
                    <button type="button" onClick={() => setLabTests(ts => ts.filter((_,i) => i !== idx))}
                      style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 14, flexShrink: 0 }}>
                      ✕
                    </button>
                  </div>
                ))}
                <button type="button"
                  onClick={() => setLabTests(ts => [...ts, { name: '', instructions: '' }])}
                  style={{ padding: '7px 16px', borderRadius: 8, border: '1.5px dashed var(--border)', background: 'none', color: 'var(--teal)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans', width: '100%', marginTop: labTests.length ? 0 : 0 }}>
                  + Add Lab Test
                </button>
              </div>
            </div>
          </Card>
        </div>

        {/* RIGHT PANEL */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Follow-up */}
          <Card>
            <CardHeader title="Follow-up" />
            <div style={{ padding: '16px 20px' }}>
              <label style={lStyle}>Schedule Follow-up After</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {['3', '5', '7', '10', '14', '30'].map(d => (
                  <button key={d} type="button" onClick={() => setFollowUpDays(followUpDays === d ? '' : d)}
                    style={{
                      padding: '6px 14px', borderRadius: 20, border: '1.5px solid',
                      borderColor: followUpDays === d ? 'var(--teal)' : 'var(--border)',
                      background: followUpDays === d ? 'var(--teal-light)' : 'none',
                      color: followUpDays === d ? 'var(--teal)' : 'var(--slate)',
                      fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
                      fontWeight: followUpDays === d ? 600 : 400
                    }}>{d} days</button>
                ))}
              </div>
              {followUpDays && (
                <div style={{ marginTop: 10, fontSize: 12, color: 'var(--teal)', background: 'var(--teal-light)', borderRadius: 8, padding: '8px 12px' }}>
                  📅 Follow-up on: {format(addDays(new Date(), parseInt(followUpDays)), 'dd MMM yyyy')}
                  <br />💬 Reminder will be sent on WhatsApp
                </div>
              )}
            </div>
          </Card>

          {/* Prescription summary */}
          <Card>
            <CardHeader title="Summary" />
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                ['Patient', patient.name || '—'],
                ['Age', patient.age ? patient.age + 'y' : '—'],
                ['Gender', patient.gender || '—'],
                ['Diagnosis', diagnosis || '—'],
                ['Medicines', selectedMeds.length + ' added'],
                ['Lab Tests', labTests.filter(t=>t.name.trim()).length + ' added'],
                ['Follow-up', followUpDays ? `In ${followUpDays} days` : 'None'],
              ].map(([l, v]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'var(--muted)' }}>{l}</span>
                  <span style={{ fontWeight: 500, color: 'var(--navy)' }}>{v}</span>
                </div>
              ))}
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

// ── STYLES ────────────────────────────────────────────────
const lStyle = { fontSize: 11, color: 'var(--slate)', fontWeight: 500, display: 'block', marginBottom: 5, letterSpacing: 0.3 }
const inputStyle = {
  width: '100%', border: '1.5px solid var(--border)', borderRadius: 8,
  padding: '9px 12px', fontSize: 13, outline: 'none',
  fontFamily: 'DM Sans, sans-serif', color: 'var(--navy)', background: 'var(--surface)'
}

// ── PRINT PRESCRIPTION ────────────────────────────────────
function PrintPrescription({ patient, diagnosis, complaints, medicines, advice, labTests, followUpDays, profile, date }) {
  const followUpDate = followUpDays ? format(addDays(new Date(), parseInt(followUpDays)), 'dd MMM yyyy') : null

  return (
    <div style={{ fontFamily: 'DM Sans, sans-serif', padding: 32, maxWidth: 700, margin: '0 auto', color: '#111', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, paddingBottom: 16, borderBottom: '3px solid #0B9E8A' }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#0D2B3E' }}>Dr. {profile?.ownerName}</div>
          <div style={{ fontSize: 13, color: '#666', marginTop: 2 }}>{profile?.centreName}</div>
          <div style={{ fontSize: 12, color: '#888' }}>{profile?.address}</div>
          <div style={{ fontSize: 12, color: '#888' }}>📞 {profile?.phone}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: 1 }}>Prescription</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#0D2B3E', marginTop: 4 }}>{date}</div>
        </div>
      </div>

      {/* Patient strip */}
      <div style={{ background: '#F4F7F9', borderRadius: 10, padding: '12px 16px', display: 'flex', gap: 32, marginBottom: 20 }}>
        <div><div style={{ fontSize: 10, color: '#999', textTransform: 'uppercase' }}>Name</div><div style={{ fontSize: 14, fontWeight: 600 }}>{patient.name}</div></div>
        <div><div style={{ fontSize: 10, color: '#999', textTransform: 'uppercase' }}>Age</div><div style={{ fontSize: 14, fontWeight: 600 }}>{patient.age} yrs</div></div>
        <div><div style={{ fontSize: 10, color: '#999', textTransform: 'uppercase' }}>Gender</div><div style={{ fontSize: 14, fontWeight: 600 }}>{patient.gender}</div></div>
        {patient.phone && <div><div style={{ fontSize: 10, color: '#999', textTransform: 'uppercase' }}>Phone</div><div style={{ fontSize: 14, fontWeight: 600 }}>{patient.phone}</div></div>}
      </div>

      {/* Complaints + Diagnosis */}
      {complaints && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>Chief Complaints</div>
          <div style={{ fontSize: 13, color: '#444' }}>{complaints}</div>
        </div>
      )}
      {diagnosis && (
        <div style={{ marginBottom: 20, padding: '10px 14px', background: '#E6F7F5', borderRadius: 8, borderLeft: '3px solid #0B9E8A' }}>
          <span style={{ fontSize: 11, color: '#0B9E8A', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8 }}>Diagnosis: </span>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#0D2B3E' }}>{diagnosis}</span>
        </div>
      )}

      {/* Rx */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 28, fontFamily: 'serif', color: '#0B9E8A', marginBottom: 10 }}>℞</div>
        {medicines.map((m, i) => (
          <div key={i} style={{ marginBottom: 14, paddingLeft: 16, borderLeft: '3px solid #E2EAF0' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#0D2B3E' }}>{i + 1}. {m.name}</span>
              <span style={{ fontSize: 12, color: '#888' }}>({m.type})</span>
            </div>
            <div style={{ fontSize: 13, color: '#555', marginTop: 3 }}>
              {m.frequency} — {m.duration} — {m.timing}
              {m.notes && ` · ${m.notes}`}
            </div>
          </div>
        ))}
      </div>

      {/* Lab tests */}
      {labTests && labTests.length > 0 && (
        <div style={{ marginBottom: 16, padding: '10px 14px', background: '#FEF6E7', borderRadius: 8 }}>
          <div style={{ fontSize: 11, color: '#F5A623', fontWeight: 600, textTransform: 'uppercase', marginBottom: 8 }}>Investigations Advised</div>
          {labTests.map((t, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 4, fontSize: 13, color: '#444' }}>
              <span style={{ fontWeight: 600, minWidth: 20 }}>{i+1}.</span>
              <span style={{ flex: 1 }}>{t.name}</span>
              {t.instructions && <span style={{ color: '#888', fontStyle: 'italic' }}>{t.instructions}</span>}
            </div>
          ))}
        </div>
      )}

      {/* Advice */}
      {advice && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>Advice</div>
          <div style={{ fontSize: 13, color: '#444' }}>{advice}</div>
        </div>
      )}

      {/* Follow-up */}
      {followUpDate && (
        <div style={{ marginBottom: 20, padding: '10px 14px', background: '#E6F7F5', borderRadius: 8 }}>
          <span style={{ fontSize: 12, color: '#0B9E8A', fontWeight: 600 }}>📅 Follow-up: </span>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{followUpDate}</span>
        </div>
      )}

      {/* Signature */}
      <div style={{ marginTop: 48, display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 120, borderTop: '1.5px solid #0D2B3E', paddingTop: 6 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#0D2B3E' }}>Dr. {profile?.ownerName}</div>
            <div style={{ fontSize: 11, color: '#888' }}>Signature</div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 32, textAlign: 'center', fontSize: 11, color: '#ccc', borderTop: '1px solid #eee', paddingTop: 12 }}>
        Powered by MediFlow · {profile?.centreName}
      </div>
    </div>
  )
}
