// src/firebase/adminDb.js
// Admin-only Firestore operations for client management

import {
  collection, doc, addDoc, updateDoc, getDoc, getDocs,
  query, orderBy, serverTimestamp, setDoc, where, deleteDoc
} from 'firebase/firestore'
import { db } from './config'

// ── CLIENTS ──────────────────────────────────────────────────────────

export async function getClients() {
  const ref = collection(db, 'clients')
  const q = query(ref, orderBy('createdAt', 'desc'))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export async function getClient(centreId) {
  const ref = doc(db, 'clients', centreId)
  const snap = await getDoc(ref)
  return snap.exists() ? { id: snap.id, ...snap.data() } : null
}

export async function createClientRecord(centreId, data) {
  const ref = doc(db, 'clients', centreId)
  await setDoc(ref, {
    ...data,
    status: data.status || 'trial',
    paid: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  })
}

export async function updateClient(centreId, data) {
  const ref = doc(db, 'clients', centreId)
  await updateDoc(ref, { ...data, updatedAt: serverTimestamp() })
}

export async function deactivateClient(centreId) {
  await updateClient(centreId, { status: 'deactivated', deactivatedAt: new Date().toISOString() })
}

export async function reactivateClient(centreId) {
  await updateClient(centreId, { status: 'active', deactivatedAt: null })
}

// ── LEADS (inbound WhatsApp) ──────────────────────────────────────────

export async function getLeads() {
  const ref = collection(db, 'leads')
  const q = query(ref, orderBy('createdAt', 'desc'))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export async function upsertLead(phone, data) {
  const ref = doc(db, 'leads', phone.replace(/\D/g, ''))
  const snap = await getDoc(ref)
  if (snap.exists()) {
    await updateDoc(ref, {
      ...data,
      messageCount: (snap.data().messageCount || 0) + 1,
      lastMessageAt: serverTimestamp()
    })
  } else {
    await setDoc(ref, {
      ...data,
      messageCount: 1,
      createdAt: serverTimestamp(),
      lastMessageAt: serverTimestamp(),
      status: 'new'
    })
  }
}

export async function updateLead(phone, data) {
  const ref = doc(db, 'leads', phone.replace(/\D/g, ''))
  await updateDoc(ref, { ...data, updatedAt: serverTimestamp() })
}

export async function deleteLead(phone) {
  const ref = doc(db, 'leads', phone.replace(/\D/g, ''))
  await deleteDoc(ref)
}

// ── SUBSCRIPTION HELPERS ──────────────────────────────────────────────

export const PLANS = {
  clinic_basic:       { label: 'Clinic Basic',                    price: 999,  centreType: 'clinic',      modules: [] },
  clinic_vaccination: { label: 'Clinic + Vaccination',            price: 1499, centreType: 'clinic',      modules: ['vaccination'] },
  diagnostic_basic:   { label: 'Diagnostic Basic',                price: 1999, centreType: 'diagnostic',  modules: [] },
  diagnostic_pro:     { label: 'Diagnostic Pro',                  price: 2999, centreType: 'diagnostic',  modules: [] },
  combo:              { label: 'Clinic + Diagnostic',             price: 2999, centreType: 'both',        modules: [] },
  combo_vaccination:  { label: 'Clinic + Diagnostic + Vaccination', price: 3499, centreType: 'both',      modules: ['vaccination'] },
}

export function getSubscriptionStatus(client) {
  if (!client) return 'unknown'
  if (client.status === 'deactivated') return 'deactivated'
  if (!client.subscriptionEndDate) return 'trial'
  const end = new Date(client.subscriptionEndDate)
  const now = new Date()
  if (now > end) return 'expired'
  return client.paid ? 'active' : 'trial'
}

export function isAccountAccessible(client) {
  const status = getSubscriptionStatus(client)
  return ['active', 'trial'].includes(status)
}

// ── MODULE TOGGLES ────────────────────────────────────────────────────────────

/**
 * Toggle an add-on module for a client.
 * Writes to both clients/{centreId} (admin record) and
 * centres/{centreId}/profile/main (read by AuthContext on login).
 */
export async function toggleModule(centreId, moduleName, enabled) {
  // Update admin client record
  await updateDoc(doc(db, 'clients', centreId), {
    [`modules.${moduleName}`]: enabled,
    updatedAt: serverTimestamp()
  })
  // Update centre profile so AuthContext picks it up
  await setDoc(
    doc(db, 'centres', centreId, 'profile', 'main'),
    { modules: { [moduleName]: enabled } },
    { merge: true }
  )
}
