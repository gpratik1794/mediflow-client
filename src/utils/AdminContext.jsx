// src/utils/AdminContext.jsx
import React, { createContext, useContext, useState, useEffect } from 'react'
import { auth } from '../firebase/config'
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth'

const AdminContext = createContext(null)
export const useAdmin = () => useContext(AdminContext)

// Your admin UID — set this after first Firebase login as admin
// You can find your UID in Firebase Console > Authentication > Users
const ADMIN_UID = import.meta.env.VITE_ADMIN_UID || ''

export function AdminProvider({ children }) {
  const [adminUser, setAdminUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setAdminUser(user)
      setIsAdmin(!!(user && ADMIN_UID && user.uid === ADMIN_UID))
      setLoading(false)
    })
    return unsub
  }, [])

  async function adminLogin(email, password) {
    const cred = await signInWithEmailAndPassword(auth, email, password)
    if (ADMIN_UID && cred.user.uid !== ADMIN_UID) {
      await signOut(auth)
      throw new Error('Not an admin account')
    }
    return cred.user
  }

  async function adminLogout() {
    await signOut(auth)
    setAdminUser(null)
    setIsAdmin(false)
  }

  return (
    <AdminContext.Provider value={{ adminUser, isAdmin, loading, adminLogin, adminLogout }}>
      {children}
    </AdminContext.Provider>
  )
}
