// src/pages/admin/AdminCreateClient.jsx
import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AdminLayout from '../../components/AdminLayout'
import { createClientRecord, PLANS } from '../../firebase/adminDb'
import { createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth'
import { auth } from '../../firebase/config'
import { setDoc, doc, serverTimestamp } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { DEFAULT_TESTS } from '../../firebase/db'
import { DEFAULT_MEDICINES } from '../../firebase/clinicDb'
import { collection, addDoc } from 'firebase/firestore'

const CENTRE_TYPES = [
  { value: 'diagnostic', label: '🧪 Diagnostic Centre Only' },
  { value: 'clinic', label: '🩺 Clinic Only' },
  { value: 'both', label: '🏥 Both (Diagnostic + Clinic)' },
]

export default function AdminCreateClient() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(null)
  const [error, setError]     = useState('')

  const today = new Date().toISOString().split('T')[0]
  const trialEnd = new Date()
  trialEnd.setDate(trialEnd.getDate() + 14)
  const trialEndStr = trialEnd.toISOString().split('T')[0]

  const [form, setForm] = useState({
    centreName: '', ownerName: '', email: '', phone: '',
    centreType: 'diagnostic', plan: 'diagnostic_basic',
    subscriptionStartDate: today, subscriptionEndDate: trialEndStr,
    paid: false, address: '', gstNumber: '', city: ''
  })

  const setF = k => e => setForm(f => ({ ...f, [k]: e.target ? e.target.value : e }))

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      // 1. Create Firebase Auth account
      const tempPassword = `Mediflow@${Math.random().toString(36).slice(2, 8)}`
      const cred = await createUserWithEmailAndPassword(auth, form.email, tempPassword)
      const uid = cred.user.uid

      // 2. Create centre profile in Firestore
      await setDoc(doc(db, 'centres', uid, 'profile', 'main'), {
        centreName: form.centreName,
        ownerName: form.ownerName,
        email: form.email,
        phone: form.phone,
        address: form.address,
        gstNumber: form.gstNumber,
        city: form.city,
        centreType: form.centreType,
        aisynergyKey: '',
        createdAt: serverTimestamp()
      })

      // 3. Seed test/medicine catalogues
      if (form.centreType === 'diagnostic' || form.centreType === 'both') {
        const testsRef = collection(db, 'centres', uid, 'tests')
        for (const t of DEFAULT_TESTS) await addDoc(testsRef, t)
      }
      if (form.centreType === 'clinic' || form.centreType === 'both') {
        const medsRef = collection(db, 'centres', uid, 'medicines')
        for (const m of DEFAULT_MEDICINES) await addDoc(medsRef, m)
      }

      // 4. Create admin client record
      await createClientRecord(uid, {
        centreId: uid,
        centreName: form.centreName,
        ownerName: form.ownerName,
        email: form.email,
        phone: form.phone,
        centreType: form.centreType,
        plan: form.plan,
        subscriptionStartDate: form.subscriptionStartDate,
        subscriptionEndDate: form.subscriptionEndDate,
        paid: form.paid,
        status: form.paid ? 'active' : 'trial',
        city: form.city,
      })

      // 5. Send password reset email so client sets their own password
      await sendPasswordResetEmail(auth, form.email)

      setSuccess({
        email: form.email,
        centreName: form.centreName,
        note: 'A password setup link has been sent to their email.'
      })
    } catch (err) {
      console.error(err)
      if (err.code === 'auth/email-already-in-use') {
        setError('This email is already registered. Use a different email.')
      } else {
        setError(`Failed: ${err.message}`)
      }
    }
    setLoading(false)
  }

  if (success) {
    return (
      <AdminLayout title="Client Created">
        <div style={{ maxWidth: 520, margin: '60px auto', textAlign: 'center' }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
          <h2 style={{ color: 'var(--navy)', marginBottom: 8 }}>Account Created!</h2>
          <p style={{ color: 'var(--slate)', marginBottom: 24 }}>
            <strong>{success.centreName}</strong> has been onboarded successfully.
          </p>
          <div style={{
            background: 'var(--teal-light)', borderRadius: 14, padding: '20px 24px',
            marginBottom: 24, textAlign: 'left'
          }}>
            <div style={{ fontSize: 13, color: 'var(--teal)', fontWeight: 600, marginBottom: 12 }}>
              📧 What happens next
            </div>
            <div style={{ fontSize: 13, color: 'var(--slate)', lineHeight: 1.7 }}>
              A <strong>password setup link</strong> has been sent to <strong>{success.email}</strong>.<br />
              They click the link, set their password, and log in at<br />
              <strong>mediflow.synergyconsultant.co.in</strong>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button onClick={() => navigate('/admin/clients')} style={btnStyle('#0D2B3E')}>
              ← All Clients
            </button>
            <button onClick={() => { setSuccess(null); setForm(f => ({ ...f, email: '', centreName: '', ownerName: '' })) }} style={btnStyle('#0B9E8A')}>
              + Add Another
            </button>
          </div>
        </div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout title="Add New Client">
      <div style={{ maxWidth: 680, margin: '0 auto' }}>
        <form onSubmit={handleSubmit}>

          {/* Centre Details */}
          <Section title="Centre Details">
            <Row>
              <Field label="Centre / Clinic Name *">
                <input value={form.centreName} onChange={setF('centreName')} required
                  placeholder="e.g. Sunrise Diagnostics" style={inputStyle} {...focusProps} />
              </Field>
              <Field label="City">
                <input value={form.city} onChange={setF('city')}
                  placeholder="e.g. Pune" style={inputStyle} {...focusProps} />
              </Field>
            </Row>
            <Field label="Address">
              <input value={form.address} onChange={setF('address')}
                placeholder="Full address" style={inputStyle} {...focusProps} />
            </Field>
            <Row>
              <Field label="GST Number (optional)">
                <input value={form.gstNumber} onChange={setF('gstNumber')}
                  placeholder="27AAAAA0000A1Z5" style={inputStyle} {...focusProps} />
              </Field>
              <Field label="Centre Type *">
                <select value={form.centreType} onChange={setF('centreType')} style={inputStyle}>
                  {CENTRE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </Field>
            </Row>
          </Section>

          {/* Owner / Login Details */}
          <Section title="Owner & Login Details">
            <div style={{ background: '#FEF6E7', borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#F5A623' }}>
              ⚠ The email below will be the client's login. A password setup link will be sent to this email automatically.
            </div>
            <Row>
              <Field label="Owner / Doctor Name *">
                <input value={form.ownerName} onChange={setF('ownerName')} required
                  placeholder="Dr. Rajesh Kumar" style={inputStyle} {...focusProps} />
              </Field>
              <Field label="Login Email *">
                <input type="email" value={form.email} onChange={setF('email')} required
                  placeholder="doctor@sunrise.com" style={inputStyle} {...focusProps} />
              </Field>
            </Row>
            <Field label="Phone Number">
              <input value={form.phone} onChange={setF('phone')}
                placeholder="10-digit mobile" style={inputStyle} {...focusProps} />
            </Field>
          </Section>

          {/* Subscription */}
          <Section title="Subscription">
            <Row>
              <Field label="Plan *">
                <select value={form.plan} onChange={setF('plan')} style={inputStyle}>
                  {Object.entries(PLANS).map(([key, p]) => (
                    <option key={key} value={key}>{p.label} — ₹{p.price}/mo</option>
                  ))}
                </select>
              </Field>
              <Field label="Payment Status">
                <select value={form.paid ? 'paid' : 'unpaid'} onChange={e => setForm(f => ({ ...f, paid: e.target.value === 'paid' }))} style={inputStyle}>
                  <option value="unpaid">Unpaid (Free Trial)</option>
                  <option value="paid">Paid</option>
                </select>
              </Field>
            </Row>
            <Row>
              <Field label="Subscription Start">
                <input type="date" value={form.subscriptionStartDate} onChange={setF('subscriptionStartDate')} style={inputStyle} />
              </Field>
              <Field label="Subscription End">
                <input type="date" value={form.subscriptionEndDate} onChange={setF('subscriptionEndDate')} style={inputStyle} />
              </Field>
            </Row>
          </Section>

          {error && (
            <div style={{ background: '#FDEAEA', color: '#E05252', padding: '12px 16px', borderRadius: 10, fontSize: 13, marginBottom: 20 }}>
              ⚠ {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 12 }}>
            <button type="button" onClick={() => navigate('/admin/clients')} style={btnStyle('#F4F7F9', '#4A5E6D')}>
              Cancel
            </button>
            <button type="submit" disabled={loading} style={btnStyle(loading ? '#8FA3AE' : '#0B9E8A')}>
              {loading ? 'Creating account…' : '✓ Create Client Account'}
            </button>
          </div>
        </form>
      </div>
    </AdminLayout>
  )
}

// ── HELPERS ───────────────────────────────────────────────────────────

function Section({ title, children }) {
  return (
    <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', marginBottom: 20, overflow: 'hidden' }}>
      <div style={{ padding: '14px 22px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 700, color: 'var(--navy)' }}>{title}</div>
      <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>{children}</div>
    </div>
  )
}

function Row({ children }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>{children}</div>
}

function Field({ label, children }) {
  return (
    <div>
      <label style={{ fontSize: 11, color: 'var(--slate)', fontWeight: 500, display: 'block', marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  )
}

const inputStyle = {
  width: '100%', border: '1.5px solid var(--border)', borderRadius: 8,
  padding: '10px 12px', fontSize: 13, outline: 'none', boxSizing: 'border-box',
  fontFamily: 'DM Sans, sans-serif', color: 'var(--navy)', background: 'var(--surface)'
}

const focusProps = {
  onFocus: e => e.target.style.borderColor = 'var(--teal)',
  onBlur: e => e.target.style.borderColor = 'var(--border)'
}

function btnStyle(bg, color = '#fff') {
  return {
    padding: '12px 24px', background: bg, color,
    border: 'none', borderRadius: 10, cursor: 'pointer',
    fontSize: 14, fontWeight: 600, fontFamily: 'DM Sans, sans-serif'
  }
}
