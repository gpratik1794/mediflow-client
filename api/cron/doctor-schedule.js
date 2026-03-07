// api/cron/doctor-schedule.js
// Vercel cron — runs every 30 mins 7 AM–11 PM IST (1:30 AM–5:30 PM UTC)
// Checks each doctor's scheduleNotifyTime and sends only when it matches current half-hour

import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    })
  })
}
const db = getFirestore()

const AISYNERGY_URL = 'https://backend.api-wa.co/campaign/aisynergy/api/v2'
const DAYS_FULL = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
const MONTHS    = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// ── Send via approved template: mediflow_doctor_schedule ─────────────────────
// Template params: {{1}} doctorName, {{2}} centreName, {{3}} dateLabel,
//                 {{4}} appointmentList, {{5}} total
async function sendScheduleWA(apiKey, to, { doctorName, centreName, dateLabel, apptList, total }) {
  try {
    const res = await fetch(AISYNERGY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiKey,
        campaignName:  'mediflow_doctor_schedule',
        destination:   to.replace(/\D/g, ''),
        userName:      'MEDIFLOW',
        templateParams: [doctorName, centreName, dateLabel, apptList, String(total)],
        source:        'mediflow',
        media:         {},
        attributes:    {},
        paramsFallbackValue: { FirstName: doctorName }
      })
    })
    const data = await res.json()
    console.log('[sendScheduleWA]', to, data)
    return data
  } catch (e) {
    console.error('[sendScheduleWA] error:', e)
    return null
  }
}

// ── Current IST half-hour slot e.g. "21:00" or "21:30" ───────────────────────
function currentISTSlot() {
  const now = new Date()
  // IST = UTC + 5:30
  const istMs  = now.getTime() + (5.5 * 60 * 60 * 1000)
  const istDate = new Date(istMs)
  const h  = istDate.getUTCHours()
  const m  = istDate.getUTCMinutes()
  // Round down to nearest 30-min slot
  const slot = m < 30 ? '00' : '30'
  return `${String(h).padStart(2,'0')}:${slot}`
}

// ── Tomorrow's date in IST ────────────────────────────────────────────────────
function tomorrowIST() {
  const now = new Date()
  const istMs   = now.getTime() + (5.5 * 60 * 60 * 1000)
  const istDate = new Date(istMs)
  istDate.setUTCDate(istDate.getUTCDate() + 1)
  const yyyy = istDate.getUTCFullYear()
  const mm   = String(istDate.getUTCMonth() + 1).padStart(2,'0')
  const dd   = String(istDate.getUTCDate()).padStart(2,'0')
  const dateStr   = `${yyyy}-${mm}-${dd}`
  const dateLabel = DAYS_FULL[istDate.getUTCDay()] + ', ' + istDate.getUTCDate() + ' ' + MONTHS[istDate.getUTCMonth()] + ' ' + yyyy
  return { dateStr, dateLabel }
}

// ── Dedup key: one send per doctor per date ───────────────────────────────────
async function alreadySent(centreId, doctorPhone, dateStr) {
  const key  = `${centreId}_${doctorPhone}_${dateStr}`
  const ref  = db.collection('cronLogs').doc(key)
  const snap = await ref.get()
  if (snap.exists) return true
  await ref.set({ sentAt: FieldValue.serverTimestamp(), centreId, doctorPhone, dateStr })
  return false
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const currentSlot          = currentISTSlot()
  const { dateStr, dateLabel } = tomorrowIST()

  console.log(`[doctor-schedule] slot=${currentSlot} tomorrow=${dateStr}`)

  const results = []

  try {
    // All active client UIDs
    const clientsSnap = await db.collection('clients').get()

    for (const clientDoc of clientsSnap.docs) {
      const centreId = clientDoc.id
      const clientData = clientDoc.data()

      // Skip non-clinic, skip if no modules or inactive
      if (clientData.centreType === 'diagnostic') continue

      // Load profile from correct path: centres/{uid}/profile/main
      const profileSnap = await db
        .collection('centres').doc(centreId)
        .collection('profile').doc('main')
        .get()

      if (!profileSnap.exists) continue
      const profile = profileSnap.data()

      if (!profile.aisynergyApiKey) continue

      const doctors    = profile.doctors    || []
      const centreName = profile.centreName || clientData.centreName || 'Clinic'
      const apiKey     = profile.aisynergyApiKey

      // Load tomorrow's appointments from correct path
      const apptSnap = await db
        .collection('centres').doc(centreId)
        .collection('appointments')
        .where('date', '==', dateStr)
        .where('status', 'in', ['scheduled', 'confirmed'])
        .get()

      const allAppts = apptSnap.docs
        .map(d => d.data())
        .sort((a, b) => (a.appointmentTime || '').localeCompare(b.appointmentTime || ''))

      for (const doctor of doctors) {
        if (!doctor.phone || doctor.phone.replace(/\D/g,'').length < 10) continue

        // Only fire if this doctor's scheduleNotifyTime matches current 30-min slot
        const notifyTime = doctor.scheduleNotifyTime || '21:00'
        // Normalize to HH:MM
        const [nh, nm] = notifyTime.split(':').map(Number)
        const slotMin  = nm < 30 ? '00' : '30'
        const doctorSlot = `${String(nh).padStart(2,'0')}:${slotMin}`

        if (doctorSlot !== currentSlot) continue

        // Dedup — skip if already sent today
        const phone = doctor.phone.replace(/\D/g,'')
        if (await alreadySent(centreId, phone, dateStr)) {
          console.log(`[doctor-schedule] skip duplicate: ${doctor.name} ${dateStr}`)
          continue
        }

        // Filter appointments for this doctor
        const docAppts = allAppts.filter(a =>
          !a.doctorName || a.doctorName === doctor.name
        )

        const apptListStr = docAppts.length === 0
          ? 'No appointments scheduled'
          : docAppts
              .map((a, i) => `${i+1}. ${a.appointmentTime} - ${a.patientName}${a.age ? ' ('+a.age+'y)' : ''}${a.visitType ? ' · '+a.visitType : ''}`)
              .join('\n')

        await sendScheduleWA(apiKey, '91' + phone, {
          doctorName:  doctor.name,
          centreName,
          dateLabel,
          apptList:    apptListStr,
          total:       docAppts.length,
        })

        results.push({ centreId, doctor: doctor.name, slot: currentSlot, count: docAppts.length })
      }
    }

    console.log('[doctor-schedule] done:', results)
    return res.status(200).json({ ok: true, slot: currentSlot, fired: results.length, results })

  } catch (e) {
    console.error('[doctor-schedule] error:', e)
    return res.status(500).json({ ok: false, error: e.message })
  }
}
