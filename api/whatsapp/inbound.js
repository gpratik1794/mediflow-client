// api/whatsapp/inbound.js
// Vercel serverless function — receives AiSynergy inbound WhatsApp webhooks
// Deploy URL: https://mediflow.synergyconsultant.co.in/api/whatsapp/inbound
// Set this URL in AiSynergy dashboard → Settings → Webhook URL

import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

// Init Firebase Admin (only once per cold start)
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    })
  })
}
const admin = getFirestore()

export default async function handler(req, res) {
  // AiSynergy sends POST — only accept POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const payload = req.body
    const phone   = (payload.waId || '').replace(/\D/g, '').slice(-10)
    const message = payload.message?.text || '[non-text]'
    const sender  = payload.senderName || 'Patient'
    const today   = new Date().toISOString().split('T')[0]

    if (!phone) return res.status(200).json({ ok: true, skipped: 'no phone' })

    // Find which centre this phone belongs to (today's visit or appointment)
    // We search all centres — in practice, each AiSynergy account is one centre
    // so pass centreId as query param: ?centreId=xxx
    const centreId = req.query.centreId || payload.centreId
    if (!centreId) return res.status(200).json({ ok: true, skipped: 'no centreId' })

    const logEntry = {
      phone, sender, message,
      receivedAt: FieldValue.serverTimestamp()
    }

    // Try to match to today's visit
    const visitsSnap = await admin
      .collection('centres').doc(centreId).collection('visits')
      .where('phone', '==', phone).where('date', '==', today).limit(1).get()

    if (!visitsSnap.empty) {
      const v = visitsSnap.docs[0]
      await admin.collection('centres').doc(centreId)
        .collection('whatsappInbound').add({
          ...logEntry, visitId: v.id, patientName: v.data().patientName || sender
        })
      return res.status(200).json({ ok: true, matched: 'visit', visitId: v.id })
    }

    // Try to match to today's appointment
    const apptSnap = await admin
      .collection('centres').doc(centreId).collection('appointments')
      .where('phone', '==', phone).where('date', '==', today).limit(1).get()

    if (!apptSnap.empty) {
      const a = apptSnap.docs[0]
      await admin.collection('centres').doc(centreId)
        .collection('whatsappInbound').add({
          ...logEntry, apptId: a.id, patientName: a.data().patientName || sender
        })
      return res.status(200).json({ ok: true, matched: 'appointment', apptId: a.id })
    }

    // No match — log unlinked for admin review
    await admin.collection('centres').doc(centreId)
      .collection('whatsappInbound').add({ ...logEntry, unlinked: true })

    return res.status(200).json({ ok: true, matched: 'none_unlinked' })
  } catch (e) {
    console.error('[Inbound Webhook]', e)
    return res.status(200).json({ ok: true, error: e.message }) // always 200 to AiSynergy
  }
}
