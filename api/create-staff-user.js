// api/create-staff-user.js
// Creates a Firebase Auth user for a staff member (receptionist/doctor)
// without signing out the clinic owner. Uses Firebase Admin SDK server-side.

import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

function initAdmin() {
  if (getApps().length > 0) return
  const privateKey = process.env.FIREBASE_PRIVATE_KEY
    ?.replace(/\\n/g, '\n')
    ?.replace(/^"|"$/g, '') // strip surrounding quotes if Vercel added them

  if (!privateKey || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.VITE_FIREBASE_PROJECT_ID) {
    throw new Error('Missing Firebase Admin env vars: FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL, or VITE_FIREBASE_PROJECT_ID')
  }

  initializeApp({
    credential: cert({
      projectId:   process.env.VITE_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey,
    })
  })
}

export default async function handler(req, res) {
  // Always set JSON header so errors are parseable by the frontend
  res.setHeader('Content-Type', 'application/json')

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { name, email, password, role, centreId } = req.body || {}

  if (!name || !email || !password || !role || !centreId)
    return res.status(400).json({ error: 'Missing required fields' })

  if (!['receptionist', 'doctor'].includes(role))
    return res.status(400).json({ error: 'Invalid role' })

  try {
    initAdmin()
    const adminAuth = getAuth()
    const adminDb   = getFirestore()

    // Create Firebase Auth user
    const userRecord = await adminAuth.createUser({
      email,
      password,
      displayName: name,
    })

    // Write staffUsers doc so AuthContext can detect them as staff
    await adminDb.collection('staffUsers').doc(userRecord.uid).set({
      name,
      email,
      role,
      centreId,
      createdAt: new Date().toISOString(),
    })

    return res.status(200).json({ ok: true, uid: userRecord.uid })
  } catch (e) {
    console.error('[create-staff-user]', e)
    if (e.code === 'auth/email-already-exists')
      return res.status(400).json({ error: 'This email is already registered.' })
    return res.status(500).json({ error: e.message || 'Failed to create user' })
  }
}
