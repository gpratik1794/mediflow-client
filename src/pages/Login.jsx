// src/pages/Login.jsx
import React, { useState } from 'react'
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth'
import { auth } from '../firebase/config'
import { useNavigate } from 'react-router-dom'
import { Input, Btn, Toast } from '../components/UI'

export default function Login() {
  const [email, setEmail]           = useState('')
  const [password, setPassword]     = useState('')
  const [loading, setLoading]       = useState(false)
  const [toast, setToast]           = useState(null)
  const [showForgot, setShowForgot] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetSent, setResetSent]   = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
  const navigate = useNavigate()

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true)
    try {
      await signInWithEmailAndPassword(auth, email, password)
      navigate('/')
    } catch (err) {
      const msg = err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password'
        ? 'Invalid email or password.'
        : err.code === 'auth/user-disabled'
        ? 'This account has been deactivated. Contact Synergy Consultant.'
        : 'Sign in failed. Please try again.'
      setToast({ message: msg, type: 'error' })
    }
    setLoading(false)
  }

  async function handlePasswordReset(e) {
    e.preventDefault()
    if (!resetEmail) return
    setResetLoading(true)
    try {
      await sendPasswordResetEmail(auth, resetEmail)
      setResetSent(true)
    } catch (err) {
      setToast({ message: 'Could not send reset email. Check the address and try again.', type: 'error' })
    }
    setResetLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--navy)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'DM Sans, sans-serif'
    }}>
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.04,
        backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
        backgroundSize: '32px 32px'
      }} />

      <div className="fade-up" style={{
        background: 'var(--surface)', borderRadius: 20, padding: '40px 40px 32px',
        width: 420, maxWidth: '95vw', boxShadow: 'var(--shadow-lg)', position: 'relative'
      }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 52, height: 52, background: 'var(--teal)', borderRadius: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 26, margin: '0 auto 12px'
          }}>🏥</div>
          <div style={{ fontFamily: 'DM Serif Display, serif', fontSize: 26, color: 'var(--navy)' }}>MediFlow</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
            {showForgot ? 'Reset your password' : 'Sign in to your centre'}
          </div>
        </div>

        {showForgot ? (
          resetSent ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>📧</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--navy)', marginBottom: 8 }}>Reset link sent!</div>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 24, lineHeight: 1.6 }}>
                Check your inbox at <strong>{resetEmail}</strong>.<br />Click the link to set a new password.
              </div>
              <Btn onClick={() => { setShowForgot(false); setResetSent(false); setResetEmail('') }}
                style={{ width: '100%', justifyContent: 'center' }}>← Back to Sign In</Btn>
            </div>
          ) : (
            <form onSubmit={handlePasswordReset} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ background: 'var(--teal-light)', borderRadius: 10, padding: '12px 14px', fontSize: 13, color: 'var(--teal)', lineHeight: 1.6 }}>
                Enter your registered email. We'll send a password reset link.
              </div>
              <Input label="Registered Email *" type="email" value={resetEmail}
                onChange={e => setResetEmail(e.target.value)} placeholder="doctor@centre.com" required />
              <Btn type="submit" disabled={resetLoading} style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}>
                {resetLoading ? 'Sending…' : '📧 Send Reset Link'}
              </Btn>
              <button type="button" onClick={() => setShowForgot(false)} style={{
                background: 'none', border: 'none', color: 'var(--muted)', fontSize: 13,
                cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', textAlign: 'center'
              }}>← Back to Sign In</button>
            </form>
          )
        ) : (
          <>
            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Input label="Email Address" type="email" value={email}
                onChange={e => setEmail(e.target.value)} placeholder="doctor@centre.com" required />
              <div>
                <Input label="Password" type="password" value={password}
                  onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
                <div style={{ textAlign: 'right', marginTop: 6 }}>
                  <button type="button" onClick={() => setShowForgot(true)} style={{
                    background: 'none', border: 'none', color: 'var(--teal)', fontSize: 12,
                    cursor: 'pointer', fontFamily: 'DM Sans, sans-serif'
                  }}>Forgot password?</button>
                </div>
              </div>
              <Btn type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}>
                {loading ? 'Signing in…' : 'Sign In'}
              </Btn>
            </form>
            <div style={{
              marginTop: 24, padding: '14px 16px', background: 'var(--bg)', borderRadius: 10,
              fontSize: 12, color: 'var(--muted)', textAlign: 'center', lineHeight: 1.6
            }}>
              Don't have an account? Contact <strong style={{ color: 'var(--teal)' }}>Synergy Consultant</strong> to get started.
            </div>
          </>
        )}
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
