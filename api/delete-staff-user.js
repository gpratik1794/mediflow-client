// api/delete-staff-user.js
import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

function initAdmin() {
  if (getApps().length > 0) return
  initializeApp({
    credential: cert({
      projectId:   process.env.VITE_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    })
  })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const { staffUid, centreId } = req.body
  if (!staffUid || !centreId) return res.status(400).json({ error: 'Missing fields' })
  try {
    initAdmin()
    const adminAuth = getAuth()
    const adminDb   = getFirestore()
    // Verify this staff belongs to this centre before deleting
    const doc = await adminDb.collection('staffUsers').doc(staffUid).get()
    if (!doc.exists || doc.data().centreId !== centreId)
      return res.status(403).json({ error: 'Not authorized' })
    await adminAuth.deleteUser(staffUid)
    await adminDb.collection('staffUsers').doc(staffUid).delete()
    return res.status(200).json({ ok: true })
  } catch (e) {
    console.error('[delete-staff-user]', e)
    return res.status(500).json({ error: e.message })
  }
}
