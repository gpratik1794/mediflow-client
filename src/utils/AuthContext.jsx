// src/utils/AuthContext.jsx — parallel loads, no sequential awaits
import React, { createContext, useContext, useState, useEffect } from 'react'
import { auth, db } from '../firebase/config'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc, onSnapshot } from 'firebase/firestore'

const AuthContext = createContext(null)
export const useAuth = () => useContext(AuthContext)

function isAccountAccessible(clientRecord) {
  if (!clientRecord) return true
  if (clientRecord.status === 'deactivated') return false
  if (clientRecord.subscriptionEndDate) {
    const end = new Date(clientRecord.subscriptionEndDate)
    // Block if subscription end date has passed — regardless of paid status
    // Data is preserved; client can renew and regain access immediately
    if (new Date() > end) return false
  }
  return true
}

export function AuthProvider({ children }) {
  const [user, setUser]               = useState(null)
  const [profile, setProfile]         = useState(null)
  const [clientRecord, setClientRecord] = useState(null)
  const [blocked, setBlocked]         = useState(false)
  const [loading, setLoading]         = useState(true)
  const [role, setRole]               = useState(null)
  const [userRecord, setUserRecord]   = useState(null)

  useEffect(() => {
    let profileUnsub = null

    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (profileUnsub) { profileUnsub(); profileUnsub = null }

      if (!firebaseUser) {
        setUser(null); setProfile(null); setClientRecord(null)
        setBlocked(false); setRole(null); setUserRecord(null)
        setLoading(false)
        return
      }

      setUser(firebaseUser)

      // Fire both lookups in parallel — no sequential waiting
      const [clientSnap, staffSnap] = await Promise.all([
        getDoc(doc(db, 'clients',    firebaseUser.uid)).catch(() => null),
        getDoc(doc(db, 'staffUsers', firebaseUser.uid)).catch(() => null),
      ])

      // Client / subscription record
      if (clientSnap?.exists()) {
        const record = clientSnap.data()
        setClientRecord(record)
        setBlocked(!isAccountAccessible(record))
      }

      // Role: staff or owner
      // setLoading(false) is called INSIDE the first snapshot callback
      // so profile is guaranteed to be set before the app renders
      if (staffSnap?.exists()) {
        const rec = staffSnap.data()
        setUserRecord(rec)
        setRole(rec.role || 'receptionist')
        if (rec.centreId) {
          let firstSnap = true
          // Timeout: if snapshot doesn't fire in 5s, unblock anyway
          const timeout = setTimeout(() => {
            if (firstSnap) { firstSnap = false; setLoading(false) }
          }, 5000)
          profileUnsub = onSnapshot(
            doc(db, 'centres', rec.centreId, 'profile', 'main'),
            snap => {
              if (snap.exists()) setProfile({ ...snap.data(), _centreId: rec.centreId })
              if (firstSnap) { firstSnap = false; clearTimeout(timeout); setLoading(false) }
            },
            e => { console.warn('Staff profile listen failed', e); clearTimeout(timeout); setLoading(false) }
          )
        } else {
          setLoading(false)
        }
      } else {
        setRole(null)
        let firstSnap = true
        // Timeout: if snapshot doesn't fire in 5s, unblock anyway
        const timeout = setTimeout(() => {
          if (firstSnap) { firstSnap = false; setLoading(false) }
        }, 5000)
        profileUnsub = onSnapshot(
          doc(db, 'centres', firebaseUser.uid, 'profile', 'main'),
          snap => {
            if (snap.exists()) setProfile(snap.data())
            if (firstSnap) { firstSnap = false; clearTimeout(timeout); setLoading(false) }
          },
          e => { console.warn('Profile listen failed', e); clearTimeout(timeout); setLoading(false) }
        )
      }
    })

    return () => { unsub(); if (profileUnsub) profileUnsub() }
  }, [])

  if (!loading && user && blocked) {
    return (
      <div style={{
        minHeight: '100vh', background: 'var(--navy)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'DM Sans, sans-serif'
      }}>
        <div style={{
          background: 'white', borderRadius: 20, padding: '48px 40px',
          maxWidth: 460, textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
        }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>🚫</div>
          <h2 style={{ color: '#0D2B3E', marginBottom: 8 }}>Account Access Restricted</h2>
          <p style={{ color: '#4A5E6D', lineHeight: 1.7, marginBottom: 24 }}>
            {clientRecord?.status === 'deactivated'
              ? 'Your MediFlow account has been deactivated.'
              : 'Your subscription has expired or payment is pending.'}
            <br />Please contact <strong>Synergy Consultant</strong> to restore access.
          </p>
          <div style={{
            background: '#E6F7F5', borderRadius: 12, padding: '16px 20px',
            fontSize: 13, color: '#0B9E8A', marginBottom: 20
          }}>
            📞 Contact Synergy Consultant<br />
            <strong>synergyconsultant.co.in</strong>
          </div>
          <button onClick={() => { auth.signOut(); window.location.href = '/login' }} style={{
            padding: '11px 24px', background: '#0B9E8A', color: 'white',
            border: 'none', borderRadius: 10, cursor: 'pointer',
            fontSize: 14, fontWeight: 600, fontFamily: 'DM Sans, sans-serif'
          }}>
            Sign Out
          </button>
        </div>
      </div>
    )
  }

  // maxStaff: read from profile (centres/uid/profile/main) — available for both owner and staff
  // Fall back to clientRecord.maxStaff for legacy, then default 1
  const maxStaff = profile?.maxStaff || clientRecord?.maxStaff || 1

  return (
    <AuthContext.Provider value={{ user, profile, clientRecord, loading, role, userRecord, maxStaff }}>
      {children}
    </AuthContext.Provider>
  )
}
