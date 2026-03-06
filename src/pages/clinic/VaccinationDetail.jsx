// src/pages/clinic/VaccinationDetail.jsx
import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../utils/AuthContext'
import Layout from '../../components/Layout'
import { Card, CardHeader, Btn, Toast } from '../../components/UI'
import {
  getChild, updateChild, createChild,
  markVaccineGiven, unmarkVaccine,
  DEFAULT_VACCINE_SCHEDULE, getDueDate
} from '../../firebase/vaccinationDb'

const iStyle = { width: '100%', padding: '9px 13px', borderRadius: 10, border: '1.5px solid var(--border)', fontSize: 13, fontFamily: 'DM Sans, sans-serif', outline: 'none', background: 'var(--surface)', color: 'var(--navy)', boxSizing: 'border-box' }
const lStyle = { fontSize: 11, color: 'var(--slate)', fontWeight: 500, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4 }

function getAgeStr(dobStr) {
  if (!dobStr) return '—'
  const diff = new Date() - new Date(dobStr)
  const months = Math.floor(diff / (30.44 * 24 * 60 * 60 * 1000))
  if (months < 1)  return `${Math.floor(diff / (24 * 60 * 60 * 1000))} days`
  if (months < 24) return `${months} months`
  return `${Math.floor(months / 12)}y ${months % 12}m`
}

