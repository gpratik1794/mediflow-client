// src/pages/clinic/VaccinationDetail.jsx
import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../utils/AuthContext'
import Layout from '../../components/Layout'
import { Card, CardHeader, Btn, Toast } from '../../components/UI'
import {
  getChild, updateChild, createChild,
  markVaccineGiven, unmarkVaccine,
  DEFAULT_VACCINE_SCHEDULE, getDueDate,
  scheduleVaccinationReminders
} from '../../firebase/vaccinationDb'
import { sendCampaign } from '../../firebase/whatsapp'
import { doc, setDoc } from 'firebase/firestore'
import { db } from '../../firebase/config'

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

function formatDate(str) {
  if (!str) return '—'
  return new Date(str).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

// WA status badge
function WaBadge({ label, status }) {
  const styles = {
    sent:    { bg: '#F0FDF4', color: '#15803D', border: '#BBF7D0' },
    failed:  { bg: '#FEF2F2', color: '#DC2626', border: '#FECACA' },
    pending: { bg: '#FFFBEB', color: '#D97706', border: '#FCD34D' },
  }
  const s = styles[status] || styles.pending
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 20, fontSize: 9, fontWeight: 600, background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
      📱 {label} {status === 'sent' ? '✓' : status === 'failed' ? '✗' : '—'}
    </span>
  )
}

