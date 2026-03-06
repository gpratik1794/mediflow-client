// src/firebase/vaccinationDb.js
import { db } from './config'
import {
  collection, doc, addDoc, getDoc, getDocs, updateDoc, setDoc,
  query, orderBy, serverTimestamp, where, limit, deleteDoc
} from 'firebase/firestore'

// ── DEFAULT VACCINE SCHEDULE ─────────────────────────────────────────────────
export const DEFAULT_VACCINE_SCHEDULE = [
  { id: 'bcg',          name: 'BCG',               atMonths: 0,   description: 'At birth' },
  { id: 'hepb_0',       name: 'Hepatitis B (Birth)',atMonths: 0,   description: 'At birth' },
  { id: 'opv_0',        name: 'OPV 0',             atMonths: 0,   description: 'At birth' },
  { id: 'opv_1',        name: 'OPV 1',             atMonths: 1.5, description: '6 weeks' },
  { id: 'dpt_1',        name: 'DPT 1',             atMonths: 1.5, description: '6 weeks' },
  { id: 'hepb_1',       name: 'Hepatitis B 1',     atMonths: 1.5, description: '6 weeks' },
  { id: 'hib_1',        name: 'Hib 1',             atMonths: 1.5, description: '6 weeks' },
  { id: 'pcv_1',        name: 'PCV 1',             atMonths: 1.5, description: '6 weeks' },
  { id: 'rota_1',       name: 'Rotavirus 1',       atMonths: 1.5, description: '6 weeks' },
  { id: 'opv_2',        name: 'OPV 2',             atMonths: 2.5, description: '10 weeks' },
  { id: 'dpt_2',        name: 'DPT 2',             atMonths: 2.5, description: '10 weeks' },
  { id: 'hib_2',        name: 'Hib 2',             atMonths: 2.5, description: '10 weeks' },
  { id: 'rota_2',       name: 'Rotavirus 2',       atMonths: 2.5, description: '10 weeks' },
  { id: 'opv_3',        name: 'OPV 3',             atMonths: 3.5, description: '14 weeks' },
  { id: 'dpt_3',        name: 'DPT 3',             atMonths: 3.5, description: '14 weeks' },
  { id: 'hib_3',        name: 'Hib 3',             atMonths: 3.5, description: '14 weeks' },
  { id: 'pcv_2',        name: 'PCV 2',             atMonths: 3.5, description: '14 weeks' },
  { id: 'ipv',          name: 'IPV',               atMonths: 3.5, description: '14 weeks' },
  { id: 'hepb_2',       name: 'Hepatitis B 2',     atMonths: 6,   description: '6 months' },
  { id: 'influenza_1',  name: 'Influenza 1',       atMonths: 6,   description: '6 months' },
  { id: 'typhoid',      name: 'Typhoid',           atMonths: 9,   description: '9 months' },
  { id: 'mmr_1',        name: 'MMR 1',             atMonths: 9,   description: '9 months' },
  { id: 'varicella_1',  name: 'Varicella 1',       atMonths: 12,  description: '12 months' },
  { id: 'hepA_1',       name: 'Hepatitis A 1',     atMonths: 12,  description: '12 months' },
  { id: 'pcv_booster',  name: 'PCV Booster',       atMonths: 15,  description: '15 months' },
  { id: 'mmr_2',        name: 'MMR 2',             atMonths: 15,  description: '15 months' },
  { id: 'varicella_2',  name: 'Varicella 2',       atMonths: 15,  description: '15 months' },
  { id: 'hepA_2',       name: 'Hepatitis A 2',     atMonths: 18,  description: '18 months' },
  { id: 'dpt_b1',       name: 'DPT Booster 1',     atMonths: 18,  description: '18 months' },
  { id: 'hib_booster',  name: 'Hib Booster',       atMonths: 18,  description: '18 months' },
  { id: 'opv_booster',  name: 'OPV Booster',       atMonths: 18,  description: '18 months' },
  { id: 'typhoid_b',    name: 'Typhoid Booster',   atMonths: 24,  description: '2 years' },
  { id: 'dpt_b2',       name: 'DPT Booster 2',     atMonths: 60,  description: '5 years' },
  { id: 'opv_b2',       name: 'OPV Booster 2',     atMonths: 60,  description: '5 years' },
  { id: 'mmr_3',        name: 'MMR 3',             atMonths: 60,  description: '5 years' },
]

