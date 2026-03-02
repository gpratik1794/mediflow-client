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
  clinic_basic: { label: 'Clinic Basic', price: 999, modules: ['clinic'] },
  diagnostic_basic: { label: 'Diagnostic Basic', price: 2499, modules: ['diagnostic'] },
  diagnostic_pro: { label: 'Diagnostic Pro', price: 3999, modules: ['diagnostic'] },
  combo: { label: 'Combo (Clinic + Diagnostic)', price: 2999, modules: ['clinic', 'diagnostic'] },
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