export default function VaccinationDetail() {
  const { id } = useParams()
  const isNew  = id === 'new'
  const { user, profile } = useAuth()
  const navigate = useNavigate()

  const [child,      setChild]      = useState(null)
  const [loading,    setLoading]    = useState(!isNew)
  const [saving,     setSaving]     = useState(false)
  const [toast,      setToast]      = useState(null)
  const [editMode,   setEditMode]   = useState(isNew)
  const [markModal,  setMarkModal]  = useState(null)   // { vaccine }
  const [markForm,   setMarkForm]   = useState({ givenDate: new Date().toISOString().split('T')[0], batchNo: '', notes: '', givenBy: '' })
  const [activeTab,  setActiveTab]  = useState('schedule')
  const [waParams,   setWaParams]   = useState([])     // editable WA params in modal
  const [skipWa,     setSkipWa]     = useState(false)  // skip WA toggle in modal
  const [resending,  setResending]  = useState(null)   // vaccineId being resent

  const today = new Date().toISOString().split('T')[0]
  const [form, setForm] = useState({ childName: '', dob: '', gender: '', guardianName: '', motherPhone: '', fatherPhone: '', bloodGroup: '', notes: '' })

  useEffect(() => { if (!isNew && user && id) load() }, [id, user])

  async function load() {
    setLoading(true)
    try {
      const data = await getChild(user.uid, id)
      if (!data) { navigate('/clinic/vaccination'); return }
      setChild(data)
      setForm({ childName: data.childName||'', dob: data.dob||'', gender: data.gender||'', guardianName: data.guardianName||'', motherPhone: data.motherPhone||'', fatherPhone: data.fatherPhone||'', bloodGroup: data.bloodGroup||'', notes: data.notes||'' })
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  const setF = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  async function handleSave() {
    if (!form.childName || !form.dob) { setToast({ message: 'Child name and date of birth are required.', type: 'error' }); return }
    setSaving(true)
    try {
      if (isNew) {
        const newId = await createChild(user.uid, { ...form, vaccines: {} })
        setToast({ message: 'Child profile created!', type: 'success' })
        setTimeout(() => navigate(`/clinic/vaccination/${newId}`), 1000)
      } else {
        await updateChild(user.uid, id, form)
        await load(); setEditMode(false)
        setToast({ message: 'Profile saved.', type: 'success' })
      }
    } catch (e) { setToast({ message: 'Save failed. Try again.', type: 'error' }) }
    setSaving(false)
  }

  // Send WA for a vaccine and return { motherStatus, fatherStatus }
  async function sendVaccineWa(vaccineId, vaccineName, params) {
    const campaigns = profile?.whatsappCampaigns || []
    const phones = {
      mother: child?.motherPhone || null,
      father: child?.fatherPhone || null,
    }
    const results = { mother: null, father: null }
    for (const [who, phone] of Object.entries(phones)) {
      if (!phone) continue
      try {
        const res = await sendCampaign(campaigns, 'vaccine_given', phone, params)
        results[who] = res?.ok ? 'sent' : 'failed'
      } catch { results[who] = 'failed' }
    }
    return results
  }

  // Save WA status onto the vaccine record in Firestore
  async function saveWaStatus(vaccineId, waStatus) {
    try {
      const existing = child?.vaccines?.[vaccineId] || {}
      await setDoc(
        doc(db, 'centres', user.uid, 'vaccination', id),
        { vaccines: { [vaccineId]: { ...existing, waStatus } } },
        { merge: true }
      )
    } catch (e) { console.warn('WA status save failed:', e) }
  }

  async function handleMarkGiven() {
    if (!markModal) return
    setSaving(true)
    try {
      await markVaccineGiven(user.uid, id, markModal.vaccine.id, markForm)
      const updatedChild = await getChild(user.uid, id)
      const updatedGiven = updatedChild?.vaccines || {}
      const nextVaccine  = DEFAULT_VACCINE_SCHEDULE.find(v => !(updatedGiven[v.id]?.givenDate))

      // Send WhatsApp (unless skipped)
      const hasGivenCampaign = (profile?.whatsappCampaigns || []).some(c => c.purpose === 'vaccine_given' && c.enabled !== false)
      let waStatus = null
      if (hasGivenCampaign && !skipWa) {
        const results = await sendVaccineWa(markModal.vaccine.id, markModal.vaccine.name, waParams)
        waStatus = results
        await saveWaStatus(markModal.vaccine.id, results)
      }

      // Schedule reminders (non-blocking)
      if (nextVaccine && updatedChild) {
        try {
          const reminderDays = (profile?.vaccinationReminderDays || '7,3,1').split(',').map(Number).filter(Boolean)
          await scheduleVaccinationReminders(user.uid, id, updatedChild, nextVaccine, reminderDays)
        } catch (e) { console.warn('Reminder scheduling skipped:', e) }
      }

      await load()
      setMarkModal(null)
      setSkipWa(false)

      // Toast with per-parent status
      let toastMsg = `${markModal.vaccine.name} marked as given ✓`
      if (waStatus) {
        const parts = []
        if (waStatus.mother) parts.push(`Mother ${waStatus.mother === 'sent' ? '✓' : '✗'}`)
        if (waStatus.father) parts.push(`Father ${waStatus.father === 'sent' ? '✓' : '✗'}`)
        if (parts.length) toastMsg += ` · WA: ${parts.join(', ')}`
      } else if (skipWa) {
        toastMsg += ' · WA skipped'
      }
      setToast({ message: toastMsg, type: 'success' })
    } catch (e) {
      console.error(e)
      setToast({ message: 'Failed to save. Try again.', type: 'error' })
    }
    setSaving(false)
  }

  // Resend WA for an already-given vaccine
  async function handleResend(vaccine, record) {
    setResending(vaccine.id)
    try {
      const nextV = DEFAULT_VACCINE_SCHEDULE.find(v => v.id !== vaccine.id && !(child?.vaccines?.[v.id]?.givenDate))
      const params = [
        child?.childName || '',
        vaccine.name,
        record.givenDate,
        nextV && child?.dob ? `${nextV.name} on ${formatDate(getDueDate(child.dob, nextV.atMonths))}` : 'All vaccines completed!',
        profile?.centreName || ''
      ]
      const results = await sendVaccineWa(vaccine.id, vaccine.name, params)
      await saveWaStatus(vaccine.id, results)
      await load()
      const parts = []
      if (results.mother) parts.push(`Mother ${results.mother === 'sent' ? '✓' : '✗'}`)
      if (results.father) parts.push(`Father ${results.father === 'sent' ? '✓' : '✗'}`)
      setToast({ message: `WA resent: ${parts.join(', ')}`, type: results.mother === 'sent' || results.father === 'sent' ? 'success' : 'error' })
    } catch (e) {
      setToast({ message: 'Resend failed', type: 'error' })
    }
    setResending(null)
  }

  async function handleUnmark(vaccineId) {
    setSaving(true)
    try { await unmarkVaccine(user.uid, id, vaccineId); await load(); setToast({ message: 'Vaccine record removed.', type: 'info' }) }
    catch (e) {}
    setSaving(false)
  }

  const milestones = [
    { label: 'At Birth', maxMonths: 0.1 }, { label: '6 Weeks', maxMonths: 2 },
    { label: '10 Weeks', maxMonths: 3 }, { label: '14 Weeks', maxMonths: 4 },
    { label: '6 Months', maxMonths: 7 }, { label: '9 Months', maxMonths: 10 },
    { label: '12 Months', maxMonths: 13 }, { label: '15 Months', maxMonths: 16 },
    { label: '18 Months', maxMonths: 20 }, { label: '2 Years', maxMonths: 30 },
    { label: '5 Years', maxMonths: 999 },
  ]

  const given    = child?.vaccines || {}
  const givenCount = Object.keys(given).filter(k => given[k]).length
  const total    = DEFAULT_VACCINE_SCHEDULE.length
  const givenList = DEFAULT_VACCINE_SCHEDULE
    .filter(v => given[v.id]?.givenDate)
    .map(v => ({ ...v, record: given[v.id] }))
    .sort((a,b) => b.record.givenDate.localeCompare(a.record.givenDate))
  const nextVaccine = DEFAULT_VACCINE_SCHEDULE.find(v => !(given[v.id]?.givenDate))
  const hasGivenCampaign = (profile?.whatsappCampaigns || []).some(c => c.purpose === 'vaccine_given' && c.enabled !== false)

  function openMarkModal(vaccine) {
    setMarkModal({ vaccine })
    setMarkForm({ givenDate: today, batchNo: '', notes: '', givenBy: '' })
    setSkipWa(false)
    const nextV = DEFAULT_VACCINE_SCHEDULE.find(v2 => v2.id !== vaccine.id && !(given[v2.id]?.givenDate))
    setWaParams([
      child?.childName || '',
      vaccine.name,
      today,
      nextV && child?.dob ? `${nextV.name} on ${formatDate(getDueDate(child.dob, nextV.atMonths))}` : 'All vaccines completed!',
      profile?.centreName || ''
    ])
  }

  if (loading) return <Layout title="Vaccination"><div style={{ padding: 60, textAlign: 'center', color: 'var(--muted)' }}>Loading…</div></Layout>

  return (
    <Layout title={isNew ? 'Add Child' : (child?.childName || 'Child Profile')}
      action={<div style={{ display: 'flex', gap: 10 }}><Btn variant="ghost" small onClick={() => navigate('/clinic/vaccination')}>← Back</Btn>{!isNew && !editMode && <Btn small onClick={() => setEditMode(true)}>✎ Edit Profile</Btn>}</div>}
    >
      <div style={{ display: 'grid', gridTemplateColumns: isNew ? '1fr' : '340px 1fr', gap: 20 }}>

        {/* Left */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card>
            <CardHeader title="Child Profile" sub={editMode ? 'Fill in details below' : ''} />
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {editMode ? (
                <>
                  <div><label style={lStyle}>Child's Full Name *</label><input value={form.childName} onChange={setF('childName')} placeholder="e.g. Aryan Sharma" style={iStyle} /></div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div><label style={lStyle}>Date of Birth *</label><input type="date" value={form.dob} onChange={setF('dob')} max={today} style={{ ...iStyle, color: form.dob ? 'var(--navy)' : '#aaa' }} /></div>
                    <div><label style={lStyle}>Gender</label><select value={form.gender} onChange={setF('gender')} style={iStyle}><option value="">Select</option><option value="Male">Male (Boy)</option><option value="Female">Female (Girl)</option></select></div>
                  </div>
                  <div><label style={lStyle}>Guardian / Father's Name</label><input value={form.guardianName} onChange={setF('guardianName')} placeholder="e.g. Rajesh Sharma" style={iStyle} /></div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div><label style={lStyle}>Mother's WhatsApp</label><input type="tel" value={form.motherPhone} onChange={setF('motherPhone')} placeholder="10-digit" maxLength={10} style={iStyle} /></div>
                    <div><label style={lStyle}>Father's WhatsApp</label><input type="tel" value={form.fatherPhone} onChange={setF('fatherPhone')} placeholder="10-digit" maxLength={10} style={iStyle} /></div>
                  </div>
                  <div><label style={lStyle}>Blood Group</label><select value={form.bloodGroup} onChange={setF('bloodGroup')} style={iStyle}><option value="">Unknown</option>{['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(bg => <option key={bg}>{bg}</option>)}</select></div>
                  <div><label style={lStyle}>Notes (optional)</label><textarea value={form.notes} onChange={setF('notes')} placeholder="Allergies, conditions, etc." rows={2} style={{ ...iStyle, resize: 'vertical' }} /></div>
                  <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                    <Btn onClick={handleSave} disabled={saving} style={{ flex: 1, justifyContent: 'center' }}>{saving ? 'Saving…' : isNew ? '✓ Create Profile' : '✓ Save Changes'}</Btn>
                    {!isNew && <Btn variant="ghost" onClick={() => { setEditMode(false); load() }} style={{ flex: 1, justifyContent: 'center' }}>Cancel</Btn>}
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 4 }}>
                    <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--teal-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>{child?.gender === 'Female' ? '👧' : '👦'}</div>
                    <div><div style={{ fontSize: 18, fontWeight: 700, color: 'var(--navy)' }}>{child?.childName}</div><div style={{ fontSize: 13, color: 'var(--slate)' }}>{getAgeStr(child?.dob)}{child?.gender ? ` · ${child.gender}` : ''}</div></div>
                  </div>
                  {[{ label: 'Date of Birth', value: child?.dob }, { label: 'Blood Group', value: child?.bloodGroup||'—' }, { label: 'Guardian', value: child?.guardianName||'—' }, { label: "Mother's WhatsApp", value: child?.motherPhone||'—' }, { label: "Father's WhatsApp", value: child?.fatherPhone||'—' }].map(r => (
                    <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>{r.label}</span>
                      <span style={{ fontSize: 13, color: 'var(--navy)', fontWeight: 500 }}>{r.value}</span>
                    </div>
                  ))}
                  {child?.notes && <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: 'var(--slate)' }}>📝 {child.notes}</div>}
                </>
              )}
            </div>
          </Card>

          {!isNew && (
            <Card>
              <div style={{ padding: '16px 20px' }}>
                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)', marginBottom: 12 }}>Vaccination Progress</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                  <div style={{ flex: 1, height: 10, background: 'var(--border)', borderRadius: 5 }}>
                    <div style={{ width: `${Math.round((givenCount/total)*100)}%`, height: '100%', background: givenCount===total ? '#16A34A' : 'var(--teal)', borderRadius: 5, transition: 'width 0.3s' }} />
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', whiteSpace: 'nowrap' }}>{givenCount}/{total}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{givenCount===total ? '🎉 All vaccines completed!' : `${total-givenCount} vaccines remaining`}</div>
              </div>
            </Card>
          )}

          {/* Next Vaccine Card */}
          {!isNew && nextVaccine && child?.dob && (() => {
            const dueStr = getDueDate(child.dob, nextVaccine.atMonths)
            const diff   = Math.ceil((new Date(dueStr) - new Date()) / (1000*60*60*24))
            return (
              <Card>
                <div style={{ padding: '16px 20px' }}>
                  <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)', marginBottom: 10 }}>Next Vaccine Due</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)', marginBottom: 4 }}>💉 {nextVaccine.name}</div>
                  <div style={{ fontSize: 13, color: 'var(--teal)', fontWeight: 600 }}>{formatDate(dueStr)}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{nextVaccine.description}</div>
                  <div style={{ fontSize: 12, marginTop: 6, fontWeight: 600, color: diff < 0 ? '#DC2626' : diff <= 7 ? '#D97706' : 'var(--muted)' }}>
                    {diff < 0 ? `⚠ Overdue by ${Math.abs(diff)} days` : diff <= 7 ? `⏰ Due in ${diff} days` : `In ${diff} days`}
                  </div>
                </div>
              </Card>
            )
          })()}
        </div>

        {/* Right: Tabs */}
        {!isNew && (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', background: 'var(--surface)', borderRadius: '14px 14px 0 0', overflow: 'hidden', borderBottom: '2px solid var(--border)' }}>
              {[{ key: 'schedule', label: '💉 Vaccine Schedule' }, { key: 'given', label: `✅ Given (${givenCount})` }].map(tab => (
                <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{ flex: 1, padding: '14px 20px', border: 'none', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontSize: 13, fontWeight: 600, background: activeTab===tab.key ? 'var(--teal-light)' : 'var(--surface)', color: activeTab===tab.key ? 'var(--teal)' : 'var(--muted)', borderBottom: activeTab===tab.key ? '2px solid var(--teal)' : '2px solid transparent', marginBottom: -2 }}>{tab.label}</button>
              ))}
            </div>

            <Card style={{ borderRadius: '0 0 14px 14px', flex: 1 }}>
              {activeTab === 'schedule' && (
                <div style={{ padding: '8px 0 16px' }}>
                  <div style={{ padding: '8px 20px 4px', fontSize: 12, color: 'var(--muted)' }}>Tap any pending vaccine to mark as given</div>
                  {milestones.map((milestone, mi) => {
                    const prevMax  = mi === 0 ? -1 : milestones[mi-1].maxMonths
                    const vaccines = DEFAULT_VACCINE_SCHEDULE.filter(v => v.atMonths > prevMax && v.atMonths <= milestone.maxMonths)
                    if (!vaccines.length) return null
                    return (
                      <div key={milestone.label} style={{ marginBottom: 4 }}>
                        <div style={{ padding: '10px 20px 6px', fontSize: 11, fontWeight: 700, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: 0.8, background: 'var(--teal-light)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>💉 {milestone.label}</div>
                        {vaccines.map(vaccine => {
                          const record    = given[vaccine.id]
                          const isDone    = !!(record?.givenDate)
                          const dueDate   = child?.dob ? getDueDate(child.dob, vaccine.atMonths) : null
                          const isOverdue = dueDate && !isDone && dueDate < today
                          const waStatus  = record?.waStatus
                          return (
                            <div key={vaccine.id} style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, background: isDone ? '#F0FDF4' : isOverdue ? '#FEF2F2' : 'transparent' }}>
                              <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, background: isDone ? '#16A34A' : isOverdue ? '#FEE2E2' : 'var(--border)', color: isDone ? '#fff' : isOverdue ? '#991B1B' : 'var(--muted)' }}>{isDone ? '✓' : isOverdue ? '!' : '○'}</div>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: isDone ? '#15803D' : 'var(--navy)' }}>{vaccine.name}</div>
                                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{isDone ? `Given on ${record.givenDate}${record.batchNo ? ` · Batch: ${record.batchNo}` : ''}${record.givenBy ? ` · By: ${record.givenBy}` : ''}` : dueDate ? `Due: ${dueDate}${isOverdue ? ' ⚠ Overdue' : ''}` : vaccine.description}</div>
                                {isDone && waStatus && (
                                  <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                                    {waStatus.mother && <WaBadge label="Mother" status={waStatus.mother} />}
                                    {waStatus.father && <WaBadge label="Father" status={waStatus.father} />}
                                  </div>
                                )}
                              </div>
                              {isDone ? (
                                <button onClick={() => handleUnmark(vaccine.id)} style={{ fontSize: 11, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: 6 }}>✕ Undo</button>
                              ) : (
                                <button onClick={() => openMarkModal(vaccine)} style={{ fontSize: 12, color: 'var(--teal)', background: 'var(--teal-light)', border: '1px solid var(--teal)', borderRadius: 8, padding: '5px 14px', cursor: 'pointer', fontWeight: 600, fontFamily: 'DM Sans, sans-serif' }}>Mark Given</button>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              )}

              {activeTab === 'given' && (
                <div style={{ padding: '16px 20px' }}>
                  {givenList.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted)', fontSize: 13 }}>No vaccines marked as given yet.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {givenList.map(v => {
                        const waStatus = v.record?.waStatus
                        const needsResend = hasGivenCampaign && (!waStatus || waStatus.mother === 'failed' || waStatus.father === 'failed' || (!waStatus.mother && !waStatus.father))
                        return (
                          <div key={v.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '14px 16px', background: '#F0FDF4', borderRadius: 12, border: '1px solid #BBF7D0' }}>
                            <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 15, flexShrink: 0 }}>✓</div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 14, fontWeight: 700, color: '#14532D' }}>{v.name}</div>
                              <div style={{ fontSize: 12, color: '#166534', marginTop: 2 }}>Given on {formatDate(v.record.givenDate)}</div>
                              {v.record.givenBy && <div style={{ fontSize: 11, color: '#15803D', marginTop: 1 }}>By: {v.record.givenBy}</div>}
                              {v.record.batchNo && <div style={{ fontSize: 11, color: '#15803D' }}>Batch: {v.record.batchNo}</div>}
                              {v.record.notes && <div style={{ fontSize: 11, color: '#166534', marginTop: 2, fontStyle: 'italic' }}>{v.record.notes}</div>}
                              {/* WA status badges */}
                              {waStatus && (
                                <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                                  {waStatus.mother && <WaBadge label="Mother" status={waStatus.mother} />}
                                  {waStatus.father && <WaBadge label="Father" status={waStatus.father} />}
                                  {needsResend && (
                                    <button onClick={() => handleResend(v, v.record)} disabled={resending === v.id} style={{ padding: '2px 10px', borderRadius: 20, border: '1px solid #FCD34D', background: '#FFFBEB', color: '#D97706', fontSize: 9, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                                      {resending === v.id ? '…' : '↻ Resend'}
                                    </button>
                                  )}
                                </div>
                              )}
                              {/* No WA status yet — show Send button */}
                              {!waStatus && hasGivenCampaign && (
                                <button onClick={() => handleResend(v, v.record)} disabled={resending === v.id} style={{ marginTop: 6, padding: '3px 10px', borderRadius: 20, border: '1px solid #BBF7D0', background: '#DCFCE7', color: '#15803D', fontSize: 9, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                                  {resending === v.id ? '…' : '📱 Send WA'}
                                </button>
                              )}
                            </div>
                            <div style={{ fontSize: 11, color: '#15803D', background: '#DCFCE7', padding: '3px 10px', borderRadius: 20, whiteSpace: 'nowrap' }}>{v.description}</div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </Card>
          </div>
        )}
      </div>

      {/* Mark as Given Modal */}
      {markModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, overflowY: 'auto' }}>
          <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 28, maxWidth: 440, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--navy)', marginBottom: 4 }}>💉 Mark as Given</div>
            <div style={{ fontSize: 13, color: 'var(--teal)', marginBottom: 20 }}>{markModal.vaccine.name}</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div><label style={lStyle}>Date Given *</label>
                <div style={{ position: 'relative' }} onClick={e => e.currentTarget.querySelector('input').showPicker?.()}>
                  <input type="date" value={markForm.givenDate} max={today}
                    onChange={e => { setMarkForm(f => ({ ...f, givenDate: e.target.value })); setWaParams(p => { const n=[...p]; n[2]=e.target.value; return n }) }}
                    style={{ ...iStyle, cursor: 'pointer', colorScheme: 'light' }} />
                </div>
              </div>
              <div><label style={lStyle}>Batch Number (optional)</label><input value={markForm.batchNo} onChange={e => setMarkForm(f => ({ ...f, batchNo: e.target.value }))} placeholder="e.g. BX2024001" style={iStyle} /></div>
              <div><label style={lStyle}>Given By (optional)</label><input value={markForm.givenBy} onChange={e => setMarkForm(f => ({ ...f, givenBy: e.target.value }))} placeholder="e.g. Dr. Mehta" style={iStyle} /></div>
              <div><label style={lStyle}>Notes (optional)</label><input value={markForm.notes} onChange={e => setMarkForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any reaction, site, remarks" style={iStyle} /></div>
            </div>

            {/* WhatsApp section */}
            {hasGivenCampaign && (
              <div style={{ marginTop: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: 0.4 }}>📱 WhatsApp Message</div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11, color: 'var(--muted)' }}>
                    <input type="checkbox" checked={skipWa} onChange={e => setSkipWa(e.target.checked)} style={{ accentColor: 'var(--teal)' }} />
                    Skip this time
                  </label>
                </div>
                {!skipWa && (
                  <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: 10, color: '#15803D', marginBottom: 2 }}>Will send to: {[child?.motherPhone && 'Mother', child?.fatherPhone && 'Father'].filter(Boolean).join(' + ') || 'No phone numbers on file'}</div>
                    {['Child Name', 'Vaccine Name', 'Date Given', 'Next Vaccine Info', 'Centre Name'].map((label, i) => (
                      <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <label style={{ fontSize: 9, color: '#15803D', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3 }}>Param {i+1}: {label}</label>
                        <input value={waParams[i] || ''} onChange={e => setWaParams(p => { const n=[...p]; n[i]=e.target.value; return n })}
                          style={{ ...iStyle, fontSize: 12, padding: '6px 10px', background: '#fff', border: '1px solid #BBF7D0' }} />
                      </div>
                    ))}
                    <div style={{ fontSize: 10, color: '#15803D' }}>✎ Edit any param before confirming</div>
                  </div>
                )}
                {skipWa && <div style={{ fontSize: 12, color: 'var(--muted)', padding: '8px 12px', background: 'var(--bg)', borderRadius: 8 }}>WhatsApp will not be sent. You can send from the Given tab later.</div>}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <Btn onClick={handleMarkGiven} disabled={saving} style={{ flex: 1, justifyContent: 'center' }}>
                {saving ? 'Saving…' : hasGivenCampaign && !skipWa ? '✓ Confirm & Send WA' : '✓ Confirm'}
              </Btn>
              <Btn variant="ghost" onClick={() => { setMarkModal(null); setSkipWa(false) }} style={{ flex: 1, justifyContent: 'center' }}>Cancel</Btn>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </Layout>
  )
}
