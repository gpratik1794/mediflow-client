// src/components/AdminLayout.jsx
import React from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAdmin } from '../utils/AdminContext'

const NAV = [
  { icon: '🏢', label: 'Clients',      to: '/admin/clients' },
  { icon: '➕', label: 'Add Client',   to: '/admin/clients/new' },
  { icon: '📥', label: 'Leads Inbox',  to: '/admin/leads' },
  { icon: '📊', label: 'Overview',     to: '/admin/overview' },
]

export default function AdminLayout({ children, title, action }) {
  const { adminLogout } = useAdmin()
  const navigate = useNavigate()
  const loc = useLocation()

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Sidebar */}
      <aside style={{
        width: 220, background: 'var(--navy)', display: 'flex',
        flexDirection: 'column', flexShrink: 0, position: 'sticky', top: 0, height: '100vh'
      }}>
        {/* Logo */}
        <div style={{ padding: '24px 20px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 34, height: 34, background: 'var(--teal)', borderRadius: 9,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16
            }}>🛡</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>MediFlow</div>
              <div style={{ fontSize: 10, color: 'var(--teal)', letterSpacing: 1, textTransform: 'uppercase' }}>Admin Console</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '12px 10px' }}>
          {NAV.map(item => {
            const active = loc.pathname.startsWith(item.to) && (item.to !== '/admin/clients' || loc.pathname === '/admin/clients' || loc.pathname.startsWith('/admin/clients/'))
            const isActive = item.to === '/admin/clients'
              ? (loc.pathname === '/admin/clients' || loc.pathname.match(/^\/admin\/clients\/[^n]/))
              : loc.pathname.startsWith(item.to)
            return (
              <button key={item.to} onClick={() => navigate(item.to)} style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                padding: '10px 14px', borderRadius: 10, border: 'none', cursor: 'pointer',
                marginBottom: 4, textAlign: 'left', fontFamily: 'DM Sans, sans-serif',
                background: isActive ? 'rgba(11,158,138,0.18)' : 'transparent',
                color: isActive ? 'var(--teal)' : 'rgba(255,255,255,0.7)',
                fontWeight: isActive ? 600 : 400, fontSize: 14,
                transition: 'all 0.15s'
              }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
              >
                <span style={{ fontSize: 16 }}>{item.icon}</span>
                {item.label}
              </button>
            )
          })}
        </nav>

        {/* Bottom */}
        <div style={{ padding: '16px 10px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <button onClick={() => navigate('/')} style={{
            display: 'flex', alignItems: 'center', gap: 10, width: '100%',
            padding: '10px 14px', borderRadius: 10, border: 'none', cursor: 'pointer',
            background: 'transparent', color: 'rgba(255,255,255,0.5)', fontSize: 13,
            fontFamily: 'DM Sans, sans-serif', marginBottom: 6
          }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            ↗ View App
          </button>
          <button onClick={adminLogout} style={{
            display: 'flex', alignItems: 'center', gap: 10, width: '100%',
            padding: '10px 14px', borderRadius: 10, border: 'none', cursor: 'pointer',
            background: 'transparent', color: 'rgba(255,255,255,0.5)', fontSize: 13,
            fontFamily: 'DM Sans, sans-serif'
          }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            🚪 Sign Out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Top bar */}
        <header style={{
          background: 'var(--surface)', borderBottom: '1px solid var(--border)',
          padding: '16px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          position: 'sticky', top: 0, zIndex: 10
        }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--navy)' }}>{title}</h1>
          {action && <div>{action}</div>}
        </header>

        {/* Content */}
        <main style={{ flex: 1, padding: '32px', overflowY: 'auto' }}>
          {children}
        </main>
      </div>
    </div>
  )
}