export default function VaccinationDetail() {
  const { id } = useParams()
  const isNew  = id === 'new'
  const { user } = useAuth()
  const navigate = useNavigate()

  const [child,   setChild]   = useState(null)
  const [loading, setLoading] = useState(!isNew)
  const [saving,  setSaving]  = useState(false)
  const [toast,   setToast]   = useState(null)
  const [editMode, setEditMode] = useState(isNew)
  const [markModal, setMarkModal] = useState(null) // { vaccine }
  const [markForm, setMarkForm]   = useState({ givenDate: new Date().toISOString().split('T')[0], batchNo: '', notes: '', givenBy: '' })

  const today = new Date().toISOString().split('T')[0]

  const [form, setForm] = useState({
    childName: '', dob: '', gender: '',
    guardianName: '', motherPhone: '', fatherPhone: '',
    bloodGroup: '', notes: ''
  })

  useEffect(() => {
    if (!isNew && user && id) load()
  }, [id, user])

  async function load() {
    setLoading(true)
    try {
      const data = await getChild(user.uid, id)
      if (!data) { navigate('/clinic/vaccination'); return }
      setChild(data)
      setForm({
        childName:    data.childName    || '',
        dob:          data.dob          || '',
        gender:       data.gender       || '',
        guardianName: data.guardianName || '',
        motherPhone:  data.motherPhone  || '',
        fatherPhone:  data.fatherPhone  || '',
        bloodGroup:   data.bloodGroup   || '',
        notes:        data.notes        || '',
      })
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  const setF = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  function handleDobChange(e) {
    setForm(f => ({ ...f, dob: e.target.value }))
  }

  async function handleSave() {
    if (!form.childName || !form.dob) {
      setToast({ message: 'Child name and date of birth are required.', type: 'error' })
      return
    }
    setSaving(true)
    try {
      if (isNew) {
        const newId = await createChild(user.uid, { ...form, vaccines: {} })
        setToast({ message: 'Child profile created!', type: 'success' })
        setTimeout(() => navigate(`/clinic/vaccination/${newId}`), 1000)
      } else {
        await updateChild(user.uid, id, form)
        await load()
        setEditMode(false)
        setToast({ message: 'Profile saved.', type: 'success' })
      }
    } catch (e) {
      setToast({ message: 'Save failed. Try again.', type: 'error' })
    }
    setSaving(false)
  }

  async function handleMarkGiven() {
    if (!markModal) return
    setSaving(true)
    try {
      await markVaccineGiven(user.uid, id, markModal.vaccine.id, markForm)
      await load()
      setMarkModal(null)
      setToast({ message: `${markModal.vaccine.name} marked as given ✓`, type: 'success' })
    } catch (e) {
      setToast({ message: 'Failed to save. Try again.', type: 'error' })
    }
    setSaving(false)
  }

  async function handleUnmark(vaccineId) {
    setSaving(true)
    try {
      await unmarkVaccine(user.uid, id, vaccineId)
      await load()
      setToast({ message: 'Vaccine record removed.', type: 'info' })
    } catch (e) { }
    setSaving(false)
  }

  // Group schedule by milestone
  const milestones = [
    { label: 'At Birth',    maxMonths: 0.1 },
    { label: '6 Weeks',     maxMonths: 2 },
    { label: '10 Weeks',    maxMonths: 3 },
    { label: '14 Weeks',    maxMonths: 4 },
    { label: '6 Months',    maxMonths: 7 },
    { label: '9 Months',    maxMonths: 10 },
    { label: '12 Months',   maxMonths: 13 },
    { label: '15 Months',   maxMonths: 16 },
    { label: '18 Months',   maxMonths: 20 },
    { label: '2 Years',     maxMonths: 30 },
    { label: '5 Years',     maxMonths: 999 },
  ]

  function getVaccinesForMilestone(minMonths, maxMonths) {
    return DEFAULT_VACCINE_SCHEDULE.filter(v => v.atMonths > minMonths && v.atMonths <= maxMonths)
  }

  const given = child?.vaccines || {}
  const givenCount = Object.keys(given).filter(k => given[k]).length
  const total = DEFAULT_VACCINE_SCHEDULE.length

  if (loading) return <Layout title="Vaccination"><div style={{ padding: 60, textAlign: 'center', color: 'var(--muted)' }}>Loading…</div></Layout>

  return (
    <Layout title={isNew ? 'Add Child' : (child?.childName || 'Child Profile')}
      action={
        <div style={{ display: 'flex', gap: 10 }}>
          <Btn variant="ghost" small onClick={() => navigate('/clinic/vaccination')}>← Back</Btn>
          {!isNew && !editMode && <Btn small onClick={() => setEditMode(true)}>✎ Edit Profile</Btn>}
        </div>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: isNew ? '1fr' : '340px 1fr', gap: 20 }}>

        {/* Left: Child Profile */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card>
            <CardHeader title="Child Profile" sub={editMode ? 'Fill in details below' : ''} />
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

              {editMode ? (
                <>
                  <div>
                    <label style={lStyle}>Child's Full Name *</label>
                    <input value={form.childName} onChange={setF('childName')} placeholder="e.g. Aryan Sharma" style={iStyle} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={lStyle}>Date of Birth *</label>
                      <input type="date" value={form.dob} onChange={handleDobChange} max={today} style={{ ...iStyle, color: form.dob ? 'var(--navy)' : '#aaa' }} />
                    </div>
                    <div>
                      <label style={lStyle}>Gender</label>
                      <select value={form.gender} onChange={setF('gender')} style={iStyle}>
                        <option value="">Select</option>
                        <option value="Male">Male (Boy)</option>
                        <option value="Female">Female (Girl)</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label style={lStyle}>Guardian / Father's Name</label>
                    <input value={form.guardianName} onChange={setF('guardianName')} placeholder="e.g. Rajesh Sharma" style={iStyle} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={lStyle}>Mother's WhatsApp</label>
                      <input type="tel" value={form.motherPhone} onChange={setF('motherPhone')} placeholder="10-digit number" maxLength={10} style={iStyle} />
                    </div>
                    <div>
                      <label style={lStyle}>Father's WhatsApp</label>
                      <input type="tel" value={form.fatherPhone} onChange={setF('fatherPhone')} placeholder="10-digit number" maxLength={10} style={iStyle} />
                    </div>
                  </div>
                  <div>
                    <label style={lStyle}>Blood Group</label>
                    <select value={form.bloodGroup} onChange={setF('bloodGroup')} style={iStyle}>
                      <option value="">Unknown</option>
                      {['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(bg => <option key={bg} value={bg}>{bg}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={lStyle}>Notes (optional)</label>
                    <textarea value={form.notes} onChange={setF('notes')} placeholder="Allergies, conditions, etc." rows={2}
                      style={{ ...iStyle, resize: 'vertical' }} />
                  </div>
                  <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                    <Btn onClick={handleSave} disabled={saving} style={{ flex: 1, justifyContent: 'center' }}>
                      {saving ? 'Saving…' : isNew ? '✓ Create Profile' : '✓ Save Changes'}
                    </Btn>
                    {!isNew && <Btn variant="ghost" onClick={() => { setEditMode(false); load() }} style={{ flex: 1, justifyContent: 'center' }}>Cancel</Btn>}
                  </div>
                </>
              ) : (
                /* View mode */
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 4 }}>
                    <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--teal-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>
                      {child?.gender === 'Female' ? '👧' : '👦'}
                    </div>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--navy)' }}>{child?.childName}</div>
                      <div style={{ fontSize: 13, color: 'var(--slate)' }}>{getAgeStr(child?.dob)} {child?.gender ? `· ${child.gender}` : ''}</div>
                    </div>
                  </div>
                  {[
                    { label: 'Date of Birth', value: child?.dob },
                    { label: 'Blood Group',   value: child?.bloodGroup || '—' },
                    { label: 'Guardian',      value: child?.guardianName || '—' },
                    { label: "Mother's WhatsApp", value: child?.motherPhone || '—' },
                    { label: "Father's WhatsApp", value: child?.fatherPhone || '—' },
                  ].map(r => (
                    <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>{r.label}</span>
                      <span style={{ fontSize: 13, color: 'var(--navy)', fontWeight: 500 }}>{r.value}</span>
                    </div>
                  ))}
                  {child?.notes && (
                    <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: 'var(--slate)' }}>
                      📝 {child.notes}
                    </div>
                  )}
                </>
              )}
            </div>
          </Card>

          {/* Progress summary */}
          {!isNew && (
            <Card>
              <div style={{ padding: '16px 20px' }}>
                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)', marginBottom: 12 }}>Vaccination Progress</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                  <div style={{ flex: 1, height: 10, background: 'var(--border)', borderRadius: 5 }}>
                    <div style={{ width: `${Math.round((givenCount / total) * 100)}%`, height: '100%', background: givenCount === total ? '#16A34A' : 'var(--teal)', borderRadius: 5, transition: 'width 0.3s' }} />
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', whiteSpace: 'nowrap' }}>{givenCount}/{total}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {givenCount === total ? '🎉 All vaccines completed!' : `${total - givenCount} vaccines remaining`}
                </div>
              </div>
            </Card>
          )}
        </div>

        {/* Right: Vaccine Schedule */}
        {!isNew && (
          <Card>
            <CardHeader title="Vaccine Schedule" sub="Tap any pending vaccine to mark as given" />
            <div style={{ padding: '8px 0 16px' }}>
              {milestones.map((milestone, mi) => {
                const prevMax = mi === 0 ? -1 : milestones[mi - 1].maxMonths
                const vaccines = getVaccinesForMilestone(prevMax, milestone.maxMonths)
                if (vaccines.length === 0) return null
                return (
                  <div key={milestone.label} style={{ marginBottom: 4 }}>
                    {/* Milestone header */}
                    <div style={{ padding: '10px 20px 6px', fontSize: 11, fontWeight: 700, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: 0.8, background: 'var(--teal-light)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
                      💉 {milestone.label}
                    </div>
                    {vaccines.map(vaccine => {
                      const record   = given[vaccine.id]
                      const isDone   = !!(record && record.givenDate)
                      const dueDate  = child?.dob ? getDueDate(child.dob, vaccine.atMonths) : null
                      const isOverdue = dueDate && !isDone && dueDate < today
                      return (
                        <div key={vaccine.id} style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, background: isDone ? '#F0FDF4' : isOverdue ? '#FEF2F2' : 'transparent' }}>
                          {/* Status icon */}
                          <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, background: isDone ? '#16A34A' : isOverdue ? '#FEE2E2' : 'var(--border)', color: isDone ? '#fff' : isOverdue ? '#991B1B' : 'var(--muted)' }}>
                            {isDone ? '✓' : isOverdue ? '!' : '○'}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: isDone ? '#15803D' : 'var(--navy)' }}>{vaccine.name}</div>
                            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                              {isDone
                                ? `Given on ${record.givenDate}${record.batchNo ? ` · Batch: ${record.batchNo}` : ''}${record.givenBy ? ` · By: ${record.givenBy}` : ''}`
                                : dueDate ? `Due: ${dueDate}${isOverdue ? ' ⚠ Overdue' : ''}` : vaccine.description
                              }
                            </div>
                          </div>
                          {isDone ? (
                            <button onClick={() => handleUnmark(vaccine.id)}
                              style={{ fontSize: 11, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: 6 }}>
                              ✕ Undo
                            </button>
                          ) : (
                            <button onClick={() => { setMarkModal({ vaccine }); setMarkForm({ givenDate: today, batchNo: '', notes: '', givenBy: '' }) }}
                              style={{ fontSize: 12, color: 'var(--teal)', background: 'var(--teal-light)', border: '1px solid var(--teal)', borderRadius: 8, padding: '5px 14px', cursor: 'pointer', fontWeight: 600, fontFamily: 'DM Sans, sans-serif' }}>
                              Mark Given
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </Card>
        )}
      </div>

      {/* Mark as Given Modal */}
      {markModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 28, maxWidth: 420, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--navy)', marginBottom: 4 }}>
              💉 Mark as Given
            </div>
            <div style={{ fontSize: 13, color: 'var(--teal)', marginBottom: 20 }}>{markModal.vaccine.name}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={lStyle}>Date Given *</label>
                <input type="date" value={markForm.givenDate} max={today}
                  onChange={e => setMarkForm(f => ({ ...f, givenDate: e.target.value }))} style={iStyle} />
              </div>
              <div>
                <label style={lStyle}>Batch Number (optional)</label>
                <input value={markForm.batchNo} onChange={e => setMarkForm(f => ({ ...f, batchNo: e.target.value }))}
                  placeholder="e.g. BX2024001" style={iStyle} />
              </div>
              <div>
                <label style={lStyle}>Given By (optional)</label>
                <input value={markForm.givenBy} onChange={e => setMarkForm(f => ({ ...f, givenBy: e.target.value }))}
                  placeholder="e.g. Dr. Mehta" style={iStyle} />
              </div>
              <div>
                <label style={lStyle}>Notes (optional)</label>
                <input value={markForm.notes} onChange={e => setMarkForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Any reaction, site, remarks" style={iStyle} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <Btn onClick={handleMarkGiven} disabled={saving} style={{ flex: 1, justifyContent: 'center' }}>
                {saving ? 'Saving…' : '✓ Confirm'}
              </Btn>
              <Btn variant="ghost" onClick={() => setMarkModal(null)} style={{ flex: 1, justifyContent: 'center' }}>Cancel</Btn>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </Layout>
  )
}
