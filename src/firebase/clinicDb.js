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
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export async function getNextToken(centreId, dateStr) {
  const appts = await getAppointments(centreId, dateStr)
  const tokens = appts.filter(a => a.status !== 'cancelled').map(a => a.tokenNumber || 0)
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
  const q = query(ref, where('phone', '==', phone), orderBy('date', 'desc'), limit(50))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

// ── PRESCRIPTIONS ────────────────────────────────────────────────────────────

export async function getPrescriptions(centreId, patientPhone, months = 6) {
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - months)
  const cutoffStr = cutoff.toISOString().split('T')[0]
  const ref = collection(db, 'centres', centreId, 'prescriptions')
  const q = query(
    ref,
    where('patientPhone', '==', patientPhone),
    where('date', '>=', cutoffStr),
    orderBy('date', 'desc')
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export async function getAllPrescriptions(centreId, patientPhone) {
  const ref = collection(db, 'centres', centreId, 'prescriptions')
  const q = query(ref, where('patientPhone', '==', patientPhone), orderBy('date', 'desc'), limit(100))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
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
