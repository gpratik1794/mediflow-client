// src/components/Sidebar.jsx
import React from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { auth } from '../firebase/config'
import { useAuth } from '../utils/AuthContext'

const DIAGNOSTIC_NAV = [
  { section: 'Overview' },
  { to: '/',         label: 'Dashboard',      icon: '▦' },
  { to: '/patients', label: 'Patients',        icon: '👥' },
  { section: 'Lab' },
  { to: '/visits',   label: "Today's Visits",  icon: '📋' },
  { to: '/billing',  label: 'Billing',         icon: '₹' },
  { to: '/reports',  label: 'Reports',         icon: '📄' },
  { section: 'Manage' },
  { to: '/tests',    label: 'Test Catalogue',  icon: '🧪' },
  { to: '/settings', label: 'Settings',        icon: '⚙' },
]

function buildBothNav(modules) {
  const nav = [
    { section: 'Clinic' },
    { to: '/clinic',              label: 'Clinic Dashboard',    icon: '🩺' },
    { to: '/clinic/appointments', label: 'Appointments',        icon: '📅' },
    { to: '/clinic/followups',    label: 'Follow-ups',          icon: '🔔' },
    { to: '/clinic/prescription/new', label: 'New Prescription', icon: '💊' },
  ]
  if (modules?.vaccination) {
    nav.push({ to: '/clinic/vaccination', label: 'Vaccination', icon: '💉' })
  }
  nav.push(
    { to: '/clinic/reports', label: 'Reports', icon: '📊' },
    { section: 'Diagnostic' },
    { to: '/',       label: 'Lab Dashboard',  icon: '▦' },
    { to: '/visits', label: "Today's Visits", icon: '📋' },
    { to: '/billing', label: 'Billing',       icon: '₹' },
    { to: '/reports', label: 'Reports',       icon: '📄' },
    { section: 'Manage' },
    { to: '/patients', label: 'Patients',     icon: '👥' },
    { to: '/tests',    label: 'Test Catalogue', icon: '🧪' },
    { to: '/settings', label: 'Settings',     icon: '⚙' }
  )
  return nav
}

export default function Sidebar() {
  const { profile, role, userRecord } = useAuth()
  const navigate = useNavigate()

  const centreType = profile?.centreType || 'diagnostic'
  const modules    = profile?.modules || {}
  const isReceptionist = role === 'receptionist'

  function buildClinicNav(modules) {
    const nav = [
      { section: 'Overview' },
      { to: '/clinic', label: 'Dashboard', icon: '▦' },
      { section: 'Patients' },
      { to: '/clinic/appointments', label: 'Appointments', icon: '📅' },
      { to: '/clinic/patients',     label: 'Marketing',    icon: '📣' },
      { to: '/clinic/followups',    label: 'Follow-ups',   icon: '🔔' },
    ]
    if (modules?.vaccination) {
      nav.push({ to: '/clinic/vaccination', label: 'Vaccination', icon: '💉' })
    }
    // Receptionist cannot see Prescription or Reports
    if (!isReceptionist) {
      nav.push(
        { section: 'Doctor' },
        { to: '/clinic/prescription/new', label: 'New Prescription', icon: '💊' },
        { section: 'Manage' },
        { to: '/clinic/reports',  label: 'Reports',  icon: '📊' },
        { to: '/settings',        label: 'Settings', icon: '⚙' }
      )
    } else {
      nav.push(
        { section: 'Manage' },
        { to: '/settings', label: 'Settings', icon: '⚙' }
      )
    }
    return nav
  }

  const nav = centreType === 'clinic' ? buildClinicNav(modules)
            : centreType === 'both'   ? buildBothNav(modules)
            : DIAGNOSTIC_NAV

  const typeLabel = centreType === 'clinic' ? 'Clinic'
                  : centreType === 'both'   ? 'Clinic + Diagnostic'
                  : 'Diagnostic Centre'

  async function handleLogout() {
    await signOut(auth)
    navigate('/login')
  }

  return (
    <aside style={{
      width: 'var(--sidebar-w)', minHeight: '100vh',
      background: 'var(--navy)', display: 'flex', flexDirection: 'column',
      padding: '28px 0', position: 'fixed', top: 0, left: 0, zIndex: 100
    }}>
      {/* Logo */}
      <div style={{ padding: '0 24px 28px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, background: 'var(--teal)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🏥</div>
          <div>
            <div style={{ fontFamily: 'DM Serif Display, serif', fontSize: 20, color: '#fff', letterSpacing: -0.3 }}>MediFlow</div>
            <div style={{ fontSize: 10, color: 'var(--teal)', letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 500 }}>{typeLabel}</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '20px 12px', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }}>
        {nav.map((item, i) => {
          if (item.section) return (
            <div key={i} style={{ fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', padding: '12px 12px 4px', fontWeight: 500 }}>{item.section}</div>
          )
          return (
            <NavLink key={item.to} to={item.to}
              end={item.to === '/' || item.to === '/clinic'}
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 12px', borderRadius: 10, cursor: 'pointer',
                transition: 'all 0.18s', fontSize: 13, fontWeight: isActive ? 500 : 400,
                textDecoration: 'none',
                background: isActive ? 'var(--teal)' : 'transparent',
                color: isActive ? '#fff' : 'rgba(255,255,255,0.55)',
              })}
            >
              <span style={{ fontSize: 15, width: 20, textAlign: 'center' }}>{item.icon}</span>
              {item.label}
            </NavLink>
          )
        })}
      </nav>

      {/* Footer */}
      <div style={{ padding: '16px 12px 0', borderTop: '1px solid rgba(255,255,255,0.08)', margin: '0 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'rgba(255,255,255,0.06)', borderRadius: 10, marginBottom: 8 }}>
          <div style={{ width: 32, height: 32, background: 'var(--teal)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: '#fff', flexShrink: 0 }}>
            {isReceptionist ? 'R' : (profile?.centreName || 'M').slice(0, 2).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {isReceptionist ? (userRecord?.name || 'Receptionist') : (profile?.centreName || 'My Centre')}
            </div>
            <div style={{ fontSize: 10, color: isReceptionist ? 'var(--teal)' : 'rgba(255,255,255,0.35)' }}>
              {isReceptionist ? '👤 Receptionist' : (profile?.city || '')}
            </div>
          </div>
        </div>
        <button onClick={handleLogout} style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', fontSize: 12, padding: '8px 12px', textAlign: 'left', borderRadius: 8, transition: 'color 0.18s', fontFamily: 'DM Sans, sans-serif' }}
          onMouseEnter={e => e.target.style.color = 'rgba(255,255,255,0.8)'}
          onMouseLeave={e => e.target.style.color = 'rgba(255,255,255,0.4)'}
        >⏻ Sign Out</button>
      </div>
    </aside>
  )
}
