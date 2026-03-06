// src/pages/clinic/NewAppointment.jsx
import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../utils/AuthContext'
import Layout from '../../components/Layout'
import { Card, CardHeader, Input, Select, Btn, Toast } from '../../components/UI'
import { createAppointment, getNextToken, getAppointments } from '../../firebase/clinicDb'
import { sendCampaign } from '../../firebase/whatsapp'
import { searchPatients } from '../../firebase/db'
import { format } from 'date-fns'

function generateSlots(startTime, endTime, intervalMinutes) {
  const slots = []
  const [startH, startM] = (startTime || '09:00').split(':').map(Number)
  const [endH, endM]     = (endTime   || '20:00').split(':').map(Number)
  const interval = Number(intervalMinutes) || 30
  let current = startH * 60 + startM
  const end   = endH   * 60 + endM
  while (current < end) {
    const h = Math.floor(current / 60)
    const m = current % 60
    const ampm = h < 12 ? 'AM' : 'PM'
    const h12  = h === 0 ? 12 : h > 12 ? h - 12 : h
    slots.push(`${String(h12).padStart(2,'0')}:${String(m).padStart(2,'0')} ${ampm}`)
    current += interval
  }
  slots.push('Walk-in (no slot)')
  return slots
}

export default function NewAppointment() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading]         = useState(false)
  const [toast, setToast]             = useState(null)
  const [searchResults, setSearchResults] = useState([])
  const [bookedSlots, setBookedSlots] = useState([])

  const today = format(new Date(), 'yyyy-MM-dd')

  const [form, setForm] = useState({
    patientName: '', phone: '', age: '', gender: '',
    visitType: 'New Visit', appointmentTime: 'Walk-in (no slot)',
    date: today, chiefComplaint: '', refDoctor: '',
    consultationFee: '', paymentStatus: 'pending'
  })

  useEffect(() => {
    async function loadBooked() {
      if (!user) return
      const existing = await getAppointments(user.uid, form.date)
      setBookedSlots(existing.filter(a => a.status !== 'cancelled').map(a => a.appointmentTime))
    }
    loadBooked()
  }, [form.date, user])

  const setF = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  function handleDateChange(e) {
    const val = e.target.value
    if (val < today) {
      setToast({ message: 'Cannot book appointments for past dates.', type: 'error' })
      return
    }
    setForm(f => ({ ...f, date: val }))
  }

  async function handlePhoneSearch(phone) {
    setForm(f => ({ ...f, phone }))
    if (phone.length === 10) {
      const results = await searchPatients(user.uid, phone)
      setSearchResults(results)
    } else setSearchResults([])
  }

  function fillPatient(p) {
    setForm(f => ({ ...f, patientName: p.name, phone: p.phone, age: p.age, gender: p.gender }))
    setSearchResults([])
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.patientName || !form.phone) return
    if (form.date < today) {
      setToast({ message: 'Cannot book appointments for past dates.', type: 'error' })
      return
    }
    if (form.appointmentTime !== 'Walk-in (no slot)') {
      const existing = await getAppointments(user.uid, form.date)
      const conflict = existing.find(a => a.appointmentTime === form.appointmentTime && a.status !== 'cancelled')
      if (conflict) {
        setToast({ message: `${form.appointmentTime} is already booked. Please choose another slot.`, type: 'error' })
        setBookedSlots(existing.filter(a => a.status !== 'cancelled').map(a => a.appointmentTime))
        return
      }
    }
    setLoading(true)
    try {
      const tokenNumber = await getNextToken(user.uid, form.date)
      await createAppointment(user.uid, { ...form, tokenNumber, status: 'scheduled' })

      // Send WhatsApp confirmation
      // clinic_appointment_confirmed → purpose 'appt_confirm' → 4 params
      if (profile?.whatsappCampaigns?.length) {
        sendCampaign(
          profile.whatsappCampaigns, 'appt_confirm', form.phone,
          [form.patientName, profile?.ownerName || 'Doctor', form.date, form.appointmentTime]
        )
      }

      setToast({ message: `✓ Token #${tokenNumber} booked! WhatsApp confirmation sent.`, type: 'success' })
      // Navigate to list — NOT detail page (detail page was causing loading hang)
      setTimeout(() => navigate('/clinic/appointments'), 1200)
    } catch (err) {
      console.error('Booking error:', err)
      setToast({ message: 'Booking failed. Try again.', type: 'error' })
    }
    setLoading(false)
  }

  const visitTypeOpts = ['New Visit', 'Follow-up', 'Emergency', 'Review']
  const genderOpts = [
    { value:'', label:'Gender' }, { value:'Male', label:'Male' },
    { value:'Female', label:'Female' }, { value:'Other', label:'Other' }
  ]
  const TIME_SLOTS = generateSlots(profile?.clinicStart, profile?.clinicEnd, profile?.slotDuration)

  return (
    <Layout title="Book Appointment">
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20, maxWidth: 860 }}>

          <Card>
            <CardHeader title="Patient Details" sub="Search by phone to auto-fill returning patients" />
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

              <div style={{ position: 'relative' }}>
                <Input label="Mobile Number *" type="tel" value={form.phone}
                  onChange={e => handlePhoneSearch(e.target.value)} placeholder="10-digit number" required />
                {searchResults.length > 0 && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    borderRadius: 10, boxShadow: 'var(--shadow-lg)', overflow: 'hidden', marginTop: 4
                  }}>
                    {searchResults.map(p => (
                      <div key={p.id} onClick={() => fillPatient(p)} style={{
                        padding: '12px 16px', cursor: 'pointer', fontSize: 13,
                        borderBottom: '1px solid var(--border)'
                      }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--teal-light)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <strong>{p.name}</strong> · {p.age}y · {p.gender}
                        <div style={{ fontSize: 11, color: 'var(--teal)' }}>↩ Returning patient — click to fill</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Input label="Full Name *" value={form.patientName}
                onChange={setF('patientName')} placeholder="Patient full name" required />

              <div style={{ display: 'flex', gap: 12 }}>
                <Input label="Age" type="number" value={form.age} onChange={setF('age')} placeholder="Years" />
                <Select label="Gender" value={form.gender} onChange={setF('gender')} options={genderOpts} />
              </div>

              <Input label="Chief Complaint (optional)" value={form.chiefComplaint}
                onChange={setF('chiefComplaint')} placeholder="e.g. Fever and cough since 3 days" />
            </div>
          </Card>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Card>
              <CardHeader title="Schedule" />
              <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

                {/* min={today} blocks past date selection in browser */}
                <Input label="Date" type="date" value={form.date} min={today} onChange={handleDateChange} />

                <div>
                  <label style={{ fontSize: 11, color: 'var(--slate)', fontWeight: 500, display: 'block', marginBottom: 5 }}>Time Slot</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
                    {TIME_SLOTS.map(slot => {
                      const isBooked   = slot !== 'Walk-in (no slot)' && bookedSlots.includes(slot)
                      const isSelected = form.appointmentTime === slot
                      return (
                        <button key={slot} type="button"
                          onClick={() => !isBooked && setForm(f => ({ ...f, appointmentTime: slot }))}
                          disabled={isBooked}
                          style={{
                            padding: '7px 4px', borderRadius: 8, border: '1.5px solid',
                            borderColor: isSelected ? 'var(--teal)' : 'var(--border)',
                            background: isSelected ? 'var(--teal-light)' : isBooked ? 'var(--bg)' : 'none',
                            color: isSelected ? 'var(--teal)' : isBooked ? 'var(--muted)' : 'var(--slate)',
                            fontSize: 11, cursor: isBooked ? 'not-allowed' : 'pointer',
                            fontFamily: 'DM Sans, sans-serif', fontWeight: isSelected ? 600 : 400,
                            opacity: isBooked ? 0.5 : 1, transition: 'all 0.15s'
                          }}>
                          {slot}
                          {isBooked && <span style={{ display: 'block', fontSize: 9, color: 'var(--red)', marginTop: 1 }}>Booked</span>}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <Select label="Visit Type" value={form.visitType} onChange={setF('visitType')} options={visitTypeOpts} />

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
                  <Input label="Consultation Fee (₹)" type="number" value={form.consultationFee}
                    onChange={setF('consultationFee')} placeholder="e.g. 300" />
                  <Select label="Payment" value={form.paymentStatus} onChange={setF('paymentStatus')}
                    options={[{ value: 'pending', label: 'Pending' }, { value: 'paid', label: 'Paid' }]} />
                </div>
              </div>
            </Card>

            <Card>
              <div style={{ padding: '16px 20px' }}>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>APPOINTMENT SUMMARY</div>
                {form.patientName && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--navy)' }}>{form.patientName}</div>
                    <div style={{ fontSize: 13, color: 'var(--muted)' }}>{form.phone}</div>
                  </div>
                )}
                <div style={{ fontSize: 13, color: 'var(--slate)', marginBottom: 4 }}>📅 {form.date} · {form.appointmentTime}</div>
                <div style={{ fontSize: 13, color: 'var(--slate)', marginBottom: 16 }}>🏥 {form.visitType}</div>
                {profile?.whatsappCampaigns?.length > 0 && (
                  <div style={{ background: 'var(--teal-light)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: 'var(--teal)', marginBottom: 12 }}>
                    💬 WhatsApp confirmation will be sent to {form.phone || 'patient'}
                  </div>
                )}
                <Btn type="submit" disabled={loading || !form.patientName || !form.phone}
                  style={{ width: '100%', justifyContent: 'center' }}>
                  {loading ? 'Booking…' : '✓ Confirm Booking'}
                </Btn>
                <Btn variant="ghost" onClick={() => navigate(-1)}
                  style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}>
                  Cancel
                </Btn>
              </div>
            </Card>
          </div>
        </div>
      </form>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </Layout>
  )
}