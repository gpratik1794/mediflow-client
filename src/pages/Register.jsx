// src/pages/Register.jsx
import React, { useState } from 'react'
import { createUserWithEmailAndPassword } from 'firebase/auth'
import { auth } from '../firebase/config'
import { saveCentreProfile, DEFAULT_TESTS, saveTest } from '../firebase/db'
import { useNavigate, Link } from 'react-router-dom'
import { Input, Select, Btn, Toast } from '../components/UI'

export default function Register() {
  const [step, setStep]         = useState(1)
  const [loading, setLoading]   = useState(false)
  const [toast, setToast]       = useState(null)
  const navigate = useNavigate()

  const [form, setForm] = useState({
    email: '', password: '',
    centreName: '', ownerName: '', phone: '', city: '', address: '',
    type: 'diagnostic', // or 'clinic' or 'both'
    gst: '', gstNumber: '',
    aisynergyKey: ''
  })

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  async function handleRegister(e) {
    e.preventDefault()
    setLoading(true)
    try {
      const cred = await createUserWithEmailAndPassword(auth, form.email, form.password)
      const uid = cred.user.uid

      // Save centre profile
      await saveCentreProfile(uid, {
        centreName: form.centreName,
        ownerName: form.ownerName,
        phone: form.phone,
        city: form.city,
        address: form.address,
        type: form.type,
        gst: form.gst,
        gstNumber: form.gstNumber,
        aisynergyKey: form.aisynergyKey,
        createdAt: new Date().toISOString()
      })

      // Seed default test catalogue
      for (const test of DEFAULT_TESTS) {
        await saveTest(uid, test)
      }

      navigate('/')
    } catch (err) {
      setToast({ message: err.message || 'Registration failed', type: 'error' })
    }
    setLoading(false)
  }

  const typeOptions = [
    { value: 'diagnostic', label: 'Diagnostic Centre' },
    { value: 'clinic',     label: 'Clinic' },
    { value: 'both',       label: 'Clinic + Diagnostic Centre' },
  ]

  const gstOptions = [
    { value: '0',  label: '0% (No GST)' },
    { value: '5',  label: '5% GST' },
    { value: '12', label: '12% GST' },
    { value: '18', label: '18% GST' },
  ]

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--navy)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'DM Sans, sans-serif', padding: '32px 16px'
    }}>
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.04,
        backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
        backgroundSize: '32px 32px'
      }} />

      <div className="fade-up" style={{
        background: 'var(--surface)', borderRadius: 20, padding: '40px',
        width: 520, maxWidth: '95vw', boxShadow: 'var(--shadow-lg)', position: 'relative'
      }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 48, height: 48, background: 'var(--teal)', borderRadius: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 24, margin: '0 auto 10px'
          }}>🏥</div>
          <div style={{ fontFamily: 'DM Serif Display, serif', fontSize: 24, color: 'var(--navy)' }}>
            Create your MediFlow account
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
            Step {step} of 3
          </div>
        </div>

        {/* Progress */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 28 }}>
          {[1,2,3].map(s => (
            <div key={s} style={{
              flex: 1, height: 4, borderRadius: 4,
              background: s <= step ? 'var(--teal)' : 'var(--border)',
              transition: 'background 0.3s'
            }} />
          ))}
        </div>

        <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {step === 1 && (
            <>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--navy)', marginBottom: 4 }}>
                Account Details
              </div>
              <Input label="Email Address" type="email" value={form.email}
                onChange={set('email')} placeholder="admin@mycentre.com" required />
              <Input label="Password" type="password" value={form.password}
                onChange={set('password')} placeholder="Min 6 characters" required />
              <Input label="Owner / Admin Name" value={form.ownerName}
                onChange={set('ownerName')} placeholder="Your full name" required />
              <Btn onClick={() => setStep(2)} style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}>
                Continue →
              </Btn>
            </>
          )}

          {step === 2 && (
            <>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--navy)', marginBottom: 4 }}>
                Centre Details
              </div>
              <Select label="Centre Type" value={form.type} onChange={set('type')} options={typeOptions} required />
              <Input label="Centre / Clinic Name" value={form.centreName}
                onChange={set('centreName')} placeholder="e.g. Sunrise Diagnostics" required />
              <Input label="Contact Phone" type="tel" value={form.phone}
                onChange={set('phone')} placeholder="+91 XXXXXXXXXX" required />
              <div style={{ display: 'flex', gap: 12 }}>
                <Input label="City" value={form.city} onChange={set('city')} placeholder="e.g. Jaipur" required />
              </div>
              <Input label="Full Address" value={form.address}
                onChange={set('address')} placeholder="Street, Area, City, PIN" required />
              <div style={{ display: 'flex', gap: 10 }}>
                <Btn variant="ghost" onClick={() => setStep(1)} style={{ flex: 1, justifyContent: 'center' }}>
                  ← Back
                </Btn>
                <Btn onClick={() => setStep(3)} style={{ flex: 2, justifyContent: 'center' }}>
                  Continue →
                </Btn>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--navy)', marginBottom: 4 }}>
                Billing & WhatsApp Setup
              </div>
              <Select label="Default GST Rate for Tests" value={form.gst} onChange={set('gst')} options={gstOptions} />
              <Input label="GST Number (optional)" value={form.gstNumber}
                onChange={set('gstNumber')} placeholder="22AAAAA0000A1Z5" />
              <Input label="Aisynergy API Key (WhatsApp)" value={form.aisynergyKey}
                onChange={set('aisynergyKey')} placeholder="Your API key from Aisynergy dashboard" />
              <div style={{
                background: 'var(--teal-light)', border: '1px solid var(--teal-mid)',
                borderRadius: 10, padding: '10px 14px', fontSize: 12, color: 'var(--teal)'
              }}>
                💡 You can skip WhatsApp setup now and add your key later in Settings
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <Btn variant="ghost" onClick={() => setStep(2)} style={{ flex: 1, justifyContent: 'center' }}>
                  ← Back
                </Btn>
                <Btn type="submit" disabled={loading} style={{ flex: 2, justifyContent: 'center' }}>
                  {loading ? 'Creating account…' : '🎉 Launch MediFlow'}
                </Btn>
              </div>
            </>
          )}
        </form>

        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: 'var(--muted)' }}>
          Already have an account?{' '}
          <Link to="/login" style={{ color: 'var(--teal)', fontWeight: 500 }}>Sign in</Link>
        </div>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
