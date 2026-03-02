// cloudflare-worker/webhook.js
// Deploy this as a Cloudflare Worker at: mediflow-webhook.synergyconsultant.co.in
// Register the URL in AiSynergy dashboard > Settings > Webhook URL
//
// Environment Variables to set in Cloudflare Worker:
//   FIREBASE_PROJECT_ID  = your Firebase project ID (e.g. mediflow-prod)
//   FIREBASE_WEB_API_KEY = your Firebase web API key
//   FIREBASE_SA_TOKEN    = service account token (for Firestore REST API)

export default {
  async fetch(request, env) {
    // ── CORS ──────────────────────────────────────────────────────────
    const headers = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }

    if (request.method === 'OPTIONS') return new Response(null, { headers })

    const url = new URL(request.url)

    // ── HEALTH CHECK ──────────────────────────────────────────────────
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', service: 'MediFlow Webhook' }), { headers })
    }

    // ── AISYNERGY INBOUND WEBHOOK ────────────────────────────────────
    if (request.method === 'POST' && url.pathname === '/whatsapp-webhook') {
      try {
        const body = await request.json()

        // AiSynergy webhook payload fields:
        // waId, profileName, message, messageType, timestamp,
        // campaignName (if reply to campaign), buttonReply, listReply

        const phone = body.waId || body.destination || ''
        const profileName = body.profileName || body.senderName || ''
        const message = body.message || body.text || ''
        const messageType = body.messageType || 'text'
        const campaignName = body.campaignName || ''

        if (!phone) {
          return new Response(JSON.stringify({ error: 'No phone number' }), { status: 400, headers })
        }

        // Detect intent from message keywords
        const msgLower = message.toLowerCase()
        let intent = 'general'
        if (/appointment|book|slot|schedule|consult/.test(msgLower)) intent = 'appointment'
        else if (/report|result|test result|lab/.test(msgLower)) intent = 'report'
        else if (/price|cost|fee|charge|rate|how much/.test(msgLower)) intent = 'price'
        else if (/hi|hello|helo|namaste|help/.test(msgLower)) intent = 'general'

        // Write to Firestore via REST API
        const cleanPhone = phone.replace(/\D/g, '')
        const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/leads/${cleanPhone}`

        // Check if lead exists first
        const existingResp = await fetch(firestoreUrl, {
          headers: { 'Authorization': `Bearer ${env.FIREBASE_SA_TOKEN}` }
        })

        if (existingResp.ok) {
          // Update existing lead
          const existing = await existingResp.json()
          const existingCount = existing.fields?.messageCount?.integerValue || 0

          await fetch(`${firestoreUrl}?updateMask.fieldPaths=lastMessage&updateMask.fieldPaths=lastMessageAt&updateMask.fieldPaths=messageCount&updateMask.fieldPaths=intent`, {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${env.FIREBASE_SA_TOKEN}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              fields: {
                lastMessage: { stringValue: message.slice(0, 500) },
                lastMessageAt: { timestampValue: new Date().toISOString() },
                messageCount: { integerValue: parseInt(existingCount) + 1 },
                intent: { stringValue: intent }
              }
            })
          })
        } else {
          // Create new lead
          await fetch(firestoreUrl, {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${env.FIREBASE_SA_TOKEN}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              fields: {
                phone: { stringValue: cleanPhone },
                profileName: { stringValue: profileName },
                lastMessage: { stringValue: message.slice(0, 500) },
                messageType: { stringValue: messageType },
                intent: { stringValue: intent },
                repliedToCampaign: { stringValue: campaignName },
                messageCount: { integerValue: 1 },
                status: { stringValue: 'new' },
                createdAt: { timestampValue: new Date().toISOString() },
                lastMessageAt: { timestampValue: new Date().toISOString() }
              }
            })
          })
        }

        return new Response(JSON.stringify({ success: true, phone: cleanPhone, intent }), { headers })

      } catch (err) {
        console.error('Webhook error:', err)
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers })
      }
    }

    // ── AISYNERGY DIRECT SEND PROXY ──────────────────────────────────
    // Proxies WhatsApp sends from the app so the API key is never exposed in browser
    if (request.method === 'POST' && url.pathname === '/send-whatsapp') {
      try {
        const body = await request.json()
        const { apiKey, campaignName, destination, userName, templateParams, media, source, tags, attributes } = body

        if (!apiKey || !campaignName || !destination) {
          return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400, headers })
        }

        const payload = {
          apiKey,
          campaignName,
          destination: destination.replace(/\D/g, '').replace(/^0/, '91'),
          userName: userName || '',
          source: source || 'mediflow',
        }
        if (templateParams?.length) payload.templateParams = templateParams
        if (media?.url) payload.media = media
        if (tags?.length) payload.tags = tags
        if (attributes) payload.attributes = attributes

        const resp = await fetch('https://backend.api-wa.co/campaign/aisynergy/api/v2', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })

        const result = await resp.text()
        return new Response(result, { status: resp.status, headers })
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers })
      }
    }

    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers })
  }
}

/**
 * DEPLOYMENT STEPS:
 *
 * 1. Go to Cloudflare Dashboard > Workers > Create Worker
 * 2. Paste this code
 * 3. Set Environment Variables:
 *    - FIREBASE_PROJECT_ID = mediflow-prod (or your project ID)
 *    - FIREBASE_SA_TOKEN   = Generate from: Firebase Console > Project Settings > Service Accounts
 *                           > Generate New Private Key, then use the token
 * 4. Add custom domain: mediflow-webhook.synergyconsultant.co.in
 * 5. Register webhook URL in AiSynergy: https://mediflow-webhook.synergyconsultant.co.in/whatsapp-webhook
 *
 * FIREBASE SERVICE ACCOUNT TOKEN:
 * - Go to Firebase Console > Project Settings > Service Accounts
 * - Click "Generate New Private Key" — downloads a JSON file
 * - Use the private_key and client_email from that JSON to generate a token:
 *   Use google-auth-library or a JWT library to create a short-lived token
 *   OR use Firebase Admin SDK in a separate Cloud Function
 *
 * EASIER ALTERNATIVE (using Firestore REST with Web API Key):
 * - Replace the Firestore REST calls above with calls to your Firebase project
 *   using the web API key (less secure but simpler for MVP)
 */
