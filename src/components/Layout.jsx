// src/components/Layout.jsx
import React, { useState, useEffect } from 'react'
import Sidebar from './Sidebar'

export default function Layout({ children, title, action }) {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768
      setIsMobile(mobile)
      if (!mobile) setSidebarOpen(false) // auto-close drawer when resizing to desktop
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return (
    <div style={{ display: 'flex', minHeight: '100vh', width: '100%', overflowX: 'clip' }}>

      {/* Sidebar — always rendered, mobile drawer behavior handled inside */}
      <Sidebar
        isMobile={isMobile}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Overlay backdrop — only on mobile when sidebar is open */}
      {isMobile && sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.45)',
            zIndex: 90,
          }}
        />
      )}

      {/* Main content area */}
      <main style={{
        marginLeft: isMobile ? 0 : 'var(--sidebar-w)',
        flex: 1,
        minWidth: 0,
        width: isMobile ? '100%' : `calc(100% - var(--sidebar-w))`,
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        transition: 'margin-left 0.25s ease',
      }}>

        {/* Topbar */}
        <header style={{
          background: 'var(--surface)',
          borderBottom: '1px solid var(--border)',
          padding: isMobile ? '0 16px' : '0 32px',
          height: 64,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          position: 'sticky',
          top: 0,
          zIndex: 50,
        }}>

          {/* Hamburger — only on mobile */}
          {isMobile && (
            <button
              onClick={() => setSidebarOpen(true)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '8px',
                borderRadius: 8,
                display: 'flex',
                flexDirection: 'column',
                gap: 5,
                flexShrink: 0,
                // 44x44 touch target
                minWidth: 44,
                minHeight: 44,
                alignItems: 'center',
                justifyContent: 'center',
              }}
              aria-label="Open menu"
            >
              <span style={{ display: 'block', width: 20, height: 2, background: 'var(--navy)', borderRadius: 2 }} />
              <span style={{ display: 'block', width: 20, height: 2, background: 'var(--navy)', borderRadius: 2 }} />
              <span style={{ display: 'block', width: 20, height: 2, background: 'var(--navy)', borderRadius: 2 }} />
            </button>
          )}

          {/* Page title */}
          <div style={{
            fontSize: isMobile ? 15 : 17,
            fontWeight: 600,
            color: 'var(--navy)',
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {title}
          </div>

          {/* Action button (e.g. + New Appointment) */}
          {action}
        </header>

        {/* Page content */}
        <div style={{
          padding: isMobile ? '16px' : '28px 32px',
          flex: 1,
          minWidth: 0,
          maxWidth: '100%',
          overflowX: 'clip',  // clips overflow but does NOT affect position:fixed children
        }}>
          {children}
        </div>

      </main>
    </div>
  )
}
