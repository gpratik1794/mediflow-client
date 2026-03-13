// src/components/UI.jsx
import React from 'react'

/* ── BUTTON ─────────────────────────────────────────────── */
export function Btn({ children, variant='primary', onClick, type='button', style, disabled, small }) {
  const base = {
    display: 'inline-flex', alignItems: 'center', gap: 7,
    border: 'none', borderRadius: 10, cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'DM Sans, sans-serif', fontWeight: 500, transition: 'all 0.18s',
    opacity: disabled ? 0.6 : 1,
    padding: small ? '7px 14px' : '10px 20px',
    fontSize: small ? 12 : 13,
  }
  const variants = {
    primary: { background: 'var(--teal)', color: '#fff' },
    ghost:   { background: 'none', border: '1.5px solid var(--border)', color: 'var(--slate)' },
    danger:  { background: 'var(--red)', color: '#fff' },
    success: { background: 'var(--green)', color: '#fff' },
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      style={{ ...base, ...variants[variant], ...style }}>
      {children}
    </button>
  )
}

/* ── INPUT ──────────────────────────────────────────────── */
export function Input({ label, type='text', value, onChange, placeholder, required, style }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {label && <label style={{ fontSize: 11, color: 'var(--slate)', fontWeight: 500, letterSpacing: 0.3 }}>{label}{required && ' *'}</label>}
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} required={required}
        style={{
          border: '1.5px solid var(--border)', borderRadius: 8, padding: '9px 12px',
          fontSize: 13, color: 'var(--navy)', outline: 'none', width: '100%',
          fontFamily: 'DM Sans, sans-serif', background: 'var(--surface)',
          transition: 'border-color 0.18s', ...style
        }}
        onFocus={e => e.target.style.borderColor = 'var(--teal)'}
        onBlur={e => e.target.style.borderColor = 'var(--border)'}
      />
    </div>
  )
}

/* ── SELECT ─────────────────────────────────────────────── */
export function Select({ label, value, onChange, options, required, style }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {label && <label style={{ fontSize: 11, color: 'var(--slate)', fontWeight: 500, letterSpacing: 0.3 }}>{label}{required && ' *'}</label>}
      <select value={value} onChange={onChange} required={required}
        style={{
          border: '1.5px solid var(--border)', borderRadius: 8, padding: '9px 12px',
          fontSize: 13, color: value ? 'var(--navy)' : 'var(--muted)', outline: 'none',
          fontFamily: 'DM Sans, sans-serif', background: 'var(--surface)', appearance: 'none',
          transition: 'border-color 0.18s', cursor: 'pointer', width: '100%', ...style
        }}
        onFocus={e => e.target.style.borderColor = 'var(--teal)'}
        onBlur={e => e.target.style.borderColor = 'var(--border)'}
      >
        {options.map(o => (
          <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>
        ))}
      </select>
    </div>
  )
}

/* ── BADGE ──────────────────────────────────────────────── */
export function Badge({ status }) {
  const map = {
    registered:  { bg: 'var(--border)',    color: 'var(--slate)',  label: 'Registered' },
    sampled:     { bg: 'var(--amber-bg)',  color: 'var(--amber)',  label: 'Sampled' },
    processing:  { bg: 'var(--teal-light)',color: 'var(--teal)',   label: 'Processing' },
    ready:       { bg: 'var(--green-bg)',  color: 'var(--green)',  label: 'Ready' },
    pending:     { bg: 'var(--amber-bg)',  color: 'var(--amber)',  label: 'Pending' },
    paid:        { bg: 'var(--green-bg)',  color: 'var(--green)',  label: 'Paid' },
  }
  const s = map[status] || map.registered
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 500,
      background: s.bg, color: s.color
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.color, display: 'inline-block' }} />
      {s.label}
    </span>
  )
}

/* ── CARD ───────────────────────────────────────────────── */
export function Card({ children, style, className }) {
  return (
    <div className={className} style={{
      background: 'var(--surface)', borderRadius: 'var(--radius)',
      boxShadow: 'var(--shadow)', overflow: 'hidden', ...style
    }}>
      {children}
    </div>
  )
}

