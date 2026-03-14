// src/pages/clinic/NewAppointment.jsx
import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../utils/AuthContext'
import Layout from '../../components/Layout'
import { Card, CardHeader, Btn, Toast } from '../../components/UI'
import { createAppointment, getNextToken, getAppointments, upsertClinicPatient , logActivity } from '../../firebase/clinicDb'
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
  const [loading, setLoading]             = useState(false)
  const [toast, setToast]                 = useState(null)
  const [searchResults, setSearchResults] = useState([])
  const [bookedSlots, setBookedSlots]     = useState([])
  const [searching, setSearching]         = useState(false)
  const submittingRef                     = useRef(false)
  const today = format(new Date(), 'yyyy-MM-dd')

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
      if (results.length === 1) { fillPatient(results[0]) }
      else setSearchResults(results)
    } catch (e) { console.error(e) }
    setSearching(false)
  }

  function handlePhoneChange(e) {
    const phone = e.target.value.replace(/\D/g, '').slice(0, 10)
    setForm(f => ({ ...f, phone }))
    setSearchResults([])
    if (phone.length === 10) doSearch(phone)
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
      const tokenNumber = await getNextToken(centreId, form.date, slotSession)
      const apptId = await createAppointment(centreId, { ...form, tokenNumber, session: slotSession, status: 'scheduled' })
      logActivity(centreId, { action: 'appt_created', label: 'Appointment Created', detail: `${form.patientName} · ${form.appointmentTime || 'Walk-in'} · Token #${tokenNumber}`, by: user?.email || '' })
      await upsertClinicPatient(centreId, { name: form.patientName, phone: form.phone, age: form.age, dob: form.dob, gender: form.gender })
      if (profile?.whatsappCampaigns?.length) {
        sendCampaign(profile.whatsappCampaigns, 'appt_confirm', form.phone,
          [form.patientName, profile?.ownerName || 'Doctor', form.date, form.appointmentTime],
          null, { centreId: centreId, patientName: form.patientName, apptId })
      }
      setToast({ message: `Token #${tokenNumber} booked!`, type: 'success' })
      setTimeout(() => navigate(`/clinic/appointments/${apptId}`), 1200)
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20, maxWidth: 860 }}>
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
                  {!form.appointmentTime && (
                    <div style={{ fontSize: 11, color: '#D97706', background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 7, padding: '6px 10px', marginBottom: 7 }}>
                      ⚠️ Select a slot to enable booking
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
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
                          style={{ padding: '7px 4px', borderRadius: 8, border: '1.5px solid', borderColor: isSel ? 'var(--teal)' : 'var(--border)', background: isSel ? 'var(--teal-light)' : isDisabled ? 'var(--bg)' : 'none', color: isSel ? 'var(--teal)' : isDisabled ? 'var(--muted)' : 'var(--slate)', fontSize: 11, cursor: isDisabled ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif', fontWeight: isSel ? 600 : 400, opacity: isDisabled ? 0.4 : 1 }}>
                          {slot}
                          {isBooked && !isPast && <span style={{ display: 'block', fontSize: 9, color: 'var(--red)', marginTop: 1 }}>Booked</span>}
                          {isPast && <span style={{ display: 'block', fontSize: 9, color: 'var(--muted)', marginTop: 1 }}>Past</span>}
                        </button>
                      )
                    })}
                  </div>
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
                    <input type="text" inputMode="numeric" value={form.consultationFee} onChange={e => setForm(f => ({ ...f, consultationFee: e.target.value.replace(/\D/g, '') }))} placeholder="e.g. 300" style={iStyle} />
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
                <Btn type="submit" disabled={loading || !form.patientName || !form.phone || !form.appointmentTime} style={{ width: '100%', justifyContent: 'center' }}>
                  {loading ? 'Booking…' : form.appointmentTime ? '✓ Confirm Booking' : 'Select a time slot to book'}
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
