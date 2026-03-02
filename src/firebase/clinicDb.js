// src/firebase/clinicDb.js
// All Firestore operations for the Clinic module

import {
  collection, doc, addDoc, updateDoc, getDoc, getDocs,
  query, where, orderBy, limit, serverTimestamp, setDoc, deleteDoc
} from 'firebase/firestore'
import { db } from './config'

// ── APPOINTMENTS ──────────────────────────────────────────

export async function createAppointment(centreId, data) {
  const ref = collection(db, 'centres', centreId, 'appointments')
  const docRef = await addDoc(ref, {
    ...data,
    status: 'scheduled', // scheduled → waiting → in-consultation → done → cancelled
    createdAt: serverTimestamp()
  })
  return docRef.id
}

export async function getAppointments(centreId, dateStr) {
  const ref = collection(db, 'centres', centreId, 'appointments')
  const q = query(ref, where('date', '==', dateStr))
  const snap = await getDocs(q)
  const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
  // Sort by tokenNumber client-side — avoids composite index requirement
  return docs.sort((a, b) => (a.tokenNumber || 0) - (b.tokenNumber || 0))
}

export async function updateAppointment(centreId, apptId, data) {
  const ref = doc(db, 'centres', centreId, 'appointments', apptId)
  await updateDoc(ref, { ...data, updatedAt: serverTimestamp() })
}

export async function getNextToken(centreId, dateStr) {
  // Fetch all appointments for the date and find max token client-side
  // Avoids needing a composite Firestore index on (date + tokenNumber)
  const ref = collection(db, 'centres', centreId, 'appointments')
  const q = query(ref, where('date', '==', dateStr))
  const snap = await getDocs(q)
  if (snap.empty) return 1
  const maxToken = Math.max(...snap.docs.map(d => d.data().tokenNumber || 0))
  return maxToken + 1
}

// ── PRESCRIPTIONS ─────────────────────────────────────────

export async function createPrescription(centreId, data) {
  const ref = collection(db, 'centres', centreId, 'prescriptions')
  const docRef = await addDoc(ref, {
    ...data,
    createdAt: serverTimestamp()
  })
  return docRef.id
}

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

export async function getPrescription(centreId, prescId) {
  const ref = doc(db, 'centres', centreId, 'prescriptions', prescId)
  const snap = await getDoc(ref)
  return snap.exists() ? { id: snap.id, ...snap.data() } : null
}

// ── FOLLOW-UPS ────────────────────────────────────────────

