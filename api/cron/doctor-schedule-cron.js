// api/cron/doctor-schedule.js
// Vercel cron job — runs every night at 9 PM IST (3:30 PM UTC)
// Sends tomorrow's appointment schedule to each doctor via WhatsApp

import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

// ── Firebase Admin init ───────────────────────────────────────────────────────
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId:    process.env.FIREBASE_PROJECT_ID,
      clientEmail:  process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:   process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    })
  })
}
const db = getFirestore()

const AISYNERGY_URL = 'https://backend.api-wa.co/campaign/aisynergy/api/v2'
const DAYS_FULL = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
const MONTHS    = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// ── Send plain WA message ─────────────────────────────────────────────────────
async function sendPlainWA(apiKey, to, message) {
  try {
    const res = await fetch(AISYNERGY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiKey,
        campaignName: 'mediflow_plain_text',
        destination:  to.replace(/\D/g, ''),
        userName:     'MEDIFLOW',
        templateParams: [message],
        source:       'mediflow',
        media:        {},
        attributes:   {},
        paramsFallbackValue: { FirstName: 'Doctor' }
      })
    })
    return await res.json()
  } catch (e) {
    console.error('sendPlainWA error:', e)
    return null
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  // Verify cron secret so this can't be triggered by anyone externally
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  // Tomorrow's date string
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const dateStr   = tomorrow.toISOString().split('T')[0]
  const dateLabel = DAYS_FULL[tomorrow.getDay()] + ', ' + tomorrow.getDate() + ' ' + MONTHS[tomorrow.getMonth()] + ' ' + tomorrow.getFullYear()

  const results = []

  try {
    // Get all active centres
    const centresSnap = await db.collection('clients').get()

    for (const centreDoc of centresSnap.docs) {
      const centreId = centreDoc.id

      // Get centre profile
      const profileSnap = await db
        .collection('clients').doc(centreId).get()

      if (!profileSnap.exists) continue
      const profile = profileSnap.data()

      // Skip if not a clinic or no API key
      const centreType = profile.centreType || 'diagnostic'
      if (centreType === 'diagnostic') continue
      if (!profile.aisynergyApiKey) continue

      const doctors    = profile.doctors    || []
      const centreName = profile.centreName || 'Clinic'
      const apiKey     = profile.aisynergyApiKey

      // Get tomorrow's appointments
      const apptSnap = await db
        .collection('clients').doc(centreId)
        .collection('appointments')
        .where('date', '==', dateStr)
        .where('status', 'in', ['scheduled', 'confirmed'])
        .get()

      const appointments = apptSnap.docs
        .map(d => d.data())
        .sort((a, b) => (a.appointmentTime || '').localeCompare(b.appointmentTime || ''))

      if (appointments.length === 0) {
        // Still notify doctor — no appointments tomorrow
        for (const doctor of doctors) {
          if (!doctor.phone || doctor.phone.length < 10) continue
          const msg = `🏥 ${centreName}\n\nHi ${doctor.name},\n\nYou have *no appointments* scheduled for tomorrow (${dateLabel}).\n\nHave a great day! 😊`
          await sendPlainWA(apiKey, '91' + doctor.phone, msg)
          results.push({ centreId, doctor: doctor.name, sent: true, count: 0 })
        }
        continue
      }

      // Build appointment list string
      const apptList = appointments
        .map((a, i) => `${i + 1}. ${a.appointmentTime} — ${a.patientName}${a.age ? ' (' + a.age + 'y)' : ''}${a.visitType ? ' · ' + a.visitType : ''}`)
        .join('\n')

      // Send to each doctor who has a phone number
      for (const doctor of doctors) {
        if (!doctor.phone || doctor.phone.length < 10) continue

        // Filter appointments for this doctor if doctorName is set, else send all
        const docAppts = appointments.filter(a =>
          !a.doctorName || a.doctorName === doctor.name
        )
        if (docAppts.length === 0) continue

        const docApptList = docAppts
          .map((a, i) => `${i + 1}. ${a.appointmentTime} — ${a.patientName}${a.age ? ' (' + a.age + 'y)' : ''}${a.visitType ? ' · ' + a.visitType : ''}`)
          .join('\n')

        const msg = `🏥 *${centreName}*\n\nHi ${doctor.name}, here is your schedule for tomorrow:\n📅 *${dateLabel}*\n\n${docApptList}\n\n*Total: ${docAppts.length} appointment${docAppts.length !== 1 ? 's' : ''}*\n\nIf you are unavailable, please call the clinic. Have a good night! 🌙`

        await sendPlainWA(apiKey, '91' + doctor.phone, msg)
        results.push({ centreId, doctor: doctor.name, sent: true, count: docAppts.length })
      }
    }

    console.log('[doctor-schedule-cron] Done:', results)
    return res.status(200).json({ ok: true, processed: results.length, results })

  } catch (e) {
    console.error('[doctor-schedule-cron] Error:', e)
    return res.status(500).json({ ok: false, error: e.message })
  }
}
