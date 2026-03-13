// api/delete-staff-user.js
const { initializeApp, getApps, cert } = require('firebase-admin/app')
const { getAuth } = require('firebase-admin/auth')
const { getFirestore } = require('firebase-admin/firestore')

function initAdmin() {
  if (getApps().length > 0) return
  const privateKey = process.env.FIREBASE_PRIVATE_KEY
    ?.replace(/\\n/g, '\n')
    ?.replace(/^"|"$/g, '')

  initializeApp({
    credential: cert({
      projectId:   process.env.VITE_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey,
    })
  })
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json')

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { staffUid, centreId } = req.body || {}

  if (!staffUid || !centreId)
    return res.status(400).json({ error: 'Missing staffUid or centreId' })

  try {
    initAdmin()
    const adminAuth = getAuth()
    const adminDb   = getFirestore()

    // Verify the staff member belongs to this centre before deleting
    const staffDoc = await adminDb.collection('staffUsers').doc(staffUid).get()
    if (!staffDoc.exists || staffDoc.data().centreId !== centreId)
      return res.status(403).json({ error: 'Not authorised to delete this staff member' })

    // Delete from Firebase Auth
    await adminAuth.deleteUser(staffUid)

    // Delete staffUsers doc
    await adminDb.collection('staffUsers').doc(staffUid).delete()

    return res.status(200).json({ ok: true })
  } catch (e) {
    console.error('[delete-staff-user]', e)
    return res.status(500).json({ error: e.message || 'Failed to delete user' })
  }
}
