// src/components/Layout.jsx
import React from 'react'
import Sidebar from './Sidebar'

export default function Layout({ children, title, action }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <main style={{ marginLeft: 'var(--sidebar-w)', flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        {/* Topbar */}
        <header style={{
          background: 'var(--surface)', borderBottom: '1px solid var(--border)',
          padding: '0 32px', height: 64, display: 'flex', alignItems: 'center',
          gap: 16, position: 'sticky', top: 0, zIndex: 50
        }}>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--navy)', flex: 1 }}>{title}</div>
          {action}
        </header>
        {/* Content */}
        <div style={{ padding: '28px 32px', flex: 1 }}>
          {children}
        </div>
      </main>
    </div>
  )
}
