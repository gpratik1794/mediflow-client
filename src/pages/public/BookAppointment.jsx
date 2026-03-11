// src/pages/public/BookAppointment.jsx
import React, { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import {
  doc, getDoc, onSnapshot, collection, query, where, getDocs,
  addDoc, updateDoc, runTransaction, serverTimestamp
} from 'firebase/firestore'
import { db } from '../../firebase/config'
import { sendCampaign } from '../../firebase/whatsapp'

// ── Config ────────────────────────────────────────────────────────────────────
const FALLBACK_NOTIFY_NUMBER = '919876543210' // kept as last-resort default
const AISYNERGY_API_URL = 'https://backend.api-wa.co/campaign/aisynergy/api/v2'

const DAYS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const DAYS_FULL = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeToMinutes(t) {
  if (!t) return 0
  // Handle both '14:30' (24h) and '2:30 PM' (12h AM/PM) formats
  const parts = t.trim().split(' ')
  const [hStr, mStr] = parts[0].split(':')
  let h = parseInt(hStr), m = parseInt(mStr) || 0
  if (parts[1]) {
    // 12h format
    if (parts[1] === 'PM' && h !== 12) h += 12
    if (parts[1] === 'AM' && h === 12) h = 0
  }
  return h * 60 + m
}

// Use local date to avoid UTC offset issues (IST = UTC+5:30)
function toLocalDateStr(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function minutesToTime(m) {
  const h = Math.floor(m / 60)
  const min = m % 60
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(min).padStart(2, '0')} ${ampm}`
}

function generateSlots(startTime, endTime, durationMin) {
  const slots = []
  let cur = timeToMinutes(startTime)
  const end = timeToMinutes(endTime)
  while (cur + durationMin <= end) {
    slots.push(minutesToTime(cur))
    cur += durationMin
  }
  return slots
}

// Send a plain text WA message via AiSynergy (fallback, no template)
async function sendPlainWA(apiKey, to, message) {
  try {
    await fetch(AISYNERGY_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiKey,
        campaignName: 'mediflow_plain_text',
        destination: to.replace(/\D/g, ''),
        userName: 'MEDIFLOW',
        templateParams: [message],
        source: 'mediflow',
        media: {},
        attributes: {},
        paramsFallbackValue: { FirstName: 'Patient' }
      })
    })
  } catch (e) {
    console.warn('Plain WA send failed:', e)
  }
}

// ── Styles ────────────────────────────────────────────────────────────────────
const S = {
  body: { fontFamily: "'DM Sans', sans-serif", background: '#F4F7F9', minHeight: '100vh', color: '#0D2B3E', margin: 0 },
  // topbar
  topbar: { background: '#fff', borderBottom: '1px solid #DDE6EA', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 30, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' },
  clinicBrand: { display: 'flex', alignItems: 'center', gap: 12 },
  clinicAvatar: { width: 42, height: 42, borderRadius: 11, background: 'linear-gradient(135deg,#0B9E8A,#087A6B)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 18, fontWeight: 800 },
  clinicName: { fontSize: 15, fontWeight: 700, color: '#0D2B3E' },
  clinicSub: { fontSize: 11, color: '#8FA3B0', marginTop: 1 },
  mfBadge: { display: 'flex', alignItems: 'center', gap: 6, background: '#E6F7F5', border: '1.5px solid #B2DDD9', borderRadius: 20, padding: '5px 10px 5px 8px' },
  mfIcon: { width: 22, height: 22, borderRadius: 6, background: 'linear-gradient(135deg,#0B9E8A,#087A6B)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: 'white' },
  mfLabel: { display: 'flex', flexDirection: 'column', lineHeight: 1.2 },
  mfPowered: { fontSize: 9, color: '#8FA3B0', fontWeight: 500 },
  mfName: { fontSize: 12, fontWeight: 700, color: '#0B9E8A' },
  // stepper
  stepper: { background: '#fff', borderBottom: '1px solid #DDE6EA', padding: '0 20px', display: 'flex', overflowX: 'auto' },
  stepItem: (active, done) => ({
    flex: 1, minWidth: 58, display: 'flex', flexDirection: 'column', alignItems: 'center',
    padding: '12px 4px', gap: 5, borderBottom: `3px solid ${active || done ? '#0B9E8A' : 'transparent'}`,
    fontSize: 10, fontWeight: 600, color: active || done ? '#0B9E8A' : '#8FA3B0',
    whiteSpace: 'nowrap', transition: 'all .2s',
  }),
  stepDot: (active, done) => ({
    width: 24, height: 24, borderRadius: '50%',
    border: `2px solid ${done ? '#0B9E8A' : active ? '#0B9E8A' : '#DDE6EA'}`,
    background: done ? '#0B9E8A' : active ? '#E6F7F5' : '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 10, fontWeight: 700, color: done ? 'white' : active ? '#0B9E8A' : '#8FA3B0',
  }),
  // wrap
  wrap: { maxWidth: 460, margin: '0 auto', padding: '24px 16px 64px' },
  // card
  card: { background: '#fff', borderRadius: 14, border: '1px solid #DDE6EA', padding: 20, marginBottom: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' },
  cardTitle: { fontSize: 16, fontWeight: 700, color: '#0D2B3E', marginBottom: 4 },
  cardSub: { fontSize: 13, color: '#8FA3B0', marginBottom: 20 },
  // field
  label: { fontSize: 11, fontWeight: 600, color: '#4A5E6D', textTransform: 'uppercase', letterSpacing: 0.4, display: 'block', marginBottom: 6 },
  input: { width: '100%', padding: '11px 14px', borderRadius: 10, border: '1.5px solid #DDE6EA', fontSize: 14, fontFamily: "'DM Sans', sans-serif", color: '#0D2B3E', background: '#fff', outline: 'none', boxSizing: 'border-box' },
  // note
  note: { background: '#E6F7F5', border: '1px solid #B2DDD9', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#087A6B', lineHeight: 1.55, marginBottom: 14 },
  warnNote: { background: '#FFF7ED', border: '1px solid #FDDCBC', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#9A3412', lineHeight: 1.55, marginBottom: 14 },
  // chips
  chip: (on) => ({ padding: '8px 15px', borderRadius: 8, border: `1.5px solid ${on ? '#0B9E8A' : '#DDE6EA'}`, fontSize: 12, fontWeight: 600, color: on ? 'white' : '#4A5E6D', background: on ? '#0B9E8A' : '#fff', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", transition: 'all .15s' }),
  // doctor card
  docCard: (on) => ({ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px', borderRadius: 11, border: `1.5px solid ${on ? '#0B9E8A' : '#DDE6EA'}`, cursor: 'pointer', marginBottom: 9, background: on ? '#E6F7F5' : '#fff', transition: 'all .15s' }),
  docAvatar: { width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg,#0B9E8A,#087A6B)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 800, color: 'white', flexShrink: 0 },
  radio: (on) => ({ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${on ? '#0B9E8A' : '#DDE6EA'}`, background: on ? '#0B9E8A' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }),
  // date strip
  dateChip: (on, disabled) => ({ flexShrink: 0, width: 52, textAlign: 'center', padding: '9px 4px', borderRadius: 11, border: `1.5px solid ${on ? '#0B9E8A' : '#DDE6EA'}`, cursor: disabled ? 'not-allowed' : 'pointer', background: on ? '#0B9E8A' : disabled ? '#F4F7F9' : '#fff', opacity: disabled ? 0.45 : 1, transition: 'all .15s' }),
  // session card
  sessCard: (on) => ({ border: `1.5px solid ${on ? '#0B9E8A' : '#DDE6EA'}`, borderRadius: 11, padding: '14px 10px', textAlign: 'center', cursor: 'pointer', background: on ? '#E6F7F5' : '#fff', transition: 'all .15s', flex: 1 }),
  // slot
  slotBtn: (on, bk) => ({ padding: '10px 4px', borderRadius: 9, border: `1.5px solid ${on ? '#0B9E8A' : '#DDE6EA'}`, textAlign: 'center', fontSize: 12, fontWeight: 600, color: on ? 'white' : bk ? '#DDE6EA' : '#4A5E6D', background: on ? '#0B9E8A' : bk ? '#F4F7F9' : '#fff', cursor: bk ? 'not-allowed' : 'pointer', textDecoration: bk ? 'line-through' : 'none', fontWeight: bk ? 400 : 600 }),
  // summary
  sumBox: { background: '#E6F7F5', border: '1.5px solid #0B9E8A', borderRadius: 13, overflow: 'hidden', marginBottom: 16 },
  sumRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 16px', borderBottom: '1px solid #B2DDD9' },
  sumKey: { fontSize: 10, fontWeight: 700, color: '#087A6B', textTransform: 'uppercase', letterSpacing: 0.4 },
  sumVal: { fontSize: 13, fontWeight: 700, color: '#0D2B3E' },
  // buttons
  btnPrimary: { width: '100%', padding: 14, borderRadius: 11, border: 'none', fontSize: 14, fontWeight: 700, fontFamily: "'DM Sans',sans-serif", cursor: 'pointer', background: '#0B9E8A', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 10, transition: 'background .15s' },
  btnGhost: { width: '100%', padding: 14, borderRadius: 11, border: '1.5px solid #DDE6EA', fontSize: 14, fontWeight: 600, fontFamily: "'DM Sans',sans-serif", cursor: 'pointer', background: '#fff', color: '#4A5E6D', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  // footer
  footer: { background: '#0D2B3E', color: 'rgba(255,255,255,0.45)', textAlign: 'center', padding: '20px 16px', fontSize: 11 },
  footerMf: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 8 },
  footerIcon: { width: 26, height: 26, borderRadius: 7, background: 'linear-gradient(135deg,#0B9E8A,#087A6B)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: 'white' },
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Stepper({ step }) {
  const labels = ['Details', 'Doctor', 'Date', 'Slot', 'Confirm']
  return (
    <div style={S.stepper}>
      {labels.map((lbl, i) => {
        const n = i + 1
        const active = n === step
        const done = n < step
        return (
          <div key={lbl} style={S.stepItem(active, done)}>
            <div style={S.stepDot(active, done)}>{done ? '✓' : n}</div>
            {lbl}
          </div>
        )
      })}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function BookAppointment() {
  const { centreId } = useParams()

  // Centre data
  const [centre, setCentre]     = useState(null)
  const [loading, setLoading]   = useState(true)
  const [notFound, setNotFound] = useState(false)

  // Form state
  const [step, setStep]         = useState(1)
  const [name, setName]         = useState('')
  const [phone, setPhone]       = useState('')
  const [age, setAge]           = useState('')
  const [dob, setDob]           = useState('')
  const [gender, setGender]     = useState('')

  // Doctor
  const [doctors, setDoctors]   = useState([])
  const [selDoc, setSelDoc]     = useState(null)

  // Date
  const [selDate, setSelDate]   = useState(null)
  const [selSession, setSelSession] = useState('morning')

  // Slots
  const [bookedSlots, setBookedSlots] = useState([])
  const [dateBookedCounts, setDateBookedCounts] = useState({}) // { 'YYYY-MM-DD': { morning: N, evening: N } }
  const [selSlot, setSelSlot]   = useState(null)
  const [slotsLoading, setSlotsLoading] = useState(false)

  // Submission
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone]         = useState(false)
  const [apptId, setApptId]     = useState(null)
  const submittingRef           = useRef(false) // instant guard against double-clicks

  // ── Load centre profile ──
  // refs for cleanup
  const unsubProfileRef = useRef(null)
  const unsubBookedRef  = useRef(null)
  const unsubDateRef    = useRef(null)
  const clientDataRef   = useRef(null) // hold client data for merging with live profile

  useEffect(() => {
    if (!centreId) return
    async function init() {
      try {
        // Client info — load once (doesn't change during booking)
        const clientSnap = await getDoc(doc(db, 'clients', centreId))
        if (!clientSnap.exists()) { setNotFound(true); setLoading(false); return }
        clientDataRef.current = clientSnap.data()

        // Profile — onSnapshot so slot overrides / unavailable dates update live
        if (unsubProfileRef.current) unsubProfileRef.current()
        unsubProfileRef.current = onSnapshot(
          doc(db, 'centres', centreId, 'profile', 'main'),
          (snap) => {
            const profileData = snap.exists() ? snap.data() : {}
            const data = { ...clientDataRef.current, ...profileData }
            setCentre(data)
            const docsArr = data.doctors || []
            setDoctors(docsArr)
            // Set default doctor only on first load
            setSelDoc(prev => prev || (docsArr.length > 0 ? docsArr[0] : null))
            // Set default date only on first load
            setSelDate(prev => {
              if (prev) return prev
              const today = new Date()
              const firstDoc = (data.doctors || [])[0]
              const weeklyOff = firstDoc?.weeklyOff || data.weeklyOff || []
              const unavailDates = firstDoc?.unavailableDates || []
              for (let i = 0; i < 14; i++) {
                const d = new Date(today); d.setDate(today.getDate() + i)
                const ds = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0')
                if (!weeklyOff.includes(d.getDay()) && !unavailDates.includes(ds)) return d
              }
              return today
            })
            setLoading(false)
          },
          (e) => { console.error(e); setNotFound(true); setLoading(false) }
        )
      } catch (e) {
        console.error(e); setNotFound(true); setLoading(false)
      }
    }
    init()
    return () => {
      if (unsubProfileRef.current) unsubProfileRef.current()
      if (unsubBookedRef.current)  unsubBookedRef.current()
      if (unsubDateRef.current)    unsubDateRef.current()
    }
  }, [centreId])

  // ── Real-time booked slots for selected date (per doctor) ──
  useEffect(() => {
    if (!selDate || !centreId) return
    setSlotsLoading(true)
    if (unsubBookedRef.current) unsubBookedRef.current()
    const dateStr = toLocalDateStr(selDate)
    const q = query(
      collection(db, 'centres', centreId, 'appointments'),
      where('date', '==', dateStr),
      where('status', 'in', ['scheduled', 'waiting', 'in-consultation', 'done'])
    )
    unsubBookedRef.current = onSnapshot(q, (snap) => {
      const selDocName = selDoc?.name || selDoc || null
      const taken = snap.docs
        .filter(d => {
          const dn = d.data().doctorName
          // If both sides have a name, they must match. If either is missing, include (legacy data)
          if (selDocName && dn) return dn === selDocName
          return true
        })
        .map(d => d.data().appointmentTime)
        .filter(Boolean)
      setBookedSlots(taken)
      setSlotsLoading(false)
    }, (e) => {
      console.error('bookedSlots:', e)
      setBookedSlots([])
      setSlotsLoading(false)
    })
  }, [selDate, centreId, selDoc])

  // ── Real-time booked counts for all 14 date chips ──
  useEffect(() => {
    if (!centreId || !selDoc) return
    const today = new Date(); today.setHours(0,0,0,0)
    const dates = []
    for (let i = 0; i < 14; i++) {
      const d = new Date(today); d.setDate(today.getDate() + i)
      dates.push(d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'))
    }
    const startDs = dates[0]; const endDs = dates[dates.length - 1]
    const q = query(
      collection(db, 'centres', centreId, 'appointments'),
      where('date', '>=', startDs),
      where('date', '<=', endDs)
    )
    if (unsubDateRef.current) unsubDateRef.current()
    unsubDateRef.current = onSnapshot(q, (snap) => {
      const counts = {}
      snap.docs.forEach(docSnap => {
        const { date, appointmentTime, status, doctorName } = docSnap.data()
        if (!date || !appointmentTime || appointmentTime === 'Walk-in (no slot)' || status === 'cancelled') return
        // Only count appointments for the currently selected doctor
        const selDocName = selDoc?.name || selDoc
        if (selDocName && doctorName && doctorName !== selDocName) return
        if (!counts[date]) counts[date] = { morning: 0, evening: 0 }
        // Parse hour of booked slot
        const parts = appointmentTime.split(' ')
        if (parts.length < 2) return
        const period = parts[1]; const h = parseInt(parts[0].split(':')[0]); const m = parseInt(parts[0].split(':')[1] || '0')
        const hour24 = period === 'PM' && h !== 12 ? h + 12 : (period === 'AM' && h === 12 ? 0 : h)
        const slotMins = hour24 * 60 + m
        // Get this doctor's override and their own session times
        const docObj = selDoc ? doctors.find(d => (d?.name || d) === (selDoc?.name || selDoc)) : null
        const overCfg = docObj?.slotOverrides?.[date] || {}
        const mStartStr = overCfg.morningStart
        const eStartStr = overCfg.eveningStart
        const docMStart = docObj?.morningStart || centre?.morningStart || '09:00'
        const docMEnd   = docObj?.morningEnd   || centre?.morningEnd   || '13:00'
        const docEStart = docObj?.eveningStart || centre?.eveningStart || '16:00'
        const morningStartMins = mStartStr ? timeToMinutes(mStartStr) : timeToMinutes(docMStart)
        const morningEndMins   = timeToMinutes(docMEnd)
        const eveningStartMins = eStartStr ? timeToMinutes(eStartStr) : timeToMinutes(docEStart)
        if (slotMins >= morningStartMins && slotMins < morningEndMins) counts[date].morning++
        else if (slotMins >= eveningStartMins) counts[date].evening++
      })
      setDateBookedCounts(counts)
    }, (e) => console.warn('dateBookedCounts:', e))
  }, [centreId, selDoc, centre, doctors])

  // ── Derived slot lists — use doctor's own timing, fall back to clinic defaults ──
  const selDocObj  = doctors.find(d => (d?.name || d) === (selDoc?.name || selDoc))
  const duration    = parseInt(selDocObj?.slotDuration || centre?.slotDuration || '30')
  const docMorningStart = selDocObj?.morningStart || centre?.morningStart || '09:00'
  const docMorningEnd   = selDocObj?.morningEnd   || centre?.morningEnd   || '13:00'
  const docEveningStart = selDocObj?.eveningStart || centre?.eveningStart || '16:00'
  const docEveningEnd   = selDocObj?.eveningEnd   || centre?.eveningEnd   || '20:00'
  const morningSlots = generateSlots(docMorningStart, docMorningEnd, duration)
  const eveningSlots = generateSlots(docEveningStart, docEveningEnd, duration)

  // Apply per-date slot override for selected doctor
  const selDateStr = selDate ? selDate.getFullYear() + '-' + String(selDate.getMonth()+1).padStart(2,'0') + '-' + String(selDate.getDate()).padStart(2,'0') : null
  const slotOverride = selDateStr && selDocObj?.slotOverrides?.[selDateStr]
    ? selDocObj.slotOverrides[selDateStr]
    : null

  // Per-session override: { morning: 5, evening: 'off'|'all'|N, morningStart: 'HH:MM', eveningStart: 'HH:MM' }
  const getSessionOverride = (sess) => {
    const cfg = selDateStr && selDocObj?.slotOverrides?.[selDateStr]
    if (!cfg) return null
    const v = cfg[sess]
    if (!v || v === 'all') return null
    if (v === 'off') return 'off'
    return parseInt(v) || null
  }
  const morningOverride = getSessionOverride('morning')
  const eveningOverride = getSessionOverride('evening')

  // Get custom start time for a session on selected date
  const getSessionStartOverride = (sess) => {
    const cfg = selDateStr && selDocObj?.slotOverrides?.[selDateStr]
    if (!cfg) return null
    return sess === 'morning' ? (cfg.morningStart || null) : (cfg.eveningStart || null)
  }

  const applyOverride = (slots, override, sessKey) => {
    if (override === 'off') return []
    const customStart = getSessionStartOverride(sessKey)
    let result = slots
    if (customStart) {
      // Find first slot >= customStart and slice from there
      const startMins = timeToMinutes(customStart)
      const idx = result.findIndex(s => timeToMinutes(s) >= startMins)
      result = idx >= 0 ? result.slice(idx) : []
    }
    if (override) return result.slice(0, override)
    return result
  }
  const currentSlots = applyOverride(
    selSession === 'morning' ? morningSlots : eveningSlots,
    selSession === 'morning' ? morningOverride : eveningOverride,
    selSession
  )

  // ── Date chips ──
  const dateChips = (() => {
    const chips = []
    const today = new Date()
    // Use doctor's own weeklyOff, fallback to centre weeklyOff
    const weeklyOff = selDocObj?.weeklyOff || centre?.weeklyOff || []
    const unavailDates = selDocObj?.unavailableDates || []
    for (let i = 0; i < 14; i++) {
      const d = new Date(today); d.setDate(today.getDate() + i)
      const ds = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0')
      const isDoctorOff = unavailDates.includes(ds)
      const isWeeklyOff = weeklyOff.includes(d.getDay())
      // Slot availability for this date
      const overrideCfg = selDocObj?.slotOverrides?.[ds]
      const mOverride = overrideCfg?.morning; const eOverride = overrideCfg?.evening
      // For date chip counts, apply full override including custom start time
      const mSlotsForDate = (() => {
        if (mOverride === 'off') return []
        const mStartOverride = overrideCfg?.morningStart
        let slots = [...morningSlots]
        if (mStartOverride) { const sm = timeToMinutes(mStartOverride); const idx = slots.findIndex(s => timeToMinutes(s) >= sm); slots = idx >= 0 ? slots.slice(idx) : [] }
        if (mOverride && mOverride !== 'all') slots = slots.slice(0, parseInt(mOverride) || slots.length)
        return slots
      })()
      const eSlotsForDate = (() => {
        if (eOverride === 'off') return []
        const eStartOverride = overrideCfg?.eveningStart
        let slots = [...eveningSlots]
        if (eStartOverride) { const sm = timeToMinutes(eStartOverride); const idx = slots.findIndex(s => timeToMinutes(s) >= sm); slots = idx >= 0 ? slots.slice(idx) : [] }
        if (eOverride && eOverride !== 'all') slots = slots.slice(0, parseInt(eOverride) || slots.length)
        return slots
      })()
      const mTotal = mSlotsForDate.length
      const eTotal = eSlotsForDate.length
      const totalSlots = mTotal + eTotal
      const booked = dateBookedCounts[ds] ? (dateBookedCounts[ds].morning + dateBookedCounts[ds].evening) : 0
      const available = Math.max(0, totalSlots - booked)
      chips.push({ date: d, off: isWeeklyOff || isDoctorOff, reason: isDoctorOff ? 'Leave' : isWeeklyOff ? 'Off' : null, available, totalSlots })
    }
    return chips
  })()

  // ── Navigation ──
  function canProceed() {
    if (step === 1) return name.trim().length > 0 && phone.trim().length === 10
    if (step === 2) return doctors.length === 0 || selDoc !== null
    if (step === 3) {
      if (!selDate) return false
      // Use doctor's own weeklyOff, fall back to centre weeklyOff
      const docWeeklyOff = selDocObj?.weeklyOff || centre?.weeklyOff || []
      if (docWeeklyOff.includes(selDate.getDay())) return false
      const dateStr2 = selDate.getFullYear() + '-' + String(selDate.getMonth()+1).padStart(2,'0') + '-' + String(selDate.getDate()).padStart(2,'0')
      if (selDocObj?.unavailableDates?.includes(dateStr2)) return false
      return true
    }
    if (step === 4) return selSlot !== null
    return true
  }

  function goNext() {
    if (!canProceed()) return
    const nextStep = step + 1
    // Auto-select evening if morning is already over (today only) — use doctor's morningEnd
    if (nextStep === 3) {
      const isToday = selDate && selDate.toDateString() === new Date().toDateString()
      const morningEndH = parseInt((selDocObj?.morningEnd || centre?.morningEnd || '13:00').split(':')[0])
      if (isToday && new Date().getHours() >= morningEndH) {
        setSelSession('evening')
      }
    }
    setStep(nextStep)
    window.scrollTo(0, 0)
  }

  function goBack() {
    setStep(s => s - 1)
    window.scrollTo(0, 0)
  }

  // ── Submit ──
  async function handleConfirm() {
    if (submittingRef.current) return  // instant ref guard — blocks before React re-render
    submittingRef.current = true
    setSubmitting(true)
    try {
      const dateStr     = toLocalDateStr(selDate)
      const fullPhone   = '91' + phone.trim()
      const docName     = selDoc?.name || selDoc || ''
      const centreName  = centre?.centreName || 'Clinic'
      const dateLabel   = DAYS_FULL[selDate.getDay()] + ', ' + selDate.getDate() + ' ' + MONTHS[selDate.getMonth()] + ' ' + selDate.getFullYear()

      // ── 1. Upsert patient ──
      let patientId = null
      const pq    = query(collection(db, 'centres', centreId, 'patients'), where('phone', '==', phone.trim()))
      const pSnap = await getDocs(pq)
      if (!pSnap.empty) {
        patientId = pSnap.docs[0].id
        // update last visit
        await updateDoc(doc(db, 'centres', centreId, 'patients', patientId), {
          name: name.trim(), age: age || '', gender: gender || '', dob: dob || '',
          lastClinicVisit: dateStr
        })
      } else {
        const newPat = await addDoc(collection(db, 'centres', centreId, 'patients'), {
          name: name.trim(), phone: phone.trim(), age: age || '', gender: gender || '', dob: dob || '',
          source: 'online_booking', lastClinicVisit: dateStr,
          createdAt: serverTimestamp()
        })
        patientId = newPat.id
      }

      // ── 2. Transaction: check slot + duplicate + get token + write appointment atomically ──
      let apptId = null
      let tokenNumber = null

      await runTransaction(db, async (tx) => {
        // Fetch all appointments for this date
        const apptSnap = await getDocs(
          query(collection(db, 'centres', centreId, 'appointments'),
            where('date', '==', dateStr),
            where('status', 'in', ['scheduled', 'waiting', 'in-consultation', 'done'])
          )
        )

        // Check for slot conflict — only for the same doctor
        const conflict = apptSnap.docs.find(d => {
          const data = d.data()
          if (data.appointmentTime !== selSlot) return false
          // If doctorName recorded, must match selected doctor
          if (data.doctorName && docName) return data.doctorName === docName
          return true // legacy: no doctorName → treat as conflict to be safe
        })
        if (conflict) throw new Error('SLOT_TAKEN')

        // Check duplicate — same patient already booked for same doctor on this date
        const duplicate = apptSnap.docs.find(d => {
          const data = d.data()
          if (data.phone !== phone.trim()) return false
          if (data.doctorName && docName) return data.doctorName === docName
          return true
        })
        if (duplicate) throw new Error('ALREADY_BOOKED')

        // Calculate next token — per session using time-based detection
        const docMEndMins = timeToMinutes(selDocObj?.morningEnd || centre?.morningEnd || '13:00')
        const getApptSession = (apptTime) => {
          if (!apptTime || apptTime === 'Walk-in (no slot)') return null
          const parts = apptTime.trim().split(' ')
          const hm = parts[0].split(':')
          let h = Number(hm[0]); const m = Number(hm[1] || 0)
          if (parts[1] === 'PM' && h !== 12) h += 12
          if (parts[1] === 'AM' && h === 12) h = 0
          return (h * 60 + m) < docMEndMins ? 'morning' : 'evening'
        }
        const sessionTokens = apptSnap.docs
          .filter(d => d.data().status !== 'cancelled')
          .filter(d => {
            const data = d.data()
            // Must be same doctor (if doctorName recorded)
            if (data.doctorName && docName && data.doctorName !== docName) return false
            const apptSession = data.session || getApptSession(data.appointmentTime)
            return apptSession === selSession
          })
          .map(d => d.data().tokenNumber || 0)
        tokenNumber = sessionTokens.length > 0 ? Math.max(...sessionTokens) + 1 : 1

        // Write appointment with all fields matching dashboard expectations
        const newApptRef = doc(collection(db, 'centres', centreId, 'appointments'))
        apptId = newApptRef.id
        tx.set(newApptRef, {
          // Dashboard-required fields
          patientName:     name.trim(),
          phone:           phone.trim(),
          age:             age || '',
          gender:          gender || '',
          dob:             dob || '',
          appointmentTime: selSlot,       // matches dashboard field name
          visitType:       'New Visit',
          tokenNumber,
          status:          'scheduled',   // matches dashboard statuses
          date:            dateStr,
          // Extra context
          patientId,
          doctorName:      docName,
          session:         selSession,
          source:          'online_booking',
          createdAt:       serverTimestamp(),
        })
      })

      // ── 3. WhatsApp confirmation ──
      const campaigns = centre?.whatsappCampaigns || []
      const confirmCampaign = campaigns.find(c => c.purpose === 'appt_confirm' && c.enabled !== false)

      if (confirmCampaign) {
        // Match param order from NewAppointment.jsx:
        // {{1}} patientName, {{2}} doctorName, {{3}} date, {{4}} appointmentTime
        await sendCampaign(campaigns, 'appt_confirm', fullPhone,
          [name.trim(), docName || centreName, dateStr, selSlot],
          null, { centreId, patientName: name.trim(), apptId }
        )// Always notify admin regardless of campaign path
  	const apiKey = centre?.aisynergyApiKey
  	if (apiKey) {
    		const adminMsg = `🔔 New Online Booking\nClinic: ${centreName}\nPatient: ${name.trim()} (+91${phone})\nDate: ${dateLabel}\nTime: ${selSlot}${docName ? '\nDoctor: ' + docName : ''}\nToken: #${tokenNumber}`
    await sendPlainWA(apiKey, centre?.fallbackNotifyNumber || FALLBACK_NOTIFY_NUMBER, adminMsg)
  }
      } else {
        // Fallback: plain text WA to patient + admin notify
        const apiKey = centre?.aisynergyApiKey
        if (apiKey) {
          const msg = `Hi ${name.trim()}, your appointment at ${centreName} is confirmed.\n\nDate: ${dateLabel}\nTime: ${selSlot}${docName ? '\nDoctor: ' + docName : ''}\n\nPlease arrive 5 mins early!`
          await sendPlainWA(apiKey, fullPhone, msg)
          const adminMsg = `🔔 New Online Booking\nClinic: ${centreName}\nPatient: ${name.trim()} (+91${phone})\nDate: ${dateLabel}\nTime: ${selSlot}${docName ? '\nDoctor: ' + docName : ''}\nToken: #${tokenNumber}`
          await sendPlainWA(apiKey, centre?.fallbackNotifyNumber || FALLBACK_NOTIFY_NUMBER, adminMsg)
        }
      }

      setApptId(apptId)
      setDone(true)
      window.scrollTo(0, 0)

    } catch (e) {
      if (e.message === 'SLOT_TAKEN') {
        alert('Sorry! This slot was just booked by someone else. Please go back and choose another slot.')
        const dateStr = toLocalDateStr(selDate)
        const snap = await getDocs(query(
          collection(db, 'centres', centreId, 'appointments'),
          where('date', '==', dateStr),
          where('status', 'in', ['scheduled', 'waiting', 'in-consultation', 'done'])
        ))
        setBookedSlots(snap.docs.map(d => d.data().appointmentTime).filter(Boolean))
        setSelSlot(null)
        setStep(4)
      } else if (e.message === 'ALREADY_BOOKED') {
        alert('You already have an appointment booked for this date. Please contact the clinic if you need to make changes.')
        setStep(1)
      } else {
        console.error('Booking failed:', e)
        alert('Something went wrong. Please try again.')
      }
    }
    setSubmitting(false)
    submittingRef.current = false
  }

  // ── Render states ──
  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: "'DM Sans',sans-serif", color: '#8FA3B0', fontSize: 14 }}>
      Loading clinic details…
    </div>
  )

  if (notFound) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: "'DM Sans',sans-serif", color: '#4A5E6D', gap: 8 }}>
      <div style={{ fontSize: 40 }}>🏥</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: '#0D2B3E' }}>Clinic not found</div>
      <div style={{ fontSize: 13, color: '#8FA3B0' }}>This booking link may be invalid or expired.</div>
    </div>
  )

  const clinicInitial = (centre?.centreName || 'C').charAt(0).toUpperCase()
  const dateLabel = selDate ? (DAYS_FULL[selDate.getDay()] + ', ' + selDate.getDate() + ' ' + MONTHS[selDate.getMonth()] + ' ' + selDate.getFullYear()) : '—'

  return (
    <div style={S.body}>
      {/* Google Font */}
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* Top bar */}
      <div style={S.topbar}>
        <div style={S.clinicBrand}>
          <div style={S.clinicAvatar}>{clinicInitial}</div>
          <div>
            <div style={S.clinicName}>{centre?.centreName || 'Clinic'}</div>
            <div style={S.clinicSub}>{centre?.city ? `${centre.city} · ` : ''}Book Appointment</div>
          </div>
        </div>
        <div style={S.mfBadge}>
          <div style={S.mfIcon}>M</div>
          <div style={S.mfLabel}>
            <span style={S.mfPowered}>Powered by</span>
            <span style={S.mfName}>MediFlow</span>
          </div>
        </div>
      </div>

      {/* Stepper — hide on success */}
      {!done && <Stepper step={step} />}

      <div style={S.wrap}>

        {/* ── SUCCESS ── */}
        {done && (
          <div style={{ textAlign: 'center', padding: '48px 0' }}>
            <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'linear-gradient(135deg,#0B9E8A,#087A6B)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 36, color: 'white', boxShadow: '0 8px 24px rgba(11,158,138,0.3)', animation: 'pop .4s cubic-bezier(.34,1.56,.64,1)' }}>✓</div>
            <style>{`@keyframes pop{from{transform:scale(0)}to{transform:scale(1)}}`}</style>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#0D2B3E', marginBottom: 8 }}>Appointment Confirmed!</div>
            <div style={{ fontSize: 13, color: '#8FA3B0', lineHeight: 1.6, marginBottom: 24 }}>Your slot is booked. Check WhatsApp for confirmation.</div>
            <div style={{ background: '#E8F5E9', border: '1px solid #A5D6A7', borderRadius: 12, padding: 16, textAlign: 'left', marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#2E7D32', marginBottom: 3 }}>📱 WhatsApp Confirmation Sent</div>
              <div style={{ fontSize: 12, color: '#388E3C', lineHeight: 1.5 }}>Appointment details have been sent to your WhatsApp number +91 {phone}.</div>
            </div>
            <div style={S.sumBox}>
              <div style={{ ...S.sumRow }}><span style={S.sumKey}>Patient</span><span style={S.sumVal}>{name}</span></div>
              <div style={{ ...S.sumRow }}><span style={S.sumKey}>Doctor</span><span style={S.sumVal}>{selDoc?.name || selDoc}</span></div>
              <div style={{ ...S.sumRow }}><span style={S.sumKey}>Date</span><span style={S.sumVal}>{dateLabel}</span></div>
              <div style={{ ...S.sumRow, borderBottom: 'none' }}><span style={S.sumKey}>Time</span><span style={S.sumVal}>{selSlot}</span></div>
            </div>
          </div>
        )}

        {/* ── STEP 1: Details ── */}
        {!done && step === 1 && (
          <div>
            <div style={S.cardTitle}>Your Details</div>
            <div style={S.cardSub}>We'll send your confirmation on WhatsApp</div>
            <div style={S.card}>
              <div style={{ marginBottom: 14 }}>
                <span style={S.label}>Full Name *</span>
                <input style={S.input} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Rajesh Sharma" />
              </div>

              {/* DOB — inline dropdowns */}
              <div style={{ marginBottom: 14 }}>
                <span style={S.label}>Date of Birth <span style={{ color: '#8FA3B0', fontWeight: 400 }}>(optional — age auto-calculated)</span></span>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {(() => {
                    const MONTHS_LIST = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
                    const parts = dob ? dob.split('-') : ['','','']
                    const yr = parts[0], mo = parts[1] ? String(parseInt(parts[1])) : '', dy = parts[2] ? String(parseInt(parts[2])) : ''
                    const maxDays = mo && yr ? new Date(parseInt(yr), parseInt(mo), 0).getDate() : 31
                    const days = Array.from({length: maxDays}, (_,i) => i+1)
                    const currYear = new Date().getFullYear()
                    const years = Array.from({length: 100}, (_,i) => currYear - i)
                    function handleDob(field, val) {
                      const next = { yr: field==='yr' ? val : yr, mo: field==='mo' ? val : mo, dy: field==='dy' ? val : dy }
                      if (next.yr && next.mo && next.dy) {
                        const iso = `${next.yr}-${String(next.mo).padStart(2,'0')}-${String(next.dy).padStart(2,'0')}`
                        setDob(iso)
                        const calcAge = Math.floor((new Date() - new Date(iso)) / (365.25*24*60*60*1000))
                        if (calcAge >= 0 && calcAge <= 120) setAge(String(calcAge))
                      } else { setDob('') }
                    }
                    const selStyle = { ...S.input, paddingRight: 8, flex: 1, minWidth: 70 }
                    return (<>
                      <select style={{ ...selStyle, flex: '0 0 70px' }} value={dy} onChange={e => handleDob('dy', e.target.value)}>
                        <option value="">Day</option>
                        {days.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                      <select style={{ ...selStyle, flex: '1 1 100px' }} value={mo} onChange={e => handleDob('mo', e.target.value)}>
                        <option value="">Month</option>
                        {MONTHS_LIST.map((m,i) => <option key={i+1} value={i+1}>{m}</option>)}
                      </select>
                      <select style={{ ...selStyle, flex: '0 0 85px' }} value={yr} onChange={e => handleDob('yr', e.target.value)}>
                        <option value="">Year</option>
                        {years.map(y => <option key={y} value={y}>{y}</option>)}
                      </select>
                      {age && <div style={{ padding: '9px 12px', borderRadius: 10, background: '#E6F7F5', color: '#0B9E8A', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>{age}y</div>}
                    </>)
                  })()}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
                <div style={{ flex: 1 }}>
                  <span style={S.label}>Age <span style={{ color: '#8FA3B0', fontWeight: 400 }}>(if DOB unknown)</span></span>
                  <input style={S.input} type="number" value={age} onChange={e => setAge(e.target.value)} placeholder="35" min="1" max="120" />
                </div>
                <div style={{ flex: 1 }}>
                  <span style={S.label}>Gender</span>
                  <select style={S.input} value={gender} onChange={e => setGender(e.target.value)}>
                    <option value="">Select</option>
                    <option>Male</option><option>Female</option><option>Other</option>
                  </select>
                </div>
              </div>
              <div>
                <span style={S.label}>WhatsApp Number *</span>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 13, fontWeight: 600, color: '#4A5E6D' }}>+91</span>
                  <input style={{ ...S.input, paddingLeft: 46 }} type="tel" value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g,'').slice(0,10))} placeholder="10-digit number" maxLength={10} />
                </div>
              </div>
            </div>
            <div style={S.note}>📱 Appointment confirmation will be sent to this WhatsApp number</div>
            <button style={S.btnPrimary} onClick={goNext} disabled={!canProceed()}>
              Continue →
            </button>
          </div>
        )}

        {/* ── STEP 2: Doctor ── */}
        {!done && step === 2 && (
          <div>
            <div style={S.cardTitle}>Choose Doctor</div>
            <div style={S.cardSub}>Select your preferred doctor</div>
            {doctors.length === 0 ? (
              <div style={S.card}>
                <div style={{ fontSize: 13, color: '#8FA3B0', textAlign: 'center', padding: '12px 0' }}>
                  No doctors listed — proceeding without doctor selection
                </div>
              </div>
            ) : (
              doctors.map((d, i) => {
                const dName = d?.name || d
                const dDeg  = d?.degree || d?.speciality || ''
                const on    = (selDoc?.name || selDoc) === dName
                return (
                  <div key={i} style={S.docCard(on)} onClick={() => setSelDoc(d)}>
                    <div style={S.docAvatar}>{dName.charAt(dName.lastIndexOf(' ') + 1)}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#0D2B3E' }}>{dName}</div>
                      {dDeg && <div style={{ fontSize: 11, color: '#8FA3B0', marginTop: 2 }}>{dDeg}</div>}
                    </div>
                    <div style={S.radio(on)}>{on && <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'white' }} />}</div>
                  </div>
                )
              })
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2.5fr', gap: 10, marginTop: 8 }}>
              <button style={S.btnGhost} onClick={goBack}>← Back</button>
              <button style={S.btnPrimary} onClick={goNext}>Next: Pick Date →</button>
            </div>
          </div>
        )}

        {/* ── STEP 3: Date + Session ── */}
        {!done && step === 3 && (
          <div>
            <div style={S.cardTitle}>Pick a Date</div>
            <div style={S.cardSub}>Next 14 days · weekly off days are greyed out</div>
            {/* Date strip */}
            <div style={{ display: 'flex', gap: 7, overflowX: 'auto', padding: '2px 0 10px', WebkitOverflowScrolling: 'touch' }}>
              {dateChips.map(({ date, off, reason, available, totalSlots }, i) => {
                const on = selDate && date.toDateString() === selDate.toDateString()
                return (
                  <div key={i} style={S.dateChip(on, off)} onClick={() => { if (!off) { setSelDate(date); setSelSlot(null) } }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: on ? 'rgba(255,255,255,.8)' : '#8FA3B0', textTransform: 'uppercase' }}>{DAYS[date.getDay()]}</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: on ? 'white' : off ? '#8FA3B0' : '#0D2B3E', lineHeight: 1.1 }}>{date.getDate()}</div>
                    <div style={{ fontSize: 10, color: on ? 'rgba(255,255,255,.8)' : '#8FA3B0' }}>{MONTHS[date.getMonth()]}</div>
                    {off
                      ? <div style={{ fontSize: 9, color: '#DC2626', fontWeight: 600, marginTop: 2 }}>{reason || 'Off'}</div>
                      : available === 0
                        ? <div style={{ fontSize: 9, color: '#DC2626', fontWeight: 600, marginTop: 2 }}>Full</div>
                        : available < totalSlots
                          ? <div style={{ fontSize: 9, color: on ? 'rgba(255,255,255,0.85)' : '#D97706', fontWeight: 600, marginTop: 2 }}>{available} left</div>
                          : null
                    }
                  </div>
                )
              })}
            </div>

            {/* Session toggle */}
            <div style={{ marginTop: 8, marginBottom: 4, fontSize: 13, fontWeight: 700, color: '#0D2B3E' }}>Choose Session</div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
              {(() => {
                const isToday = selDate && selDate.toDateString() === new Date().toDateString()
                const now = new Date(); const nowMins = now.getHours() * 60 + now.getMinutes()
                const morningEndMins = timeToMinutes(selDocObj?.morningEnd || centre?.morningEnd || '13:00')
                const eveningEndMins = timeToMinutes(selDocObj?.eveningEnd || centre?.eveningEnd || '20:00')
                const morningPast = isToday && nowMins >= morningEndMins
                const eveningPast = isToday && nowMins >= eveningEndMins
                const ds2 = selDate ? selDate.getFullYear() + '-' + String(selDate.getMonth()+1).padStart(2,'0') + '-' + String(selDate.getDate()).padStart(2,'0') : null
                const bc = ds2 ? (dateBookedCounts[ds2] || { morning: 0, evening: 0 }) : { morning: 0, evening: 0 }
                const mAvail = morningOverride === 'off' ? 0 : Math.max(0, applyOverride(morningSlots, morningOverride, 'morning').length - bc.morning)
                const eAvail = eveningOverride === 'off' ? 0 : Math.max(0, applyOverride(eveningSlots, eveningOverride, 'evening').length - bc.evening)
                const sessions = [
                  { key: 'morning', icon: '🌅', label: 'Morning', time: (() => {
                    const customStart = getSessionStartOverride('morning')
                    const start = customStart || docMorningStart
                    const effectiveSlots = applyOverride(morningSlots, morningOverride, 'morning')
                    if (effectiveSlots.length === 0) return `${minutesToTime(timeToMinutes(start))} – ${minutesToTime(timeToMinutes(docMorningEnd))}`
                    const lastSlotMins = timeToMinutes(effectiveSlots[effectiveSlots.length - 1]) + duration
                    return `${minutesToTime(timeToMinutes(start))} – ${minutesToTime(lastSlotMins)}`
                  })(), avail: mAvail, total: applyOverride(morningSlots, morningOverride, 'morning').length, off: morningOverride === 'off', past: morningPast },
                  { key: 'evening', icon: '🌆', label: 'Evening', time: (() => {
                    const customStart = getSessionStartOverride('evening')
                    const start = customStart || docEveningStart
                    const effectiveSlots = applyOverride(eveningSlots, eveningOverride, 'evening')
                    if (effectiveSlots.length === 0) return `${minutesToTime(timeToMinutes(start))} – ${minutesToTime(timeToMinutes(docEveningEnd))}`
                    const lastSlotMins = timeToMinutes(effectiveSlots[effectiveSlots.length - 1]) + duration
                    return `${minutesToTime(timeToMinutes(start))} – ${minutesToTime(lastSlotMins)}`
                  })(), avail: eAvail, total: applyOverride(eveningSlots, eveningOverride, 'evening').length, off: eveningOverride === 'off', past: eveningPast },
                ]
                return sessions.map(sess => (
                  <div key={sess.key}
                    style={{
                      ...S.sessCard(selSession === sess.key && !sess.past && !sess.off),
                      ...((sess.past || sess.off || sess.avail === 0) ? { opacity: 0.45, cursor: 'not-allowed', border: '1.5px solid #E2E8F0', background: '#F8FAFC' } : {})
                    }}
                    onClick={() => { if (!sess.past && !sess.off && sess.avail > 0) { setSelSession(sess.key); setSelSlot(null) } }}
                  >
                    <div style={{ fontSize: 22, marginBottom: 5 }}>{sess.icon}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: (sess.past||sess.off) ? '#8FA3B0' : '#0D2B3E' }}>{sess.label}</div>
                    <div style={{ fontSize: 11, color: '#8FA3B0', marginTop: 2 }}>{sess.time}</div>
                    {sess.past
                      ? <div style={{ fontSize: 10, color: '#DC2626', fontWeight: 600, marginTop: 5 }}>Session over</div>
                      : sess.off
                        ? <div style={{ fontSize: 10, color: '#DC2626', fontWeight: 600, marginTop: 5 }}>Closed today</div>
                        : sess.avail === 0
                          ? <div style={{ fontSize: 10, color: '#DC2626', fontWeight: 600, marginTop: 5 }}>Fully booked</div>
                          : <div style={{ fontSize: 10, color: '#0B9E8A', fontWeight: 600, marginTop: 5 }}>{sess.avail} of {sess.total} left</div>
                    }
                  </div>
                ))
              })()}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2.5fr', gap: 10 }}>
              <button style={S.btnGhost} onClick={goBack}>← Back</button>
              <button style={{ ...S.btnPrimary, opacity: canProceed() ? 1 : 0.5 }} onClick={goNext} disabled={!canProceed()}>Next: Pick Slot →</button>
            </div>
          </div>
        )}

        {/* ── STEP 4: Slots ── */}
        {!done && step === 4 && (
          <div>
            <div style={S.cardTitle}>Available Slots</div>
            <div style={S.cardSub}>{selSession === 'morning' ? '🌅 Morning' : '🌆 Evening'} · {selDate ? DAYS[selDate.getDay()] + ', ' + selDate.getDate() + ' ' + MONTHS[selDate.getMonth()] : ''}</div>

            {slotsLoading ? (
              <div style={{ textAlign: 'center', color: '#8FA3B0', fontSize: 13, padding: '24px 0' }}>Loading slots…</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 16 }}>
                {currentSlots.map((slot, i) => {
                  const bk = bookedSlots.includes(slot)
                  const on = selSlot === slot
                  // Disable past slots for today only
                  let isPast = false
                  if (selDate && toLocalDateStr(selDate) === toLocalDateStr(new Date())) {
                    const parts = slot.split(' ')
                    const hm = parts[0].split(':')
                    let h = Number(hm[0])
                    const min = Number(hm[1])
                    if (parts[1] === 'PM' && h !== 12) h += 12
                    if (parts[1] === 'AM' && h === 12) h = 0
                    const now = new Date()
                    isPast = (h * 60 + min) < (now.getHours() * 60 + now.getMinutes())
                  }
                  const disabled = bk || isPast
                  return (
                    <div key={i} style={S.slotBtn(on, disabled)} onClick={() => { if (!disabled) setSelSlot(slot) }}>
                      {slot}
                      {isPast && !bk && <div style={{ fontSize: 9, color: '#8FA3B0', marginTop: 2 }}>Past</div>}
                    </div>
                  )
                })}
                {currentSlots.length === 0 && (
                  <div style={{ gridColumn: '1/-1', textAlign: 'center', color: '#8FA3B0', fontSize: 13, padding: '16px 0' }}>
                    No slots configured for this session
                  </div>
                )}
              </div>
            )}

            <div style={S.warnNote}>⚠ If the doctor is unavailable due to an emergency, you will be notified on WhatsApp the night before.</div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2.5fr', gap: 10 }}>
              <button style={S.btnGhost} onClick={goBack}>← Back</button>
              <button style={{ ...S.btnPrimary, opacity: selSlot ? 1 : 0.5 }} onClick={goNext} disabled={!selSlot}>Review →</button>
            </div>
          </div>
        )}

        {/* ── STEP 5: Confirm ── */}
        {!done && step === 5 && (
          <div>
            <div style={S.cardTitle}>Confirm Booking</div>
            <div style={S.cardSub}>Review your details before confirming</div>
            <div style={S.sumBox}>
              <div style={S.sumRow}><span style={S.sumKey}>Patient</span><span style={S.sumVal}>{name}</span></div>
              <div style={S.sumRow}><span style={S.sumKey}>Doctor</span><span style={S.sumVal}>{selDoc?.name || selDoc || '—'}</span></div>
              <div style={S.sumRow}><span style={S.sumKey}>Date</span><span style={S.sumVal}>{dateLabel}</span></div>
              <div style={S.sumRow}><span style={S.sumKey}>Session</span><span style={S.sumVal}>{selSession === 'morning' ? '🌅 Morning' : '🌆 Evening'}</span></div>
              <div style={S.sumRow}><span style={S.sumKey}>Time Slot</span><span style={S.sumVal}>{selSlot}</span></div>
              <div style={{ ...S.sumRow, borderBottom: 'none' }}><span style={S.sumKey}>WhatsApp</span><span style={S.sumVal}>+91 {phone}</span></div>
            </div>
            <div style={S.note}>📱 A WhatsApp confirmation will be sent after booking.</div>
            <button style={{ ...S.btnPrimary, opacity: submitting ? 0.7 : 1 }} onClick={handleConfirm} disabled={submitting}>
              {submitting ? 'Booking…' : '✓ Confirm & Book Appointment'}
            </button>
            <button style={S.btnGhost} onClick={goBack}>← Change Slot</button>
          </div>
        )}

      </div>

      {/* Footer */}
      <div style={S.footer}>
        <div style={S.footerMf}>
          <div style={S.footerIcon}>M</div>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'white', lineHeight: 1 }}>MediFlow</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 1 }}>Clinic & Appointment Management</div>
          </div>
        </div>
        <div>© 2026 Synergy Consultant</div>
      </div>
    </div>
  )
}