export async function createFollowUp(centreId, data) {
  const ref = collection(db, 'centres', centreId, 'followups')
  const docRef = await addDoc(ref, {
    ...data,
    reminded: false,
    createdAt: serverTimestamp()
  })
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

// ── MEDICINE CATALOGUE ────────────────────────────────────

export async function getMedicines(centreId) {
  const ref = collection(db, 'centres', centreId, 'medicines')
  const snap = await getDocs(ref)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export async function saveMedicine(centreId, data) {
  if (data.id) {
    const ref = doc(db, 'centres', centreId, 'medicines', data.id)
    const { id, ...rest } = data
    await updateDoc(ref, rest)
    return data.id
  }
  const ref = collection(db, 'centres', centreId, 'medicines')
  const docRef = await addDoc(ref, { ...data, createdAt: serverTimestamp() })
  return docRef.id
}

// ── DEFAULT MEDICINES ─────────────────────────────────────

export const DEFAULT_MEDICINES = [
  // Antibiotics
  { name: 'Amoxicillin 500mg',        type: 'Tablet',  category: 'Antibiotic' },
  { name: 'Azithromycin 500mg',        type: 'Tablet',  category: 'Antibiotic' },
  { name: 'Ciprofloxacin 500mg',       type: 'Tablet',  category: 'Antibiotic' },
  { name: 'Doxycycline 100mg',         type: 'Capsule', category: 'Antibiotic' },
  { name: 'Metronidazole 400mg',       type: 'Tablet',  category: 'Antibiotic' },
  { name: 'Cefixime 200mg',            type: 'Tablet',  category: 'Antibiotic' },
  // Pain & Fever
  { name: 'Paracetamol 500mg',         type: 'Tablet',  category: 'Pain/Fever' },
  { name: 'Ibuprofen 400mg',           type: 'Tablet',  category: 'Pain/Fever' },
  { name: 'Diclofenac 50mg',           type: 'Tablet',  category: 'Pain/Fever' },
  { name: 'Nimesulide 100mg',          type: 'Tablet',  category: 'Pain/Fever' },
  { name: 'Aceclofenac 100mg',         type: 'Tablet',  category: 'Pain/Fever' },
  // Gastro
  { name: 'Pantoprazole 40mg',         type: 'Tablet',  category: 'Gastro' },
  { name: 'Omeprazole 20mg',           type: 'Capsule', category: 'Gastro' },
  { name: 'Domperidone 10mg',          type: 'Tablet',  category: 'Gastro' },
  { name: 'Ondansetron 4mg',           type: 'Tablet',  category: 'Gastro' },
  { name: 'Ranitidine 150mg',          type: 'Tablet',  category: 'Gastro' },
  { name: 'ORS Sachet',                type: 'Sachet',  category: 'Gastro' },
  // Vitamins
  { name: 'Vitamin C 500mg',           type: 'Tablet',  category: 'Vitamins' },
  { name: 'Vitamin D3 60000 IU',       type: 'Capsule', category: 'Vitamins' },
  { name: 'Vitamin B-Complex',         type: 'Tablet',  category: 'Vitamins' },
  { name: 'Iron + Folic Acid',         type: 'Tablet',  category: 'Vitamins' },
  { name: 'Calcium + Vitamin D3',      type: 'Tablet',  category: 'Vitamins' },
  // Diabetes
  { name: 'Metformin 500mg',           type: 'Tablet',  category: 'Diabetes' },
  { name: 'Metformin 1000mg',          type: 'Tablet',  category: 'Diabetes' },
  { name: 'Glimepiride 1mg',           type: 'Tablet',  category: 'Diabetes' },
  { name: 'Glimepiride 2mg',           type: 'Tablet',  category: 'Diabetes' },
  // Hypertension
  { name: 'Amlodipine 5mg',            type: 'Tablet',  category: 'Hypertension' },
  { name: 'Telmisartan 40mg',          type: 'Tablet',  category: 'Hypertension' },
  { name: 'Atenolol 50mg',             type: 'Tablet',  category: 'Hypertension' },
  { name: 'Losartan 50mg',             type: 'Tablet',  category: 'Hypertension' },
  // Respiratory
  { name: 'Salbutamol 2mg',            type: 'Tablet',  category: 'Respiratory' },
  { name: 'Montelukast 10mg',          type: 'Tablet',  category: 'Respiratory' },
  { name: 'Levocetrizine 5mg',         type: 'Tablet',  category: 'Respiratory' },
  { name: 'Cetirizine 10mg',           type: 'Tablet',  category: 'Respiratory' },
  { name: 'Ambroxol 30mg',             type: 'Tablet',  category: 'Respiratory' },
  { name: 'Guaifenesin Syrup',         type: 'Syrup',   category: 'Respiratory' },
  // Skin
  { name: 'Betamethasone Cream',       type: 'Cream',   category: 'Skin' },
  { name: 'Clotrimazole Cream',        type: 'Cream',   category: 'Skin' },
  { name: 'Mupirocin Ointment',        type: 'Cream',   category: 'Skin' },
  // Eye & Ear
  { name: 'Ciprofloxacin Eye Drops',   type: 'Drops',   category: 'Eye/Ear' },
  { name: 'Tobramycin Eye Drops',      type: 'Drops',   category: 'Eye/Ear' },
  // Thyroid
  { name: 'Levothyroxine 25mcg',       type: 'Tablet',  category: 'Thyroid' },
  { name: 'Levothyroxine 50mcg',       type: 'Tablet',  category: 'Thyroid' },
  { name: 'Levothyroxine 100mcg',      type: 'Tablet',  category: 'Thyroid' },
]

// ── DOSAGE OPTIONS ────────────────────────────────────────

export const DOSAGE_FREQUENCY = [
  '1-0-1',   // Twice daily
  '1-1-1',   // Thrice daily
  '0-0-1',   // Once at night
  '1-0-0',   // Once in morning
  '0-1-0',   // Once at noon
  '1-1-0',   // Morning and afternoon
  '1-0-1-1', // Three times + night
  'SOS',     // As needed
]

export const DOSAGE_DURATION = [
  '3 days', '5 days', '7 days', '10 days', '14 days',
  '1 month', '2 months', '3 months', 'Ongoing'
]

export const DOSAGE_TIMING = [
  'Before food', 'After food', 'With food',
  'Empty stomach', 'At bedtime', 'In morning'
]

// ── VITALS TEMPLATE ───────────────────────────────────────

export const VITALS_FIELDS = [
  { key: 'bp',     label: 'BP',          unit: 'mmHg',   placeholder: '120/80' },
  { key: 'pulse',  label: 'Pulse',       unit: 'bpm',    placeholder: '72' },
  { key: 'temp',   label: 'Temperature', unit: '°F',     placeholder: '98.6' },
  { key: 'weight', label: 'Weight',      unit: 'kg',     placeholder: '65' },
  { key: 'spo2',   label: 'SpO2',        unit: '%',      placeholder: '98' },
  { key: 'rbs',    label: 'RBS',         unit: 'mg/dL',  placeholder: '110' },
]

// ── WHATSAPP FOR CLINIC ───────────────────────────────────

export async function sendClinicWhatsApp(apiKey, phone, templateName, params) {
  try {
    const digits = phone.replace(/\D/g, '')
    const destination = digits.startsWith('91') && digits.length === 12
      ? digits
      : '91' + digits.slice(-10)

    const payload = {
      apiKey,
      campaignName: templateName,
      destination,
      userName: 'AISYNERGY',
      templateParams: params,
      source: 'mediflow',
      media: {},
      attributes: {},
      paramsFallbackValue: { FirstName: params[0] || 'user' }
    }
    console.log('[WhatsApp] Sending:', JSON.stringify(payload))
    const res = await fetch('https://backend.api-wa.co/campaign/aisynergy/api/v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    const text = await res.text()
    console.log('[WhatsApp] Response:', res.status, text)
    return res.ok
  } catch (e) {
    console.error('[WhatsApp] Error:', e)
    return false
  }
}
