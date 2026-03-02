// src/pages/admin/AdminLogin.jsx
import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAdmin } from '../../utils/AdminContext'

export default function AdminLogin() {
  const { adminLogin } = useAdmin()
  const navigate = useNavigate()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await adminLogin(email, password)
      navigate('/admin/clients')
    } catch (err) {
      setError(err.message === 'Not an admin account'
        ? 'This account does not have admin access.'
        : 'Invalid credentials. Try again.')
    }
    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center'
    }}>
      <div style={{
        background: 'var(--surface)', borderRadius: 16, padding: 40,
        width: 400, boxShadow: 'var(--shadow-lg)',
        border: '1px solid var(--border)'
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 }}>
          <div style={{
            width: 42, height: 42, background: 'var(--navy)', borderRadius: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20
          }}>🛡</div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--navy)' }}>MediFlow Admin</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Platform management console</div>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={lStyle}>Admin Email</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              required placeholder="admin@synergyconsultant.co.in"
              style={inputStyle}
              onFocus={e => e.target.style.borderColor = 'var(--teal)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'}
            />
          </div>
          <div>
            <label style={lStyle}>Password</label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              required placeholder="••••••••"
              style={inputStyle}
              onFocus={e => e.target.style.borderColor = 'var(--teal)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'}
            />
          </div>

          {error && (
            <div style={{
              background: 'var(--red-bg)', color: 'var(--red)',
              padding: '10px 14px', borderRadius: 8, fontSize: 13
            }}>
              ⚠ {error}
            </div>
          )}

          <button type="submit" disabled={loading} style={{
            width: '100%', padding: '13px', borderRadius: 10,
            background: loading ? 'var(--muted)' : 'var(--navy)',
            color: '#fff', border: 'none', fontSize: 15, fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
            fontFamily: 'DM Sans, sans-serif', marginTop: 4
          }}>
            {loading ? 'Signing in…' : '→ Sign In to Admin'}
          </button>
        </form>

        <div style={{ marginTop: 24, textAlign: 'center', fontSize: 12, color: 'var(--muted)' }}>
          MediFlow by Synergy Consultant · Admin Portal
        </div>
      </div>
    </div>
  )
}

const lStyle = { fontSize: 11, color: 'var(--slate)', fontWeight: 500, display: 'block', marginBottom: 6 }
const inputStyle = {
  width: '100%', border: '1.5px solid var(--border)', borderRadius: 8,
  padding: '10px 14px', fontSize: 14, outline: 'none', boxSizing: 'border-box',
  fontFamily: 'DM Sans, sans-serif', color: 'var(--navy)', transition: 'border 0.18s'
}
