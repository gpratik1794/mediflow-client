# MediFlow v3 — Deployment Guide

## What's New in v3
- Admin panel at /admin — create and manage all client accounts
- PDF report upload in diagnostic module — sends actual PDF on WhatsApp
- Forgot password flow on login screen
- Public registration removed — admin creates all accounts
- Subscription gate — deactivated/expired accounts are blocked immediately
- Leads inbox in admin panel for inbound WhatsApp messages
- Cloudflare Worker webhook for AiSynergy inbound messages
- Correct AiSynergy API endpoint throughout

---

## Step 1 — Firebase: Enable Storage

Firebase Console → Storage → Get Started → Production mode → asia-south1

Storage Rules (Firebase Console → Storage → Rules):
```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /reports/{centreId}/{visitId}/{fileName} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.uid == centreId;
    }
  }
}
```

---

## Step 2 — Environment Variables

Copy .env.example to .env.local and fill in all values from Firebase Console.
Also add VITE_ADMIN_UID after creating your admin account in step 3.

---

## Step 3 — Create Your Admin Account

1. Firebase Console → Authentication → Add user manually
2. Enter your admin email and password
3. Copy the UID shown in the user row
4. Set VITE_ADMIN_UID = that UID in .env.local AND in Vercel env vars

---

## Step 4 — Deploy to Vercel

```bash
npm install
npm run build      # verify build succeeds
npx vercel --prod  # or push to GitHub and connect Vercel
```

Add all .env.local variables to Vercel → Project Settings → Environment Variables.

---

## Step 5 — Custom Domain (Cloudflare)

1. Vercel → Domains → Add mediflow.synergyconsultant.co.in
2. Vercel gives you: CNAME → cname.vercel-dns.com
3. Cloudflare DNS → Add CNAME:
   - Name: mediflow
   - Target: cname.vercel-dns.com
   - Proxy: OFF (grey cloud) ← critical
4. SSL auto-provisions in ~2 minutes

---

## Step 6 — Admin Panel: Add First Client

1. Go to mediflow.synergyconsultant.co.in/admin
2. Sign in with your admin credentials
3. Click "+ Add Client"
4. Fill in centre details, plan, dates
5. Submit — Firebase creates the auth account, sends password setup email to client
6. Client receives email, clicks link, sets password, logs in

---

## Step 7 — Cloudflare Worker for WhatsApp Webhook (for Leads Inbox)

1. Cloudflare → Workers → Create Worker
2. Paste code from cloudflare-worker/webhook.js
3. Set environment variables:
   - FIREBASE_PROJECT_ID = your Firebase project ID
   - FIREBASE_SA_TOKEN = service account token (from Firebase Console → Project Settings → Service Accounts → Generate New Private Key)
4. Add custom route: mediflow-webhook.synergyconsultant.co.in/*
5. AiSynergy Dashboard → Settings → Webhook URL:
   https://mediflow-webhook.synergyconsultant.co.in/whatsapp-webhook

---

## Step 8 — AiSynergy Campaigns

The API requires "Live" campaigns (not just approved templates).
Create these campaign names in AiSynergy dashboard:

- mediflow_report_ready       → 2 params: patient name, centre name
- mediflow_appt_confirm       → 4 params: patient name, doctor, date, time
- mediflow_followup_reminder  → 3 params: patient name, doctor, follow-up date

---

## Firestore Structure

```
/clients/{uid}                     admin client records (subscription, status)
/centres/{uid}/profile/main        centre settings + AiSynergy API key
/centres/{uid}/visits/{id}         diagnostic visits (includes reportPdfUrl)
/centres/{uid}/appointments/{id}   clinic appointments
/centres/{uid}/prescriptions/{id}  prescriptions
/centres/{uid}/followups/{id}      follow-up schedule
/centres/{uid}/tests/{id}          test catalogue
/centres/{uid}/medicines/{id}      medicine catalogue
/leads/{phone}                     inbound WhatsApp leads from webhook
```

---

## Quick Smoke Test After Deploy

1. /admin → login → create test client
2. Check client receives password setup email
3. /login as client → dashboard loads
4. New visit → mark Ready → upload PDF → Send PDF on WhatsApp
5. /clinic → book appointment → write prescription → print
6. Message your WhatsApp number → check Leads Inbox in admin
