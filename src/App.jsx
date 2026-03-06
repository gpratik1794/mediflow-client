// Admin Panel — Standalone app for mediflow-admin.synergyconsultant.co.in
import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AdminProvider, useAdmin } from './utils/AdminContext'

import AdminLogin        from './pages/AdminLogin'
import AdminClients      from './pages/AdminClients'
import AdminCreateClient from './pages/AdminCreateClient'
import AdminClientDetail from './pages/AdminClientDetail'
import AdminLeads        from './pages/AdminLeads'
import AdminOverview     from './pages/AdminOverview'

function AdminProtected({ children }) {
  const { isAdmin, loading } = useAdmin()
  if (loading) return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', fontFamily: 'DM Sans, sans-serif', color: '#8FA3AE'
    }}>Loading…</div>
  )
  return isAdmin ? children : <Navigate to="/" replace />
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/"                element={<AdminLogin />} />
      <Route path="/clients"         element={<AdminProtected><AdminClients /></AdminProtected>} />
      <Route path="/clients/new"     element={<AdminProtected><AdminCreateClient /></AdminProtected>} />
      <Route path="/clients/:id"     element={<AdminProtected><AdminClientDetail /></AdminProtected>} />
      <Route path="/leads"           element={<AdminProtected><AdminLeads /></AdminProtected>} />
      <Route path="/overview"        element={<AdminProtected><AdminOverview /></AdminProtected>} />
      <Route path="*"                element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AdminProvider>
        <AppRoutes />
      </AdminProvider>
    </BrowserRouter>
  )
}
