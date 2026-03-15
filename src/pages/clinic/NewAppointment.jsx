// src/pages/clinic/NewAppointment.jsx
import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../utils/AuthContext'
import Layout from '../../components/Layout'
import { Card, CardHeader, Btn, Toast } from '../../components/UI'
import { createAppointment, getNextToken, getAppointments, updateAppointment, upsertClinicPatient , logActivity } from '../../firebase/clinicDb'
import { sendCampaign } from '../../firebase/whatsapp'
import { searchPatients } from '../../firebase/db'
import { format } from 'date-fns'
import DobPicker from '../../components/DobPicker'

function generateSlots(startTime, endTime, intervalMinutes) {
  const slots = []
  const [startH, startM] = (startTime || '09:00').split(':').map(Number)
  const [endH, endM]     = (endTime   || '20:00').split(':').map(Number)
  const interval = Number(intervalMinutes) || 30
  let current = startH * 60 + startM
  const end   = endH   * 60 + endM
  while (current < end) {
    const h    = Math.floor(current / 60)
    const m    = current % 60
    const ampm = h < 12 ? 'AM' : 'PM'
    const h12  = h === 0 ? 12 : h > 12 ? h - 12 : h
    slots.push(`${String(h12).padStart(2,'0')}:${String(m).padStart(2,'0')} ${ampm}`)
    current += interval
  }
  slots.push('Walk-in (no slot)')
  return slots
}

const iStyle = {
  width: '100%', padding: '10px 14px', borderRadius: 10,
  border: '1.5px solid var(--border)', fontSize: 13,
  fontFamily: 'DM Sans, sans-serif', outline: 'none',
  background: 'var(--surface)', color: 'var(--navy)', boxSizing: 'border-box'
}
const lStyle = { fontSize: 11, color: 'var(--slate)', fontWeight: 500, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.4 }

