// src/firebase/clinicDb.js
import { db } from './config'
import {
  collection, doc, addDoc, getDoc, getDocs, updateDoc, setDoc,
  query, where, orderBy, limit, serverTimestamp, setDoc as setDocAlias, deleteDoc
} from 'firebase/firestore'

// ── PATIENTS (upsert — shared with diagnostic) ────────────────────────────────

export async function upsertClinicPatient(centreId, { name, phone, age, gender }) {
  if (!phone) return
  const ref = collection(db, 'centres', centreId, 'patients')
  const existing = await getDocs(query(ref, where('phone', '==', phone), limit(1)))
  if (!existing.empty) {
    const docRef = existing.docs[0].ref
    await updateDoc(docRef, { name, age: age || '', gender: gender || '', lastClinicVisit: new Date().toISOString().split('T')[0] })
    return existing.docs[0].id
  }
  const newDoc = await addDoc(ref, {
    name, phone, age: age || '', gender: gender || '',
    source: 'clinic',
    lastClinicVisit: new Date().toISOString().split('T')[0],
    createdAt: serverTimestamp()
  })
  return newDoc.id
}

// ── APPOINTMENTS ─────────────────────────────────────────────────────────────

export async function createAppointment(centreId, data) {
  const ref = collection(db, 'centres', centreId, 'appointments')
  const docRef = await addDoc(ref, { ...data, createdAt: serverTimestamp() })
  return docRef.id
}

export async function getAppointments(centreId, dateStr) {
  const ref = collection(db, 'centres', centreId, 'appointments')
  const q = query(ref, where('date', '==', dateStr))
  const snap = await getDocs(q)
  const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
  return docs.sort((a, b) => {
    const toMins = (t) => {
      if (!t) return 999
      const parts = t.split(' ')
      const hm = parts[0].split(':')
      let h = Number(hm[0])
      const min = Number(hm[1])
      const period = parts[1]
      if (period === 'PM' && h !== 12) h += 12
      if (period === 'AM' && h === 12) h = 0
      return h * 60 + min
    }
    return toMins(a.appointmentTime) - toMins(b.appointmentTime)
  })
}
// Determine session from appointment time string (e.g. "07:30 PM" → evening)
export function getSessionFromTime(timeStr) {
  if (!timeStr || timeStr === 'Walk-in (no slot)') return null
  const parts = timeStr.trim().split(' ')
  if (parts.length < 2) return null
  const hm = parts[0].split(':')
  let h = Number(hm[0])
  const period = parts[1]
  if (period === 'PM' && h !== 12) h += 12
  if (period === 'AM' && h === 12) h = 0
  // Morning = before 14:00 (2 PM), Evening = 14:00 onwards
  return h < 14 ? 'morning' : 'evening'
}

export async function getNextToken(centreId, dateStr, session = null) {
  const appts = await getAppointments(centreId, dateStr)
  const filtered = appts.filter(a => {
    if (a.status === 'cancelled') return false
    if (!session) return true
    // Use time-based session detection — works even for old appointments without session field
    const apptSession = a.session || getSessionFromTime(a.appointmentTime)
    return apptSession === session
  })
  const tokens = filtered.map(a => a.tokenNumber || 0)
  return tokens.length > 0 ? Math.max(...tokens) + 1 : 1
}

export async function updateAppointment(centreId, apptId, data) {
  const ref = doc(db, 'centres', centreId, 'appointments', apptId)
  await updateDoc(ref, { ...data, updatedAt: serverTimestamp() })
}

export async function getAppointment(centreId, apptId) {
  const ref = doc(db, 'centres', centreId, 'appointments', apptId)
  const snap = await getDoc(ref)
  return snap.exists() ? { id: snap.id, ...snap.data() } : null
}

// Get all appointments for a patient by phone
export async function getPatientAppointments(centreId, phone) {
  const ref = collection(db, 'centres', centreId, 'appointments')
  const q = query(ref, where('phone', '==', phone), limit(50))
  const snap = await getDocs(q)
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => b.date?.localeCompare(a.date))
}

// ── PRESCRIPTIONS ────────────────────────────────────────────────────────────

export async function getPrescriptions(centreId, patientPhone) {
  const ref = collection(db, 'centres', centreId, 'prescriptions')
  const q = query(ref, where('patientPhone', '==', patientPhone), limit(100))
  const snap = await getDocs(q)
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => b.date?.localeCompare(a.date))
}

