// src/firebase/whatsapp.js
// Central WhatsApp utility — parse, send, log, inbound

import { db } from './config'
import { collection, addDoc, serverTimestamp, query, where, getDocs, orderBy, limit } from 'firebase/firestore'

// ── cURL Parser ───────────────────────────────────────────────────────────────

export function parseCurl(curlStr) {
  try {
    const match = curlStr.match(/-d\s+'([\s\S]*?)'\s+https?:\/\//s) ||
                  curlStr.match(/-d\s+"([\s\S]*?)"\s+https?:\/\//s)
    if (!match) return null
    const body = JSON.parse(match[1])
    return {
      apiKey:        body.apiKey       || '',
      campaignName:  body.campaignName || '',
      paramCount:    Array.isArray(body.templateParams) ? body.templateParams.length : 1,
      hasMedia:      !!(body.media?.url),
      mediaUrl:      body.media?.url      || '',
      mediaFilename: body.media?.filename || '',
    }
  } catch { return null }
}

// ── PDF Upload (for WhatsApp media) ──────────────────────────────────────────

export async function uploadPdfForWhatsApp(base64DataUrl, filename) {
  try {
    const res  = await fetch(base64DataUrl)
    const blob = await res.blob()
    const formData = new FormData()
    formData.append('file', blob, filename || 'report.pdf')
    const upload = await fetch('https://tmpfiles.org/api/v1/upload', { method: 'POST', body: formData })
    const json = await upload.json()
    if (json?.data?.url) {
      return json.data.url.replace('tmpfiles.org/', 'tmpfiles.org/dl/')
    }
    return null
  } catch (e) {
    console.error('[WhatsApp] PDF upload failed:', e)
    return null
  }
}

// ── Outbound Log ─────────────────────────────────────────────────────────────

/**
 * Log a WhatsApp send attempt to Firestore
 * Path: centres/{uid}/whatsappLogs/{auto-id}
 */
async function logSend(centreId, { purpose, phone, patientName, campaignName, params, status, error, visitId, apptId }) {
  if (!centreId) return
  try {
    await addDoc(collection(db, 'centres', centreId, 'whatsappLogs'), {
      purpose, phone, patientName: patientName || '',
      campaignName, params, status,  // 'sent' | 'failed'
      error: error || null,
      visitId: visitId || null,
      apptId:  apptId  || null,
      sentAt:  serverTimestamp()
    })
  } catch (e) {
    console.error('[WhatsApp] Log failed:', e)
  }
}

/**
 * Fetch WhatsApp logs for a specific visit or appointment
 */
export async function getWhatsAppLogs(centreId, { visitId, apptId } = {}) {
  if (!centreId) return []
  try {
    const ref = collection(db, 'centres', centreId, 'whatsappLogs')
    let q
    if (visitId) {
      q = query(ref, where('visitId', '==', visitId), orderBy('sentAt', 'desc'), limit(20))
    } else if (apptId) {
      q = query(ref, where('apptId', '==', apptId), orderBy('sentAt', 'desc'), limit(20))
    } else {
      q = query(ref, orderBy('sentAt', 'desc'), limit(50))
    }
    const snap = await getDocs(q)
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
  } catch { return [] }
}

// ── Send Campaign ─────────────────────────────────────────────────────────────

/**
 * Send a WhatsApp message using a stored campaign config
 * @param campaigns    - profile.whatsappCampaigns array
 * @param purpose      - 'bill_generated' | 'report_ready' | 'appt_confirm' | 'followup'
 * @param phone        - patient phone number
 * @param params       - template params array
 * @param mediaOverride - optional { url, filename }
 * @param logContext   - optional { centreId, patientName, visitId, apptId } for logging
 */
export async function sendCampaign(campaigns, purpose, phone, params, mediaOverride, logContext) {
  const fail = (error) => {
    if (logContext?.centreId) {
      logSend(logContext.centreId, {
        purpose, phone, patientName: logContext.patientName,
        campaignName: '—', params, status: 'failed', error,
        visitId: logContext.visitId, apptId: logContext.apptId
      })
    }
    return { ok: false, error }
  }

  if (!campaigns?.length)
    return fail('No campaigns configured. Add campaigns in Settings → WhatsApp Campaigns.')

  const campaign = campaigns.find(c => c.purpose === purpose)
  if (!campaign)
    return fail(`No campaign configured for "${purpose}". Add it in Settings → WhatsApp Campaigns.`)

  // Respect paused toggle
  if (campaign.enabled === false)
    return { ok: false, error: `Campaign "${campaign.name}" is paused. Enable it in Settings → WhatsApp Campaigns.`, paused: true }

  const config = parseCurl(campaign.curl)
  if (!config)    return fail(`Could not parse cURL for "${campaign.name}". Check the cURL in Settings.`)
  if (!config.apiKey) return fail('No API key found in cURL.')

  const digits = phone.replace(/\D/g, '')
  const destination = digits.startsWith('91') && digits.length === 12
    ? digits : '91' + digits.slice(-10)

  let media = {}
  if (mediaOverride?.url) {
    media = { url: mediaOverride.url, filename: mediaOverride.filename || 'report.pdf' }
  } else if (config.hasMedia) {
    media = { url: config.mediaUrl, filename: config.mediaFilename }
  }

  const payload = {
    apiKey: config.apiKey, campaignName: config.campaignName,
    destination, userName: 'AISYNERGY',
    templateParams: params, source: 'mediflow',
    media, attributes: {},
    paramsFallbackValue: { FirstName: params[0] || 'user' }
  }

  try {
    console.log('[WhatsApp] Sending:', config.campaignName, payload)
    const res  = await fetch('https://backend.api-wa.co/campaign/aisynergy/api/v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    const text = await res.text()
    console.log('[WhatsApp] Response:', res.status, text)

    if (res.ok) {
      if (logContext?.centreId) {
        logSend(logContext.centreId, {
          purpose, phone, patientName: logContext.patientName,
          campaignName: config.campaignName, params, status: 'sent',
          visitId: logContext.visitId, apptId: logContext.apptId
        })
      }
      return { ok: true }
    }
    return fail(`API ${res.status}: ${text}`)
  } catch (e) {
    return fail(e.message)
  }
}

// ── Inbound Handler ───────────────────────────────────────────────────────────

/**
 * Process an inbound WhatsApp message from AiSynergy webhook
 * Called by api/whatsapp/inbound.js Vercel function
 * Matches phone to a visit or appointment and logs the message
 *
 * Payload shape from AiSynergy:
 * { waId, senderName, message: { type, text }, timestamp }
 */
export async function handleInbound(centreId, payload) {
  const phone   = payload.waId?.replace(/\D/g, '').slice(-10) || ''
  const message = payload.message?.text || '[non-text message]'
  const sender  = payload.senderName || 'Patient'
  const today   = new Date().toISOString().split('T')[0]

  if (!phone || !centreId) return

  // Log to inbound log regardless
  const logEntry = {
    phone, sender, message, raw: payload,
    receivedAt: serverTimestamp()
  }

  // Try to find today's visit for this phone
  try {
    const visitsRef  = collection(db, 'centres', centreId, 'visits')
    const visitSnap  = await getDocs(query(visitsRef, where('phone', '==', phone), where('date', '==', today), limit(1)))

    if (!visitSnap.empty) {
      const visitDoc = visitSnap.docs[0]
      await addDoc(collection(db, 'centres', centreId, 'whatsappInbound'), {
        ...logEntry, visitId: visitDoc.id, patientName: visitDoc.data().patientName
      })
      return
    }

    // Try today's appointment
    const apptRef  = collection(db, 'centres', centreId, 'appointments')
    const apptSnap = await getDocs(query(apptRef, where('phone', '==', phone), where('date', '==', today), limit(1)))

    if (!apptSnap.empty) {
      const apptDoc = apptSnap.docs[0]
      await addDoc(collection(db, 'centres', centreId, 'whatsappInbound'), {
        ...logEntry, apptId: apptDoc.id, patientName: apptDoc.data().patientName
      })
      return
    }

    // No match — log unlinked
    await addDoc(collection(db, 'centres', centreId, 'whatsappInbound'), logEntry)
  } catch (e) {
    console.error('[WhatsApp Inbound]', e)
  }
}

/**
 * Fetch inbound messages for a specific visit or appointment
 */
export async function getInboundMessages(centreId, { visitId, apptId } = {}) {
  if (!centreId) return []
  try {
    const ref = collection(db, 'centres', centreId, 'whatsappInbound')
    let q
    if (visitId) {
      q = query(ref, where('visitId', '==', visitId), orderBy('receivedAt', 'desc'), limit(20))
    } else if (apptId) {
      q = query(ref, where('apptId', '==', apptId), orderBy('receivedAt', 'desc'), limit(20))
    } else {
      return []
    }
    const snap = await getDocs(q)
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
  } catch { return [] }
}
