// src/firebase/db.js
// All Firestore read/write operations for MediFlow

import {
  collection, doc, addDoc, updateDoc, getDoc, getDocs,
  query, where, orderBy, limit, serverTimestamp, setDoc
} from 'firebase/firestore'
import { db } from './config'

// ── PATIENTS ──────────────────────────────────────────────

export async function createPatient(centreId, data) {
  const ref = collection(db, 'centres', centreId, 'patients')
  const docRef = await addDoc(ref, {
    ...data,
    createdAt: serverTimestamp(),
    visitCount: 1
  })
  return docRef.id
}

export async function searchPatients(centreId, phone) {
  const ref = collection(db, 'centres', centreId, 'patients')
  const q = query(ref, where('phone', '==', phone), limit(5))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export async function getPatients(centreId, dateStr) {
  // dateStr = 'YYYY-MM-DD'
  const ref = collection(db, 'centres', centreId, 'visits')
  const q = query(ref, where('date', '==', dateStr), orderBy('createdAt', 'desc'))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

// ── VISITS (one per patient per day) ─────────────────────

export async function createVisit(centreId, data) {
  const ref = collection(db, 'centres', centreId, 'visits')
  const docRef = await addDoc(ref, {
    ...data,
    status: 'registered',    // registered → sampled → processing → ready
    paymentStatus: 'pending', // pending → paid
    createdAt: serverTimestamp()
  })
  return docRef.id
}

export async function updateVisit(centreId, visitId, data) {
  const ref = doc(db, 'centres', centreId, 'visits', visitId)
  await updateDoc(ref, { ...data, updatedAt: serverTimestamp() })
}

export async function getVisit(centreId, visitId) {
  const ref = doc(db, 'centres', centreId, 'visits', visitId)
  const snap = await getDoc(ref)
  return snap.exists() ? { id: snap.id, ...snap.data() } : null
}

// ── TEST CATALOGUE ────────────────────────────────────────

export async function getTestCatalogue(centreId) {
  const ref = collection(db, 'centres', centreId, 'tests')
  const snap = await getDocs(ref)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export async function saveTest(centreId, data) {
  if (data.id) {
    const ref = doc(db, 'centres', centreId, 'tests', data.id)
    await updateDoc(ref, data)
    return data.id
  }
  const ref = collection(db, 'centres', centreId, 'tests')
  const docRef = await addDoc(ref, { ...data, createdAt: serverTimestamp() })
  return docRef.id
}

export async function deleteTest(centreId, testId) {
  const ref = doc(db, 'centres', centreId, 'tests', testId)
  await updateDoc(ref, { deleted: true })
}

// ── CENTRE PROFILE ────────────────────────────────────────

export async function saveCentreProfile(uid, data) {
  // ✅ Correct path — same place AuthContext reads from
  await setDoc(doc(db, 'centres', uid, 'profile', 'main'), data, { merge: true })
}

export async function getCentreProfile(uid) {
  const snap = await getDoc(doc(db, 'centres', uid, 'profile', 'main'))
  return snap.exists() ? snap.data() : null
}

// ── BILLING ───────────────────────────────────────────────

export function generateBillNumber() {
  const d = new Date()
  const yy = String(d.getFullYear()).slice(2)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const rand = Math.floor(Math.random() * 9000) + 1000
  return `MF${yy}${mm}${rand}`
}

// ── AISYNERGY WHATSAPP ────────────────────────────────────

export async function sendWhatsApp(apiKey, phone, templateName, params) {
  try {
    // Add country code 91 if not already present
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

// ── DEFAULT TEST CATALOGUE (seed data) ───────────────────

export const DEFAULT_TESTS = [
  // Haematology
  { category: 'Haematology', name: 'CBC (Complete Blood Count)',    price: 350,  gst: 0  },
  { category: 'Haematology', name: 'ESR',                           price: 150,  gst: 0  },
  { category: 'Haematology', name: 'Peripheral Blood Smear',        price: 250,  gst: 0  },
  { category: 'Haematology', name: 'Platelet Count',                price: 150,  gst: 0  },
  // Biochemistry
  { category: 'Biochemistry', name: 'Blood Glucose Fasting',         price: 120,  gst: 0  },
  { category: 'Biochemistry', name: 'Blood Glucose PP',              price: 120,  gst: 0  },
  { category: 'Biochemistry', name: 'HbA1c',                         price: 450,  gst: 0  },
  { category: 'Biochemistry', name: 'Urea',                          price: 150,  gst: 0  },
  { category: 'Biochemistry', name: 'Creatinine',                    price: 150,  gst: 0  },
  { category: 'Biochemistry', name: 'Uric Acid',                     price: 160,  gst: 0  },
  // Liver
  { category: 'Liver Function', name: 'LFT (Liver Function Test)',   price: 650,  gst: 0  },
  { category: 'Liver Function', name: 'SGOT',                        price: 200,  gst: 0  },
  { category: 'Liver Function', name: 'SGPT',                        price: 200,  gst: 0  },
  { category: 'Liver Function', name: 'Bilirubin Total & Direct',    price: 200,  gst: 0  },
  // Kidney
  { category: 'Kidney Function', name: 'KFT (Kidney Function Test)', price: 700,  gst: 0  },
  // Lipid
  { category: 'Lipid Profile',  name: 'Full Lipid Profile',          price: 550,  gst: 0  },
  { category: 'Lipid Profile',  name: 'Total Cholesterol',           price: 180,  gst: 0  },
  { category: 'Lipid Profile',  name: 'HDL Cholesterol',             price: 200,  gst: 0  },
  { category: 'Lipid Profile',  name: 'LDL Cholesterol',             price: 200,  gst: 0  },
  { category: 'Lipid Profile',  name: 'Triglycerides',               price: 200,  gst: 0  },
  // Thyroid
  { category: 'Thyroid',        name: 'TSH',                         price: 350,  gst: 0  },
  { category: 'Thyroid',        name: 'T3',                          price: 300,  gst: 0  },
  { category: 'Thyroid',        name: 'T4',                          price: 300,  gst: 0  },
  { category: 'Thyroid',        name: 'Full Thyroid Panel (T3+T4+TSH)', price: 750, gst: 0 },
  // Vitamins
  { category: 'Vitamins',       name: 'Vitamin D (25-OH)',           price: 900,  gst: 5  },
  { category: 'Vitamins',       name: 'Vitamin B12',                 price: 750,  gst: 5  },
  { category: 'Vitamins',       name: 'Iron Studies',                price: 500,  gst: 0  },
  { category: 'Vitamins',       name: 'Ferritin',                    price: 650,  gst: 5  },
  // Infections
  { category: 'Infections',     name: 'Dengue NS1 Antigen',          price: 800,  gst: 0  },
  { category: 'Infections',     name: 'Malaria Antigen',             price: 600,  gst: 0  },
  { category: 'Infections',     name: 'Widal Test',                  price: 350,  gst: 0  },
  { category: 'Infections',     name: 'CRP',                         price: 400,  gst: 0  },
  { category: 'Infections',     name: 'HBsAg',                       price: 400,  gst: 0  },
  { category: 'Infections',     name: 'HIV I & II',                  price: 500,  gst: 0  },
  // Urine
  { category: 'Urine & Stool',  name: 'Urine Routine & Microscopy',  price: 150,  gst: 0  },
  { category: 'Urine & Stool',  name: 'Urine Culture',               price: 500,  gst: 0  },
  { category: 'Urine & Stool',  name: 'Stool Routine',               price: 200,  gst: 0  },
  // Cardiac
  { category: 'Cardiac',        name: 'Troponin I',                  price: 1200, gst: 5  },
  { category: 'Cardiac',        name: 'CPK-MB',                      price: 800,  gst: 5  },
  // Hormones
  { category: 'Hormones',       name: 'Testosterone',                price: 900,  gst: 5  },
  { category: 'Hormones',       name: 'Prolactin',                   price: 700,  gst: 5  },
  { category: 'Hormones',       name: 'FSH',                         price: 650,  gst: 5  },
  { category: 'Hormones',       name: 'LH',                          price: 650,  gst: 5  },
]
