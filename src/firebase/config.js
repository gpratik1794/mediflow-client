// src/firebase/config.js
// ─────────────────────────────────────────────────────────────────────
// SETUP STEPS:
// 1. Create project at https://console.firebase.google.com
// 2. Add Web App → copy the firebaseConfig values
// 3. Enable Firestore (production mode), Authentication (Email/Password),
//    and Storage in Firebase console
// 4. Create .env.local from .env.example and paste your values
// 5. For the Admin panel: after first login as admin, copy your UID
//    from Firebase Console > Authentication > Users and set VITE_ADMIN_UID
// ─────────────────────────────────────────────────────────────────────

import { initializeApp } from 'firebase/app'
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore'
import { getAuth } from 'firebase/auth'
import { getStorage } from 'firebase/storage'

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY            || "YOUR_API_KEY",
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN        || "YOUR_PROJECT.firebaseapp.com",
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID         || "YOUR_PROJECT_ID",
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET     || "YOUR_PROJECT.appspot.com",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "YOUR_SENDER_ID",
  appId:             import.meta.env.VITE_FIREBASE_APP_ID             || "YOUR_APP_ID"
}

const app        = initializeApp(firebaseConfig)
export const db      = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
})
export const auth    = getAuth(app)
export const storage = getStorage(app)
export default app
