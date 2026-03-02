// src/App.jsx — MediFlow v3
import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './utils/AuthContext'

// Diagnostic pages
import Login       from './pages/Login'
import Dashboard   from './pages/Dashboard'
import Visits      from './pages/Visits'
import NewVisit    from './pages/NewVisit'
import VisitDetail from './pages/VisitDetail'
import Billing     from './pages/Billing'
import Reports     from './pages/Reports'
import Tests       from './pages/Tests'
import Patients    from './pages/Patients'
import Settings    from './pages/Settings'

// Clinic pages
import ClinicDashboard    from './pages/clinic/ClinicDashboard'
import ClinicPatients     from './pages/clinic/ClinicPatients'
import Appointments       from './pages/clinic/Appointments'
import NewAppointment     from './pages/clinic/NewAppointment'
import AppointmentDetail  from './pages/clinic/AppointmentDetail'
import PrescriptionWriter from './pages/clinic/PrescriptionWriter'
import PrescriptionDetail from './pages/clinic/PrescriptionDetail'
import FollowUps          from './pages/clinic/FollowUps'

function Protected({ children }) {
  const { user, loading } = useAuth()
  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'DM Sans, sans-serif', color: '#8FA3AE' }}>Loading…</div>
  )
  return user ? children : <Navigate to="/login" replace />
}

function PublicOnly({ children }) {
  const { user } = useAuth()
  return user ? <Navigate to="/" replace /> : children
}

// Smart root redirect — clinic users go to /clinic, diagnostic to /
function RootRedirect() {
  const { profile, loading } = useAuth()
  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>Loading…</div>
  if (profile?.centreType === 'clinic') return <Navigate to="/clinic" replace />
  return <Dashboard />
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />

      {/* Smart root */}
      <Route path="/" element={<Protected><RootRedirect /></Protected>} />

      {/* Diagnostic routes */}
      <Route path="/patients"    element={<Protected><Patients /></Protected>} />
      <Route path="/visits"      element={<Protected><Visits /></Protected>} />
      <Route path="/visits/new"  element={<Protected><NewVisit /></Protected>} />
      <Route path="/visits/:id"  element={<Protected><VisitDetail /></Protected>} />
      <Route path="/billing"     element={<Protected><Billing /></Protected>} />
      <Route path="/reports"     element={<Protected><Reports /></Protected>} />
      <Route path="/tests"       element={<Protected><Tests /></Protected>} />
      <Route path="/settings"    element={<Protected><Settings /></Protected>} />

      {/* Clinic routes */}
      <Route path="/clinic"                       element={<Protected><ClinicDashboard /></Protected>} />
      <Route path="/clinic/patients"              element={<Protected><ClinicPatients /></Protected>} />
      <Route path="/clinic/appointments"          element={<Protected><Appointments /></Protected>} />
      <Route path="/clinic/appointments/new"      element={<Protected><NewAppointment /></Protected>} />
      <Route path="/clinic/appointments/:id"      element={<Protected><AppointmentDetail /></Protected>} />
      <Route path="/clinic/prescription/new"      element={<Protected><PrescriptionWriter /></Protected>} />
      <Route path="/clinic/prescription/:id"      element={<Protected><PrescriptionDetail /></Protected>} />
      <Route path="/clinic/followups"             element={<Protected><FollowUps /></Protected>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