export async function getAllPrescriptions(centreId, patientPhone) {
  const ref = collection(db, 'centres', centreId, 'prescriptions')
  const q = query(ref, where('patientPhone', '==', patientPhone), limit(100))
  const snap = await getDocs(q)
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => b.date?.localeCompare(a.date))
}

export async function getPrescription(centreId, prescId) {
  const ref = doc(db, 'centres', centreId, 'prescriptions', prescId)
  const snap = await getDoc(ref)
  return snap.exists() ? { id: snap.id, ...snap.data() } : null
}

export async function createPrescription(centreId, data) {
  const ref = collection(db, 'centres', centreId, 'prescriptions')
  const docRef = await addDoc(ref, { ...data, createdAt: serverTimestamp() })
  return docRef.id
}

export async function updatePrescription(centreId, prescId, data) {
  const ref = doc(db, 'centres', centreId, 'prescriptions', prescId)
  await updateDoc(ref, { ...data, updatedAt: serverTimestamp() })
}

// ── FOLLOW-UPS ────────────────────────────────────────────────────────────────

export async function createFollowUp(centreId, data) {
  const ref = collection(db, 'centres', centreId, 'followups')
  const docRef = await addDoc(ref, { ...data, createdAt: serverTimestamp() })
  return docRef.id
}