export function CardHeader({ title, sub, action }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '18px 22px', borderBottom: '1px solid var(--border)'
    }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--navy)' }}>{title}</div>
        {sub && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{sub}</div>}
      </div>
      {action}
    </div>
  )
}

/* ── MODAL ──────────────────────────────────────────────── */
export function Modal({ open, onClose, title, sub, children, width=480 }) {
  if (!open) return null
  return (
    <div className="fade-in" onClick={e => e.target === e.currentTarget && onClose()}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(13,43,62,0.45)',
        backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center',
        justifyContent: 'center', zIndex: 200
      }}>
      <div className="fade-up" style={{
        background: 'var(--surface)', borderRadius: 18, padding: 28,
        width, maxWidth: '95vw', boxShadow: 'var(--shadow-lg)',
        maxHeight: '90vh', overflowY: 'auto'
      }}>
        <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--navy)', marginBottom: 4 }}>{title}</div>
        {sub && <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 22 }}>{sub}</div>}
        {children}
      </div>
    </div>
  )
}

/* ── STAT CARD ──────────────────────────────────────────── */
export function StatCard({ icon, label, value, delta, deltaUp, color='teal' }) {
  const colors = {
    teal:  { bg: 'var(--teal-light)', fg: 'var(--teal)' },
    amber: { bg: 'var(--amber-bg)',   fg: 'var(--amber)' },
    green: { bg: 'var(--green-bg)',   fg: 'var(--green)' },
    red:   { bg: 'var(--red-bg)',     fg: 'var(--red)' },
  }
  const c = colors[color]
  return (
    <div className="fade-up" style={{
      background: 'var(--surface)', borderRadius: 'var(--radius)', padding: '20px 22px',
      boxShadow: 'var(--shadow)', display: 'flex', alignItems: 'center', gap: 16,
      transition: 'transform 0.18s, box-shadow 0.18s', cursor: 'default'
    }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = 'var(--shadow-lg)' }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'var(--shadow)' }}
    >
      <div style={{
        width: 46, height: 46, borderRadius: 12, display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: c.bg, color: c.fg, flexShrink: 0, fontSize: 20
      }}>
        {icon}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 26, fontWeight: 600, color: 'var(--navy)', lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>{label}</div>
      </div>
      {delta && (
        <div style={{
          fontSize: 11, fontWeight: 500, padding: '3px 8px', borderRadius: 20, alignSelf: 'flex-start',
          background: deltaUp ? 'var(--green-bg)' : 'var(--red-bg)',
          color: deltaUp ? 'var(--green)' : 'var(--red)'
        }}>
          {deltaUp ? '↑' : '↓'} {delta}
        </div>
      )}
    </div>
  )
}

/* ── TOAST ──────────────────────────────────────────────── */
export function Toast({ message, type='success', onClose }) {
  React.useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t) }, [])
  const colors = { success: 'var(--green)', error: 'var(--red)', info: 'var(--teal)' }
  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 999,
      background: 'var(--navy)', color: '#fff', padding: '12px 20px',
      borderRadius: 12, fontSize: 13, fontWeight: 500,
      display: 'flex', alignItems: 'center', gap: 10, boxShadow: 'var(--shadow-lg)',
      borderLeft: `4px solid ${colors[type]}`, animation: 'fadeUp 0.3s ease'
    }}>
      {type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'} {message}
    </div>
  )
}

/* ── LOADING SPINNER ─────────────────────────────────────── */
export function Spinner({ size=24 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      border: `3px solid var(--border)`, borderTopColor: 'var(--teal)',
      animation: 'spin 0.7s linear infinite'
    }} />
  )
}

/* ── EMPTY STATE ─────────────────────────────────────────── */
export function Empty({ icon='📋', message }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--muted)' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>{icon}</div>
      <div style={{ fontSize: 14 }}>{message}</div>
    </div>
  )
}