export default function NewAppointment() {
  const { user, profile } = useAuth()
  const centreId = profile?._centreId || user?.uid
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const [loading, setLoading]             = useState(false)
  const [toast, setToast]                 = useState(null)
  const [searchResults, setSearchResults] = useState([])
  const [bookedSlots, setBookedSlots]     = useState([])
  const [searching, setSearching]         = useState(false)
  const submittingRef                     = useRef(false)
  const today = format(new Date(), 'yyyy-MM-dd')

  // ── Duplicate appointment detection ──────────────────────────────────────
  const [dupAppt, setDupAppt]           = useState(null)   // existing appt for this phone today
  const [dupChoice, setDupChoice]       = useState(null)   // null | 'relative' | 'same' | 'reschedule'
  const [rescheduling, setRescheduling] = useState(false)

  const [form, setForm] = useState({
    patientName: '', phone: searchParams.get('phone') || '',
    age: '', dob: '', gender: '',
    visitType: 'New Visit', appointmentTime: '', doctorName: '',
    date: today, chiefComplaint: '', refDoctor: '',
    consultationFee: '', paymentStatus: 'pending'
  })

  useEffect(() => { if (form.phone?.length === 10) doSearch(form.phone) }, [])
  useEffect(() => {
    if (!user) return
    getAppointments(centreId, form.date).then(ex =>
      setBookedSlots(
        ex
          .filter(a => a.status !== 'cancelled')
          .filter(a => {
            // Only show slots booked for the same doctor; if no doctor set yet, show all
            if (!form.doctorName || !a.doctorName) return true
            return a.doctorName === form.doctorName
          })
          .map(a => a.appointmentTime)
      )
    )
  }, [form.date, form.doctorName, user])

  const setF = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  async function doSearch(phone) {
    setSearching(true)
    try {
      const results = await searchPatients(centreId, phone)
      if (results.length === 1) {
        fillPatient(results[0])
        // Auto-fetch fee based on visit history
        autoFetchFee(results[0])
      }
      else setSearchResults(results)

      // ── Check for duplicate appointment today ──
      if (form.date === today) {
        const todayAppts = await getAppointments(centreId, today)
        const existing = todayAppts.find(a =>
          a.phone?.replace(/\D/g,'').slice(-10) === phone.slice(-10) &&
          a.status !== 'cancelled' && a.status !== 'done'
        )
        if (existing) { setDupAppt(existing); setDupChoice(null) }
        else setDupAppt(null)
      }
    } catch (e) { console.error(e) }
    setSearching(false)
  }

  function autoFetchFee(patient) {
    // Find doctor config — use selected doctor or first doctor
    const docName = form.doctorName
    const docObj  = (profile?.doctors || []).find(d => d.name === docName) || profile?.doctors?.[0] || {}
    const firstFee   = docObj.firstVisitFee  || ''
    const repeatFee  = docObj.repeatVisitFee || ''
    const resetMonths = Number(docObj.feeResetMonths) || 0

    if (!firstFee && !repeatFee) return // no fees configured

    let suggestedFee = firstFee
    let feeHint = 'first'

    const lastVisit = patient?.lastClinicVisit
    if (lastVisit) {
      const monthsDiff = (new Date() - new Date(lastVisit)) / (1000 * 60 * 60 * 24 * 30.44)
      if (resetMonths > 0 && monthsDiff > resetMonths) {
        suggestedFee = firstFee
        feeHint = 'reset'
      } else if (repeatFee) {
        suggestedFee = repeatFee
        feeHint = 'repeat'
      }
    }

    if (suggestedFee) {
      setForm(f => ({ ...f, consultationFee: String(suggestedFee), _feeHint: feeHint }))
    }
  }

  function handlePhoneChange(e) {
    const phone = e.target.value.replace(/\D/g, '').slice(0, 10)
    setForm(f => ({ ...f, phone }))
    setSearchResults([])
    setDupAppt(null); setDupChoice(null)
    if (phone.length === 10) doSearch(phone)
  }

  async function handleReschedule() {
    if (!dupAppt) return
    setRescheduling(true)
    try {
      await updateAppointment(centreId, dupAppt.id, { status: 'rescheduled' })
      setBookedSlots(prev => prev.filter(s => s !== dupAppt.appointmentTime))
      setDupChoice('reschedule')
      setDupAppt(null)
      // Clear previously selected slot so user must pick a new one
      setForm(f => ({ ...f, appointmentTime: '' }))
    } catch (e) {
      setToast({ message: 'Reschedule failed. Try again.', type: 'error' })
    }
    setRescheduling(false)
  }

  function fillPatient(p) {
    setForm(f => ({ ...f, patientName: p.name || f.patientName, age: p.age || f.age, dob: p.dob || f.dob, gender: p.gender || f.gender }))
    setSearchResults([])
  }

  function handleDobChange(e) {
    const age = dob ? String(Math.floor((new Date() - new Date(dob)) / (365.25 * 24 * 60 * 60 * 1000))) : ''
    setForm(f => ({ ...f, dob, age }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.patientName || !form.phone) return
    if (!form.appointmentTime) {
      setToast({ message: 'Please select a time slot before booking.', type: 'error' })
      return
    }
    if (submittingRef.current) return
    submittingRef.current = true
    if (form.appointmentTime !== 'Walk-in (no slot)') {
      const ex = await getAppointments(centreId, form.date)
      const conflict = ex.find(a => {
        if (a.appointmentTime !== form.appointmentTime || a.status === 'cancelled') return false
        if (a.doctorName && form.doctorName) return a.doctorName === form.doctorName
        return true
      })
      if (conflict) {
        setToast({ message: `${form.appointmentTime} is already booked.`, type: 'error' })
        setBookedSlots(ex.filter(a => a.status !== 'cancelled' && (!a.doctorName || !form.doctorName || a.doctorName === form.doctorName)).map(a => a.appointmentTime))
        submittingRef.current = false
        return
      }
    }
    setLoading(true)
    try {
      // Detect session from slot time — works for morning, evening, and walk-in
      const now = new Date()
      const currentMins = now.getHours() * 60 + now.getMinutes()
      const slotSession = MORNING_SLOTS.includes(form.appointmentTime)
        ? 'morning'
        : EVENING_SLOTS.includes(form.appointmentTime)
          ? 'evening'
          : currentMins < 14 * 60 ? 'morning' : 'evening'

      // Step 1: Create the appointment with a temporary token
      const tokenSystem = profile?.tokenSystem || 'fixed'
      const tokenNumber = await getNextToken(centreId, form.date, slotSession, form.appointmentTime, tokenSystem, slotSession === 'morning' ? MORNING_SLOTS : EVENING_SLOTS)
      const apptId = await createAppointment(centreId, { ...form, tokenNumber, session: slotSession, status: 'scheduled' })

      // Step 2: Re-tokenize ALL appointments in this session by slot time position
      // This fixes any existing appointments whose tokens may now be wrong
      // (e.g. someone booked 11:10 first → token 1, now someone books 11:00 → they get token 1,
      //  but 11:10 still shows token 1. Re-tokenize fixes 11:10 → token 2)
      try {
        const allAppts = await getAppointments(centreId, form.date)
        const sessionAppts = allAppts.filter(a => {
          if (a.status === 'cancelled') return false
          const sess = a.session || (a.appointmentTime && a.appointmentTime !== 'Walk-in (no slot)'
            ? ((() => { const p = a.appointmentTime.trim().split(' '); let h = Number(p[0].split(':')[0]); if (p[1]==='PM'&&h!==12) h+=12; if (p[1]==='AM'&&h===12) h=0; return h < 14 ? 'morning' : 'evening' })())
            : slotSession)
          return sess === slotSession
        })

        // Sort by slot time
        const toMins = t => {
          if (!t || t === 'Walk-in (no slot)') return 9999
          const p = t.trim().split(' '); let h = Number(p[0].split(':')[0]); const m = Number(p[0].split(':')[1]||0)
          if (p[1]==='PM'&&h!==12) h+=12; if (p[1]==='AM'&&h===12) h=0
          return h * 60 + m
        }

        // Get unique slot times sorted chronologically
        const slottedAppts = sessionAppts.filter(a => a.appointmentTime && a.appointmentTime !== 'Walk-in (no slot)')
        const walkinAppts  = sessionAppts.filter(a => !a.appointmentTime || a.appointmentTime === 'Walk-in (no slot)')

        let uniqueSlots
        const updates = []
        if (tokenSystem === 'fixed') {
          // Fixed mode: use full slot list as source of truth for position
          const fullSlots = (slotSession === 'morning' ? MORNING_SLOTS : EVENING_SLOTS).filter(s => s !== 'Walk-in (no slot)')
          // Only include slots that actually have bookings
          const bookedSlotSet = new Set(slottedAppts.map(a => a.appointmentTime))
          // Token = position in FULL slot list, not just booked ones
          uniqueSlots = fullSlots // use full list for position lookup
          slottedAppts.forEach(a => {
            const correctToken = fullSlots.indexOf(a.appointmentTime) + 1
            if (correctToken > 0 && a.tokenNumber !== correctToken) updates.push({ id: a.id, tokenNumber: correctToken })
          })
        } else {
          // Relative mode: only booked slots count
          uniqueSlots = [...new Set(slottedAppts.map(a => a.appointmentTime))].sort((a,b) => toMins(a) - toMins(b))
          slottedAppts.forEach(a => {
            const correctToken = uniqueSlots.indexOf(a.appointmentTime) + 1
            if (a.tokenNumber !== correctToken) updates.push({ id: a.id, tokenNumber: correctToken })
          })
        }

        const walkinOffset = tokenSystem === 'fixed'
          ? (slotSession === 'morning' ? MORNING_SLOTS : EVENING_SLOTS).filter(s => s !== 'Walk-in (no slot)').length
          : uniqueSlots.length
        walkinAppts.forEach((a, i) => {
          const correctToken = walkinOffset + i + 1
          if (a.tokenNumber !== correctToken) updates.push({ id: a.id, tokenNumber: correctToken })
        })

        if (updates.length > 0) {
          await Promise.all(updates.map(u => updateAppointment(centreId, u.id, { tokenNumber: u.tokenNumber })))
        }

        // Get the final token for this new appointment
        const allAppts2 = await getAppointments(centreId, form.date)
        const thisAppt  = allAppts2.find(a => a.id === apptId)
        const finalToken = thisAppt?.tokenNumber || tokenNumber

        logActivity(centreId, { action: 'appt_created', label: 'Appointment Created', detail: `${form.patientName} · ${form.appointmentTime || 'Walk-in'} · Token #${finalToken}`, by: user?.email || '' })
        await upsertClinicPatient(centreId, { name: form.patientName, phone: form.phone, age: form.age, dob: form.dob, gender: form.gender })
        if (profile?.whatsappCampaigns?.length) {
          sendCampaign(profile.whatsappCampaigns, 'appt_confirm', form.phone,
            [form.patientName, profile?.ownerName || 'Doctor', form.date, form.appointmentTime],
            null, { centreId: centreId, patientName: form.patientName, apptId })
        }
        setToast({ message: `Token #${finalToken} booked!`, type: 'success' })
        setTimeout(() => navigate(`/clinic/appointments/${apptId}`), 1200)
      } catch (reTokenErr) {
        console.error('Re-tokenize failed:', reTokenErr)
        // Still navigate even if re-tokenize fails
        logActivity(centreId, { action: 'appt_created', label: 'Appointment Created', detail: `${form.patientName} · ${form.appointmentTime || 'Walk-in'} · Token #${tokenNumber}`, by: user?.email || '' })
        await upsertClinicPatient(centreId, { name: form.patientName, phone: form.phone, age: form.age, dob: form.dob, gender: form.gender })
        setToast({ message: `Token #${tokenNumber} booked!`, type: 'success' })
        setTimeout(() => navigate(`/clinic/appointments/${apptId}`), 1200)
      }
    } catch (err) {
      setToast({ message: 'Booking failed. Try again.', type: 'error' })
    }
    setLoading(false)
    submittingRef.current = false
  }

  const doctors = profile?.doctors || []
  // Find selected doctor object (if any)
  const selDocObj = doctors.find(d => d.name === form.doctorName) || null
  // Use selected doctor's timing, fall back to profile (clinic) defaults
  const docMorningStart = selDocObj?.morningStart || profile?.morningStart || '09:00'
  const docMorningEnd   = selDocObj?.morningEnd   || profile?.morningEnd   || '13:00'
  const docEveningStart = selDocObj?.eveningStart || profile?.eveningStart || '16:00'
  const docEveningEnd   = selDocObj?.eveningEnd   || profile?.eveningEnd   || '20:00'
  const docDuration     = selDocObj?.slotDuration || profile?.slotDuration || '30'
  const MORNING_SLOTS = generateSlots(docMorningStart, docMorningEnd, docDuration)
  const EVENING_SLOTS = generateSlots(docEveningStart, docEveningEnd, docDuration)
  const TIME_SLOTS = [...MORNING_SLOTS, ...EVENING_SLOTS]

  return (
    <Layout title="Book Appointment">
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 320px', gap: 20, maxWidth: 860 }}>
          <Card>
            <CardHeader title="Patient Details" sub="Enter phone number — returning patients auto-fill" />
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Phone */}
              <div style={{ position: 'relative' }}>
                <label style={lStyle}>Mobile Number *</label>
                <div style={{ position: 'relative' }}>
                  <input type="tel" value={form.phone} onChange={handlePhoneChange}
                    placeholder="e.g. 9876543210" required maxLength={10}
                    style={{ ...iStyle, paddingRight: searching ? 40 : 14 }} />
                  {searching && <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: 'var(--teal)' }}>🔍</span>}
                </div>
                {searchResults.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', overflow: 'hidden', marginTop: 4 }}>
                    {searchResults.map(p => (
                      <div key={p.id} onClick={() => fillPatient(p)}
                        style={{ padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--teal-light)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--navy)' }}>{p.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--teal)', marginTop: 2 }}>{p.age ? `${p.age}y` : ''} {p.gender ? `· ${p.gender}` : ''} · Tap to fill ↩</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Duplicate appointment warning ── */}
              {dupAppt && !dupChoice && (
                <div style={{ background: '#FFFBEB', border: '1.5px solid #F59E0B', borderRadius: 12, padding: '14px 16px' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#92400E', marginBottom: 4 }}>
                    ⚠️ {dupAppt.patientName} already has an appointment today
                  </div>
                  <div style={{ fontSize: 12, color: '#92400E', marginBottom: 12, lineHeight: 1.6 }}>
                    {dupAppt.appointmentTime !== 'Walk-in (no slot)' ? `🕐 ${dupAppt.appointmentTime}` : '🚶 Walk-in'} · Token #{dupAppt.tokenNumber} · Status: <strong style={{ textTransform: 'capitalize' }}>{dupAppt.status}</strong>
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#92400E', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>What would you like to do?</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <button type="button" onClick={() => { setDupChoice('relative'); setForm(f => ({ ...f, patientName: '', age: '', gender: '' })) }} style={{ padding: '10px 14px', borderRadius: 10, border: '1.5px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', textAlign: 'left' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>👨‍👩‍👧 Book for a relative / friend</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Same phone, different name — new patient entry</div>
                    </button>
                    <button type="button" onClick={() => setDupChoice('same')} style={{ padding: '10px 14px', borderRadius: 10, border: '1.5px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', textAlign: 'left' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>📅 Book anyway (different slot)</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Continue booking — existing appointment stays</div>
                    </button>
                    <button type="button" onClick={handleReschedule} disabled={rescheduling} style={{ padding: '10px 14px', borderRadius: 10, border: '1.5px solid #0B9E8A', background: 'var(--teal-light)', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', textAlign: 'left', opacity: rescheduling ? 0.6 : 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--teal)' }}>{rescheduling ? '⏳ Rescheduling…' : '🔄 Reschedule'}</div>
                      <div style={{ fontSize: 11, color: 'var(--teal)', marginTop: 2 }}>Frees the {dupAppt.appointmentTime !== 'Walk-in (no slot)' ? dupAppt.appointmentTime : 'walk-in'} slot — pick a new time below</div>
                    </button>
                  </div>
                </div>
              )}

              {/* ── After reschedule: inline slot picker ── */}
              {dupChoice === 'reschedule' && (
                <div style={{ background: '#E6F7F5', border: '1.5px solid var(--teal)', borderRadius: 12, padding: '14px 16px' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--teal)', marginBottom: 2 }}>
                    ✓ Previous slot released — pick a new time
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--teal)', marginBottom: 12 }}>Select date and slot below, then confirm booking</div>

                  {/* Inline date picker */}
                  <div style={{ marginBottom: 10 }}>
                    <label style={{ fontSize: 11, color: 'var(--slate)', fontWeight: 600, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4 }}>Date</label>
                    <input type="date" value={form.date} min={today}
                      onChange={e => setForm(f => ({ ...f, date: e.target.value, appointmentTime: '' }))}
                      style={{ ...iStyle, background: '#fff' }} />
                  </div>

                  {/* Inline slot grid */}
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--slate)', fontWeight: 600, display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                      Time Slot {form.appointmentTime && <span style={{ color: 'var(--teal)', fontWeight: 700 }}>→ {form.appointmentTime} ✓</span>}
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5, maxHeight: 160, overflowY: 'auto' }}>
                      {TIME_SLOTS.map(slot => {
                        const isBooked   = slot !== 'Walk-in (no slot)' && bookedSlots.includes(slot)
                        const isSel      = form.appointmentTime === slot
                        const isDisabled = isBooked
                        return (
                          <button key={slot} type="button"
                            onClick={() => !isDisabled && setForm(f => ({ ...f, appointmentTime: slot }))}
                            disabled={isDisabled}
                            style={{ padding: '7px 4px', borderRadius: 7, border: '1.5px solid', borderColor: isSel ? 'var(--teal)' : 'var(--border)', background: isSel ? 'var(--teal)' : isDisabled ? 'var(--bg)' : '#fff', color: isSel ? '#fff' : isDisabled ? 'var(--muted)' : 'var(--slate)', fontSize: 11, cursor: isDisabled ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif', fontWeight: isSel ? 700 : 400, opacity: isDisabled ? 0.4 : 1 }}>
                            {slot === 'Walk-in (no slot)' ? 'Walk-in' : slot}
                            {isBooked && <span style={{ display: 'block', fontSize: 8, color: 'var(--red)', marginTop: 1 }}>Booked</span>}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {form.appointmentTime && (
                    <div style={{ marginTop: 10, padding: '8px 12px', background: 'var(--teal)', borderRadius: 8, fontSize: 12, color: '#fff', fontWeight: 600, textAlign: 'center' }}>
                      New slot: {form.date} · {form.appointmentTime} — scroll down and confirm booking ↓
                    </div>
                  )}
                </div>
              )}

              {dupChoice === 'relative' && (
                <div style={{ background: '#F0FDF4', border: '1.5px solid #6EE7B7', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#065F46' }}>
                  ✓ Booking for a relative/friend on the same number. Enter their details below.
                </div>
              )}

              {/* Name */}
              <div>
                <label style={lStyle}>Full Name *</label>
                <input value={form.patientName} onChange={setF('patientName')}
                  placeholder="e.g. Rahul Sharma" required style={iStyle} />
              </div>

              {/* DOB + Gender */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={lStyle}>Date of Birth <span style={{ color: 'var(--muted)', fontWeight: 400, textTransform: 'none' }}>(age auto-calculated)</span></label>
                  <DobPicker
                    value={form.dob}
                    onChange={(dob, age) => setForm(f => ({ ...f, dob, age: age || f.age }))}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={lStyle}>Age (years) <span style={{ color: 'var(--muted)', fontWeight: 400, textTransform: 'none' }}>override if DOB unknown</span></label>
                    <input type="text" inputMode="numeric" value={form.age} onChange={setF('age')}
                      placeholder="e.g. 32" min="0" max="150" style={iStyle} />
                  </div>
                  <div>
                    <label style={lStyle}>Gender</label>
                    <select value={form.gender} onChange={setF('gender')} style={iStyle}>
                      <option value="">Select gender</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Chief Complaint */}
              <div>
                <label style={lStyle}>Chief Complaint</label>
                <input value={form.chiefComplaint} onChange={setF('chiefComplaint')}
                  placeholder="e.g. Fever and cough since 3 days" style={iStyle} />
              </div>

              {/* Ref Doctor */}
              <div>
                <label style={lStyle}>Referred By (optional)</label>
                <input value={form.refDoctor} onChange={setF('refDoctor')}
                  placeholder="e.g. Dr. Mehta" style={iStyle} />
              </div>
            </div>
          </Card>

          {/* Right: Scheduling */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Card>
              <CardHeader title="Schedule" />
              <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={lStyle}>Date</label>
                  <input type="date" value={form.date} onChange={setF('date')} min={today} style={iStyle} />
                </div>
                {doctors.length > 0 && (
                  <div>
                    <label style={lStyle}>Doctor</label>
                    <select value={form.doctorName} onChange={e => setForm(f => ({ ...f, doctorName: e.target.value, appointmentTime: '' }))} style={iStyle}>
                      <option value="">-- Select Doctor --</option>
                      {doctors.map(d => <option key={d.name} value={d.name}>{d.name}{d.speciality ? ` · ${d.speciality}` : ''}</option>)}
                    </select>
                  </div>
                )}
                <div>
                  <label style={lStyle}>Time Slot <span style={{ color: '#DC2626' }}>*</span></label>
                  {doctors.length > 0 && !form.doctorName ? (
                    <div style={{ fontSize: 12, color: '#D97706', background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 8, padding: '10px 12px' }}>
                      ⚠️ Please select a doctor first to see available slots
                    </div>
                  ) : !form.appointmentTime ? (
                    <div style={{ fontSize: 11, color: '#D97706', background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 7, padding: '6px 10px', marginBottom: 7 }}>
                      ⚠️ Select a slot to enable booking
                    </div>
                  ) : null}
                  {(doctors.length === 0 || form.doctorName) && (
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(3, 1fr)' : '1fr 1fr', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
                    {TIME_SLOTS.map(slot => {
                      const isBooked = slot !== 'Walk-in (no slot)' && bookedSlots.includes(slot)
                      const isSel    = form.appointmentTime === slot && slot !== ''
                      // Disable past slots only for today
                      let isPast = false
                      if (slot !== 'Walk-in (no slot)' && form.date === today) {
                        const parts = slot.split(' ')
                        const hm = parts[0].split(':')
                        let h = Number(hm[0])
                        const min = Number(hm[1])
                        if (parts[1] === 'PM' && h !== 12) h += 12
                        if (parts[1] === 'AM' && h === 12) h = 0
                        const slotMins = h * 60 + min
                        const now = new Date()
                        isPast = slotMins < now.getHours() * 60 + now.getMinutes()
                      }
                      const isDisabled = isBooked || isPast
                      return (
                        <button key={slot} type="button"
                          onClick={() => !isDisabled && setForm(f => ({ ...f, appointmentTime: slot }))}
                          disabled={isDisabled}
                          style={{ padding: isMobile ? '10px 4px' : '7px 4px', borderRadius: 8, border: '1.5px solid', borderColor: isSel ? 'var(--teal)' : 'var(--border)', background: isSel ? 'var(--teal-light)' : isDisabled ? 'var(--bg)' : 'none', color: isSel ? 'var(--teal)' : isDisabled ? 'var(--muted)' : 'var(--slate)', fontSize: isMobile ? 12 : 11, cursor: isDisabled ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif', fontWeight: isSel ? 600 : 400, opacity: isDisabled ? 0.4 : 1 }}>
                          {slot}
                          {isBooked && !isPast && <span style={{ display: 'block', fontSize: 9, color: 'var(--red)', marginTop: 1 }}>Booked</span>}
                          {isPast && <span style={{ display: 'block', fontSize: 9, color: 'var(--muted)', marginTop: 1 }}>Past</span>}
                        </button>
                      )
                    })}
                  </div>
                  )}
                </div>
                <div>
                  <label style={lStyle}>Visit Type</label>
                  <select value={form.visitType} onChange={setF('visitType')} style={iStyle}>
                    {['New Visit','Follow-up','Emergency','Review'].map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={lStyle}>Fee (₹)</label>
                    <input type="text" inputMode="numeric" value={form.consultationFee} onChange={e => { const v = e.target.value.replace(/[^0-9]/g, ''); setForm(f => ({ ...f, consultationFee: v })) }} placeholder="e.g. 300" style={iStyle} />
                    {form._feeHint && form.consultationFee && (
                      <div style={{ fontSize: 11, marginTop: 4, color: form._feeHint === 'repeat' ? '#166534' : '#1D4ED8' }}>
                        {form._feeHint === 'repeat' && '🔄 Repeat visit fee auto-applied'}
                        {form._feeHint === 'first'  && '✨ First visit fee auto-applied'}
                        {form._feeHint === 'reset'  && '🔁 First visit fee re-applied (gap exceeded)'}
                        {' '}· <button type="button" onClick={() => setForm(f => ({ ...f, consultationFee: '', _feeHint: null }))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 11, textDecoration: 'underline', fontFamily: 'DM Sans, sans-serif' }}>clear</button>
                      </div>
                    )}
                  </div>
                  <div>
                    <label style={lStyle}>Payment</label>
                    <select value={form.paymentStatus} onChange={setF('paymentStatus')} style={iStyle}>
                      <option value="pending">Pending</option>
                      <option value="paid">Paid</option>
                    </select>
                  </div>
                </div>
              </div>
            </Card>

            <Card>
              <div style={{ padding: '16px 20px' }}>
                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)', marginBottom: 10 }}>Summary</div>
                {form.patientName
                  ? <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)' }}>{form.patientName}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{form.phone}{form.age ? ` · ${form.age}y` : ''}</div>
                    </div>
                  : <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 10 }}>Enter patient details →</div>
                }
                <div style={{ fontSize: 13, color: 'var(--slate)', marginBottom: 4 }}>📅 {form.date}</div>
                <div style={{ fontSize: 13, color: 'var(--slate)', marginBottom: 4 }}>🕐 {form.appointmentTime}</div>
                <div style={{ fontSize: 13, color: 'var(--slate)', marginBottom: 16 }}>🏥 {form.visitType}</div>
                <Btn type="submit" disabled={loading || !form.patientName || !form.phone || !form.appointmentTime || (doctors.length > 0 && !form.doctorName)} style={{ width: '100%', justifyContent: 'center' }}>
                  {loading ? 'Booking…' : (doctors.length > 0 && !form.doctorName) ? 'Select a doctor first' : form.appointmentTime ? '✓ Confirm Booking' : 'Select a time slot to book'}
                </Btn>
                <Btn variant="ghost" onClick={() => navigate(-1)} style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}>Cancel</Btn>
              </div>
            </Card>
          </div>
        </div>
      </form>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </Layout>
  )
}
