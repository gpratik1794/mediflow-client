// src/utils/AuthContext.jsx — with subscription gate
import React, { createContext, useContext, useState, useEffect } from 'react'
import { auth, db } from '../firebase/config'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc, onSnapshot } from 'firebase/firestore'

const AuthContext = createContext(null)
export const useAuth = () => useContext(AuthContext)

function isAccountAccessible(clientRecord) {
  if (!clientRecord) return true // No record = old client, allow access
  if (clientRecord.status === 'deactivated') return false
  if (clientRecord.subscriptionEndDate) {
    const end = new Date(clientRecord.subscriptionEndDate)
    if (new Date() > end && !clientRecord.paid) return false
  }
  return true
}

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [profile, setProfile] = useState(null)
  const [clientRecord, setClientRecord] = useState(null)
  const [blocked, setBlocked] = useState(false)
  const [loading, setLoading] = useState(true)
  const [role, setRole]       = useState(null)   // 'admin' | 'receptionist' | null (owner)
  const [userRecord, setUserRecord] = useState(null) // { name, email, phone, role }

  useEffect(() => {
    let profileUnsub = null
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (profileUnsub) { profileUnsub(); profileUnsub = null }

      if (firebaseUser) {
        setUser(firebaseUser)

        // Load centre profile — real-time
        profileUnsub = onSnapshot(
          doc(db, 'centres', firebaseUser.uid, 'profile', 'main'),
          snap => { if (snap.exists()) setProfile(snap.data()) },
          e => console.warn('Profile listen failed', e)
        )

        // Load client subscription record
        try {
          const clientSnap = await getDoc(doc(db, 'clients', firebaseUser.uid))
          if (clientSnap.exists()) {
            const record = clientSnap.data()
            setClientRecord(record)
            setBlocked(!isAccountAccessible(record))
          }
        } catch (e) { console.warn('Client record load failed', e) }

        // Load role — check if this uid exists as a sub-user under any centre
        // Pattern: centres/{centreId}/users/{firebaseUser.uid}
        // For owner login: no record exists → role stays null (full access)
        // For staff login: record exists with centreId stored on it
        try {
          // Sub-users store their centreId on their own user record
          // First check if there's a direct owner match (uid === centreId)
          const ownerProfileSnap = await getDoc(doc(db, 'centres', firebaseUser.uid, 'profile', 'main'))
          if (!ownerProfileSnap.exists()) {
            // Not an owner — look up as sub-user
            // Sub-user record: centres/{centreOwnerUid}/users/{firebaseUser.uid}
            // We store centreId on the user record itself for lookup
            const userDocSnap = await getDoc(doc(db, 'staffUsers', firebaseUser.uid))
            if (userDocSnap.exists()) {
              const rec = userDocSnap.data()
              setUserRecord(rec)
              setRole(rec.role || 'receptionist')
              // Load the owner's centre profile instead
              if (rec.centreId) {
                profileUnsub = onSnapshot(
                  doc(db, 'centres', rec.centreId, 'profile', 'main'),
                  snap => { if (snap.exists()) setProfile({ ...snap.data(), _centreId: rec.centreId }) },
                  e => console.warn('Staff profile listen failed', e)
                )
              }
            }
          } else {
            setRole(null) // owner
          }
        } catch (e) { console.warn('Role load failed', e) }

      } else {
        setUser(null)
        setProfile(null)
        setClientRecord(null)
        setBlocked(false)
        setRole(null)
        setUserRecord(null)
      }
      setLoading(false)
    })
    return () => { unsub(); if (profileUnsub) profileUnsub() }
  }, [])

  // Show blocked screen if account deactivated/expired
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

  return (
    <AuthContext.Provider value={{ user, profile, clientRecord, loading, role, userRecord }}>
      {children}
    </AuthContext.Provider>
  )
}