export async function getUpcomingFollowUps(centreId) {
  const today = new Date().toISOString().split('T')[0]
  const future = new Date()
  future.setDate(future.getDate() + 7)
  const futureStr = future.toISOString().split('T')[0]
  const ref = collection(db, 'centres', centreId, 'followups')
  const q = query(
    ref,
    where('followUpDate', '>=', today),
    where('followUpDate', '<=', futureStr),
    orderBy('followUpDate', 'asc')
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export async function updateFollowUp(centreId, followUpId, data) {
  const ref = doc(db, 'centres', centreId, 'followups', followUpId)
  await updateDoc(ref, { ...data, updatedAt: serverTimestamp() })
}

// ── MEDICINES ────────────────────────────────────────────────────────────────

export async function getMedicines(centreId) {
  const ref = collection(db, 'centres', centreId, 'medicines')
  const snap = await getDocs(ref)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

// ── VITALS FIELDS ─────────────────────────────────────────────────────────────

export const VITALS_FIELDS = [
  { key: 'bp', label: 'BP', placeholder: '120/80 mmHg' },
  { key: 'pulse', label: 'Pulse', placeholder: '72 bpm' },
  { key: 'temp', label: 'Temperature', placeholder: '98.6 °F' },
  { key: 'weight', label: 'Weight', placeholder: 'kg' },
  { key: 'spo2', label: 'SpO2', placeholder: '99%' },
  { key: 'rbs', label: 'RBS', placeholder: 'mg/dL' },
]

// ── DOSAGE CONSTANTS ──────────────────────────────────────────────────────────

export const DOSAGE_FREQUENCY = ['1-0-1', '1-1-1', '0-0-1', '1-0-0', '0-1-0', 'SOS', 'Once a day', 'Twice a day', 'Thrice a day']
export const DOSAGE_DURATION  = ['3 days', '5 days', '7 days', '10 days', '15 days', '1 month', 'Ongoing']
export const DOSAGE_TIMING    = ['Before food', 'After food', 'With food', 'Empty stomach', 'At bedtime']

export const DEFAULT_MEDICINES = [
  { name: 'Amoxicillin 500mg',      category: 'Antibiotics' },
  { name: 'Azithromycin 500mg',     category: 'Antibiotics' },
  { name: 'Ciprofloxacin 500mg',    category: 'Antibiotics' },
  { name: 'Cefixime 200mg',         category: 'Antibiotics' },
  { name: 'Metronidazole 400mg',    category: 'Antibiotics' },
  { name: 'Doxycycline 100mg',      category: 'Antibiotics' },
  { name: 'Paracetamol 500mg',      category: 'Pain & Fever' },
  { name: 'Ibuprofen 400mg',        category: 'Pain & Fever' },
  { name: 'Diclofenac 50mg',        category: 'Pain & Fever' },
  { name: 'Nimesulide 100mg',       category: 'Pain & Fever' },
  { name: 'Aceclofenac 100mg',      category: 'Pain & Fever' },
  { name: 'Pantoprazole 40mg',      category: 'Gastroenterology' },
  { name: 'Omeprazole 20mg',        category: 'Gastroenterology' },
  { name: 'Domperidone 10mg',       category: 'Gastroenterology' },
  { name: 'Ondansetron 4mg',        category: 'Gastroenterology' },
  { name: 'ORS Sachet',             category: 'Gastroenterology' },
  { name: 'Vitamin C',              category: 'Vitamins' },
  { name: 'Vitamin D3 60000 IU',    category: 'Vitamins' },
  { name: 'B-Complex',              category: 'Vitamins' },
  { name: 'Iron + Folic Acid',      category: 'Vitamins' },
  { name: 'Calcium + D3',           category: 'Vitamins' },
  { name: 'Metformin 500mg',        category: 'Diabetes' },
  { name: 'Metformin 1000mg',       category: 'Diabetes' },
  { name: 'Glimepiride 1mg',        category: 'Diabetes' },
  { name: 'Glimepiride 2mg',        category: 'Diabetes' },
  { name: 'Amlodipine 5mg',         category: 'Hypertension' },
  { name: 'Telmisartan 40mg',       category: 'Hypertension' },
  { name: 'Atenolol 50mg',          category: 'Hypertension' },
  { name: 'Losartan 50mg',          category: 'Hypertension' },
  { name: 'Montelukast 10mg',       category: 'Respiratory' },
  { name: 'Levocetrizine 5mg',      category: 'Respiratory' },
  { name: 'Cetirizine 10mg',        category: 'Respiratory' },
  { name: 'Ambroxol 30mg',          category: 'Respiratory' },
  { name: 'Salbutamol 2mg',         category: 'Respiratory' },
  { name: 'Levothyroxine 25mcg',    category: 'Thyroid' },
  { name: 'Levothyroxine 50mcg',    category: 'Thyroid' },
  { name: 'Levothyroxine 100mcg',   category: 'Thyroid' },
  { name: 'Betamethasone Cream',    category: 'Skin / Eye / Ear' },
  { name: 'Clotrimazole Cream',     category: 'Skin / Eye / Ear' },
  { name: 'Mupirocin',              category: 'Skin / Eye / Ear' },
  { name: 'Ciprofloxacin Eye Drops',category: 'Skin / Eye / Ear' },
]

// ── SAVE MEDICINE ─────────────────────────────────────────────────────────────

export async function saveMedicine(centreId, medicine) {
  const ref = collection(db, 'centres', centreId, 'medicines')
  const existing = await getDocs(query(ref, where('name', '==', medicine.name), limit(1)))
  if (!existing.empty) return existing.docs[0].id
  const docRef = await addDoc(ref, { ...medicine, createdAt: serverTimestamp() })
  return docRef.id
}

// ── SEND CLINIC WHATSAPP (legacy — used by FollowUps.jsx) ────────────────────

export async function sendClinicWhatsApp(centreId, { phone, patientName, message }) {
  // Stub — actual sending goes through whatsapp.js sendCampaign
  console.log('[sendClinicWhatsApp] Use sendCampaign from whatsapp.js instead', { phone, patientName })
  return { ok: false, error: 'Use sendCampaign from whatsapp.js' }
}

// ── SESSION REPORTS ───────────────────────────────────────────────────────────

export async function saveSessionReport(centreId, report) {
  // report: { date, session, doctorName, total, newVisits, followUps,
  //           collected, pending, free, noShows, cancellations,
  //           slotsAvailable, slotsBooked, appointments[] }
  const ref = collection(db, 'centres', centreId, 'sessionReports')
  const docRef = await addDoc(ref, {
    ...report,
    savedAt: serverTimestamp()
  })
  return docRef.id
}

export async function getSessionReports(centreId, { from, to } = {}) {
  let q = query(
    collection(db, 'centres', centreId, 'sessionReports'),
    orderBy('date', 'desc')
  )
  const snap = await getDocs(q)
  let reports = snap.docs.map(d => ({ id: d.id, ...d.data() }))
  if (from) reports = reports.filter(r => r.date >= from)
  if (to)   reports = reports.filter(r => r.date <= to)
  return reports
}

export async function getAppointmentsByRange(centreId, from, to) {
  const snap = await getDocs(query(
    collection(db, 'centres', centreId, 'appointments'),
    where('date', '>=', from),
    where('date', '<=', to),
    orderBy('date', 'desc')
  ))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}
