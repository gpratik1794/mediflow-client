// src/firebase/campaigns.js
// Campaign Manager — stores WhatsApp campaign configs in Firestore
// Each campaign: { name, paramCount, description, addedAt }

import { db } from './config'
import { collection, doc, setDoc, getDocs, deleteDoc, serverTimestamp } from 'firebase/firestore'

export async function getCampaigns(centreId) {
  const snap = await getDocs(collection(db, 'centres', centreId, 'campaigns'))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export async function saveCampaign(centreId, campaign) {
  // campaign: { name, paramCount, description }
  const ref = doc(db, 'centres', centreId, 'campaigns', campaign.name)
  await setDoc(ref, { ...campaign, updatedAt: serverTimestamp() }, { merge: true })
}

export async function deleteCampaign(centreId, campaignName) {
  await deleteDoc(doc(db, 'centres', centreId, 'campaigns', campaignName))
}

// Send a WhatsApp message using a campaign config
// params: array of values matching the template's {{1}}, {{2}}, etc.
export async function sendCampaignMessage(apiKey, phone, campaign, params) {
  try {
    const digits = phone.replace(/\D/g, '')
    const destination = digits.startsWith('91') && digits.length === 12
      ? digits : '91' + digits.slice(-10)

    const payload = {
      apiKey,
      campaignName: campaign.name,
      destination,
      userName: 'AISYNERGY',
      templateParams: params.slice(0, campaign.paramCount),
      source: 'mediflow',
      media: campaign.mediaUrl
        ? { url: campaign.mediaUrl, filename: campaign.mediaFilename || 'document' }
        : {},
      attributes: {},
      paramsFallbackValue: { FirstName: params[0] || 'user' }
    }

    console.log('[WhatsApp] Sending:', JSON.stringify(payload))
    const res = await fetch('https://backend.api-wa.co/campaign/aisynergy/api/v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    const text = await res.text()
    console.log('[WhatsApp] Response:', res.status, text)
    return { ok: res.ok, status: res.status, message: text }
  } catch (e) {
    console.error('[WhatsApp] Error:', e)
    return { ok: false, message: e.message }
  }
}