export function getDueDate(dobStr, atMonths) {
  const dob = new Date(dobStr)
  const due = new Date(dob)
  due.setDate(due.getDate() + Math.round(atMonths * 30.44))
  return due.toISOString().split('T')[0]
}

// ── CHILD PROFILES ────────────────────────────────────────────────────────────

export async function createChild(centreId, data) {
  const ref = collection(db, 'centres', centreId, 'children')
  const docRef = await addDoc(ref, { ...data, createdAt: serverTimestamp() })
  return docRef.id
}

export async function getChildren(centreId) {
  const ref = collection(db, 'centres', centreId, 'children')
  const q   = query(ref, orderBy('createdAt', 'desc'))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export async function getChild(centreId, childId) {
  const ref  = doc(db, 'centres', centreId, 'children', childId)
  const snap = await getDoc(ref)
  return snap.exists() ? { id: snap.id, ...snap.data() } : null
}

export async function updateChild(centreId, childId, data) {
  const ref = doc(db, 'centres', centreId, 'children', childId)
  await updateDoc(ref, { ...data, updatedAt: serverTimestamp() })
}

export async function searchChildrenByPhone(centreId, phone) {
  const ref = collection(db, 'centres', centreId, 'children')
  const q   = query(ref, where('motherPhone', '==', phone), limit(5))
  const snap = await getDocs(q)
  if (!snap.empty) return snap.docs.map(d => ({ id: d.id, ...d.data() }))
  const q2   = query(ref, where('fatherPhone', '==', phone), limit(5))
  const snap2 = await getDocs(q2)
  return snap2.docs.map(d => ({ id: d.id, ...d.data() }))
}

// ── VACCINATION RECORDS ───────────────────────────────────────────────────────

export async function markVaccineGiven(centreId, childId, vaccineId, { givenDate, batchNo, notes, givenBy }) {
  const ref = doc(db, 'centres', centreId, 'children', childId)
  await updateDoc(ref, {
    [`vaccines.${vaccineId}`]: { givenDate, batchNo: batchNo || '', notes: notes || '', givenBy: givenBy || '', recordedAt: new Date().toISOString() }
  })
}

export async function unmarkVaccine(centreId, childId, vaccineId) {
  const ref = doc(db, 'centres', centreId, 'children', childId)
  await updateDoc(ref, { [`vaccines.${vaccineId}`]: null })
}

// ── REMINDER SCHEDULING ───────────────────────────────────────────────────────
// Stores reminder jobs in vaccinationReminders collection
// Vercel cron at /api/vaccination-reminders picks these up daily and sends WhatsApp

export async function scheduleVaccinationReminders(centreId, childId, childData, nextVaccine, reminderDays = [7, 3, 1]) {
  if (!nextVaccine || !childData.dob) return

  const dueDate = getDueDate(childData.dob, nextVaccine.atMonths)
  const dueDateObj = new Date(dueDate)

  // Delete old reminders for this child+vaccine combo
  const existingRef = collection(db, 'vaccinationReminders')
  const existing = await getDocs(query(existingRef,
    where('centreId', '==', centreId),
    where('childId', '==', childId),
    where('vaccineId', '==', nextVaccine.id)
  ))
  for (const d of existing.docs) await deleteDoc(d.ref)

  // Create new reminders for each configured day
  const phones = [childData.motherPhone, childData.fatherPhone].filter(Boolean)
  if (phones.length === 0) return

  for (const daysBefore of reminderDays) {
    const sendOn = new Date(dueDateObj)
    sendOn.setDate(sendOn.getDate() - daysBefore)
    if (sendOn < new Date()) continue // skip past dates

    await addDoc(existingRef, {
      centreId,
      childId,
      childName:    childData.childName,
      vaccineId:    nextVaccine.id,
      vaccineName:  nextVaccine.name,
      dueDate,
      daysBefore,
      sendOn:       sendOn.toISOString().split('T')[0],
      phones,
      status:       'pending',
      createdAt:    serverTimestamp()
    })
  }
}

export async function getPendingReminders(centreId) {
  const today = new Date().toISOString().split('T')[0]
  const ref   = collection(db, 'vaccinationReminders')
  const q     = query(ref,
    where('centreId', '==', centreId),
    where('sendOn', '<=', today),
    where('status', '==', 'pending')
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}
