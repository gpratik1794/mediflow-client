// src/firebase/whatsapp.js
// Central WhatsApp utility — parses stored cURL configs and sends messages

/**
 * Parse a raw cURL string into a config object
 */
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
  } catch (e) {
    return null
  }
}

/**
 * Upload a base64 PDF to tmpfiles.org and return a public URL
 * Used to send uploaded report PDFs via WhatsApp
 */
export async function uploadPdfForWhatsApp(base64DataUrl, filename) {
  try {
    // Convert base64 data URL to Blob
    const res = await fetch(base64DataUrl)
    const blob = await res.blob()
    const formData = new FormData()
    formData.append('file', blob, filename || 'report.pdf')
    const upload = await fetch('https://tmpfiles.org/api/v1/upload', {
      method: 'POST',
      body: formData
    })
    const json = await upload.json()
    if (json?.data?.url) {
      // tmpfiles gives https://tmpfiles.org/XXXXX/file.pdf
      // Direct download is https://tmpfiles.org/dl/XXXXX/file.pdf
      const directUrl = json.data.url.replace('tmpfiles.org/', 'tmpfiles.org/dl/')
      return directUrl
    }
    return null
  } catch (e) {
    console.error('[WhatsApp] PDF upload failed:', e)
    return null
  }
}

/**
 * Send a WhatsApp message using a stored campaign config
 * @param campaigns  - profile.whatsappCampaigns array
 * @param purpose    - 'bill_generated' | 'report_ready' | 'appt_confirm' | 'followup'
 * @param phone      - patient phone number
 * @param params     - template params array
 * @param mediaOverride - optional { url, filename } to override cURL media
 */
export async function sendCampaign(campaigns, purpose, phone, params, mediaOverride) {
  if (!campaigns?.length) return { ok: false, error: 'No campaigns configured. Add campaigns in Settings → WhatsApp Campaigns.' }

  const campaign = campaigns.find(c => c.purpose === purpose)
  if (!campaign) return { ok: false, error: `No campaign configured for "${purpose}". Add it in Settings → WhatsApp Campaigns.` }

  const config = parseCurl(campaign.curl)
  if (!config) return { ok: false, error: `Could not parse cURL for "${campaign.name}". Check the cURL in Settings.` }
  if (!config.apiKey) return { ok: false, error: 'No API key found in cURL.' }

  const digits = phone.replace(/\D/g, '')
  const destination = digits.startsWith('91') && digits.length === 12
    ? digits
    : '91' + digits.slice(-10)

  // Use override media if provided, otherwise use media from cURL
  let media = {}
  if (mediaOverride?.url) {
    media = { url: mediaOverride.url, filename: mediaOverride.filename || 'report.pdf' }
  } else if (config.hasMedia) {
    media = { url: config.mediaUrl, filename: config.mediaFilename }
  }

  const payload = {
    apiKey:       config.apiKey,
    campaignName: config.campaignName,
    destination,
    userName:     'AISYNERGY',
    templateParams: params,
    source:       'mediflow',
    media,
    attributes:   {},
    paramsFallbackValue: { FirstName: params[0] || 'user' }
  }

  try {
    console.log('[WhatsApp] Sending campaign:', config.campaignName, JSON.stringify(payload))
    const res = await fetch('https://backend.api-wa.co/campaign/aisynergy/api/v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    const text = await res.text()
    console.log('[WhatsApp] Response:', res.status, text)
    if (res.ok) return { ok: true }
    return { ok: false, error: `API ${res.status}: ${text}` }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}
