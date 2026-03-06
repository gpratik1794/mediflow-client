// src/pages/admin/AdminClientDetail.jsx
import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import AdminLayout from '../../components/AdminLayout'
import {
  getClient, updateClient, deactivateClient, reactivateClient,
  getSubscriptionStatus, toggleModule, PLANS
} from '../../firebase/adminDb'

const STATUS_STYLE = {
  active:      { bg: '#E6F7F0', color: '#27AE7A', label: 'Active' },
  trial:       { bg: '#FEF6E7', color: '#F5A623', label: 'Free Trial' },
  expired:     { bg: '#FDEAEA', color: '#E05252', label: 'Expired' },
  deactivated: { bg: '#F4F7F9', color: '#8FA3AE', label: 'Deactivated' },
}

export default function AdminClientDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [client, setClient]     = useState(null)
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [toast, setToast]       = useState(null)
  const [editMode, setEditMode] = useState(false)
  const [deactivateModal, setDeactivateModal] = useState(false)
  const [confirmName, setConfirmName] = useState('')
  const [form, setForm]         = useState({})

  useEffect(() => { load() }, [id])

  async function load() {
    setLoading(true)
    const data = await getClient(id)
    setClient(data)
    setForm(data || {})
    setLoading(false)
  }

  const setF = k => e => setForm(f => ({ ...f, [k]: e.target ? e.target.value : e }))

  async function handleSave() {
    setSaving(true)
    const selectedPlan = PLANS[form.plan]
    await updateClient(id, {
      centreName: form.centreName,
      ownerName: form.ownerName,
      phone: form.phone,
      plan: form.plan,
      paid: form.paid,
      subscriptionStartDate: form.subscriptionStartDate,
      subscriptionEndDate: form.subscriptionEndDate,
      city: form.city,
      address: form.address,
      ...(selectedPlan?.centreType ? { centreType: selectedPlan.centreType } : {}),
    })
    // Auto-apply modules from plan
    if (selectedPlan?.modules) {
      const hasVaccination = selectedPlan.modules.includes('vaccination')
      await toggleModule(id, 'vaccination', hasVaccination)
    }
    await load()
    setEditMode(false)
    showToast('Changes saved', 'success')
    setSaving(false)
  }

  async function handleDeactivate() {
    if (confirmName.trim().toLowerCase() !== client.centreName.trim().toLowerCase()) {
      showToast('Centre name does not match', 'error')
      return
    }
    await deactivateClient(id)
    setDeactivateModal(false)
    setConfirmName('')
    await load()
    showToast('Account deactivated', 'success')
  }

  async function handleReactivate() {
    await reactivateClient(id)
    await load()
    showToast('Account reactivated', 'success')
  }

  function showToast(msg, type) {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  if (loading) return <AdminLayout title="Client"><div style={{ padding: 60, textAlign: 'center', color: 'var(--muted)' }}>Loading…</div></AdminLayout>
  if (!client) return <AdminLayout title="Not Found"><div style={{ padding: 60 }}>Client not found</div></AdminLayout>

  const status = getSubscriptionStatus(client)
  const ss = STATUS_STYLE[status] || STATUS_STYLE.trial
  const plan = PLANS[client.plan]
  const isDeactivated = client.status === 'deactivated'

  return (
    <AdminLayout
      title={client.centreName}
      action={
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => navigate('/admin/clients')} style={ghostBtn}>
            ← All Clients
          </button>
          {!editMode ? (
            <button onClick={() => setEditMode(true)} style={tealBtn}>
              ✏ Edit
            </button>
          ) : (
            <>
              <button onClick={() => { setEditMode(false); setForm(client) }} style={ghostBtn}>Cancel</button>
              <button onClick={handleSave} disabled={saving} style={tealBtn}>
                {saving ? 'Saving…' : '💾 Save Changes'}
              </button>
            </>
          )}
        </div>
      }
    >
      {/* Status banner for deactivated */}
      {isDeactivated && (
        <div style={{
          background: '#FDEAEA', border: '1px solid #E05252', borderRadius: 12,
          padding: '14px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between'
        }}>
          <div style={{ color: '#E05252', fontWeight: 600, fontSize: 14 }}>
            ⛔ This account is deactivated. The client cannot log in.
          </div>
          <button onClick={handleReactivate} style={{
            padding: '8px 18px', background: '#27AE7A', color: '#fff',
            border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'DM Sans, sans-serif'
          }}>
            ↺ Reactivate
          </button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>

        {/* Left — Details */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Centre Info */}
          <div style={cardStyle}>
            <div style={cardHead}>Centre Information</div>
            <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {editMode ? (
                <>
                  <EditField label="Centre Name" value={form.centreName} onChange={setF('centreName')} />
                  <EditField label="Owner / Doctor Name" value={form.ownerName} onChange={setF('ownerName')} />
                  <EditField label="Phone" value={form.phone} onChange={setF('phone')} />
                  <EditField label="City" value={form.city} onChange={setF('city')} />
                  <EditField label="Address" value={form.address} onChange={setF('address')} />
                </>
              ) : (
                <>
                  <InfoRow label="Centre Name"   value={client.centreName} />
                  <InfoRow label="Owner"         value={client.ownerName} />
                  <InfoRow label="Login Email"   value={client.email} />
                  <InfoRow label="Phone"         value={client.phone || '—'} />
                  <InfoRow label="City"          value={client.city || '—'} />
                  <InfoRow label="Address"       value={client.address || '—'} />
                  <InfoRow label="Centre Type"   value={client.centreType === 'both' ? 'Diagnostic + Clinic' : client.centreType} />
                  <InfoRow label="Firebase UID"  value={<span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--muted)' }}>{id}</span>} />
                </>
              )}
            </div>
          </div>

          {/* Subscription */}
          <div style={cardStyle}>
            <div style={cardHead}>Subscription</div>
            <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {editMode ? (
                <>
                  <div>
                    <label style={lStyle}>Plan</label>
                    <select value={form.plan} onChange={setF('plan')} style={inputStyle}>
                      {Object.entries(PLANS).map(([key, p]) => (
                        <option key={key} value={key}>{p.label} — ₹{p.price}/mo</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={lStyle}>Payment</label>
                    <select value={form.paid ? 'paid' : 'unpaid'} onChange={e => setForm(f => ({ ...f, paid: e.target.value === 'paid' }))} style={inputStyle}>
                      <option value="unpaid">Unpaid (Free Trial)</option>
                      <option value="paid">Paid</option>
                    </select>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={lStyle}>Start Date</label>
                      <input type="date" value={form.subscriptionStartDate || ''} onChange={setF('subscriptionStartDate')} style={inputStyle} />
                    </div>
                    <div>
                      <label style={lStyle}>End Date</label>
                      <input type="date" value={form.subscriptionEndDate || ''} onChange={setF('subscriptionEndDate')} style={inputStyle} />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <InfoRow label="Plan"       value={plan ? `${plan.label} — ₹${plan.price}/mo` : client.plan || '—'} />
                  <InfoRow label="Payment"    value={client.paid ? '✓ Paid' : 'Unpaid'} valueColor={client.paid ? '#27AE7A' : '#F5A623'} />
                  <InfoRow label="Start Date" value={client.subscriptionStartDate || '—'} />
                  <InfoRow label="End Date"   value={client.subscriptionEndDate || 'No end date'} />
                  <InfoRow label="Created"    value={client.createdAt?.toDate?.()?.toLocaleDateString() || '—'} />
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right — Status + Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Status Card */}
          <div style={{ ...cardStyle, background: ss.bg }}>
            <div style={{ padding: '22px', textAlign: 'center' }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>
                {status === 'active' ? '✅' : status === 'trial' ? '⏳' : status === 'expired' ? '⚠' : '🚫'}
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: ss.color }}>{ss.label}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
                {status === 'active' && `Paid · Expires ${client.subscriptionEndDate}`}
                {status === 'trial' && `Trial ends ${client.subscriptionEndDate}`}
                {status === 'expired' && `Expired on ${client.subscriptionEndDate}`}
                {status === 'deactivated' && 'Account manually deactivated'}
              </div>
            </div>
          </div>

          {/* Quick toggles */}
          <div style={cardStyle}>
            <div style={cardHead}>Quick Actions</div>
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button onClick={async () => {
                await updateClient(id, { paid: !client.paid, status: !client.paid ? 'active' : 'trial' })
                await load()
                showToast(!client.paid ? 'Marked as paid' : 'Marked as unpaid', 'success')
              }} style={{
                padding: '10px 16px', borderRadius: 10, border: '1.5px solid',
                borderColor: client.paid ? '#E05252' : '#27AE7A',
                background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                color: client.paid ? '#E05252' : '#27AE7A',
                fontFamily: 'DM Sans, sans-serif', textAlign: 'left'
              }}>
                {client.paid ? '✕ Mark as Unpaid' : '✓ Mark as Paid'}
              </button>

              <button onClick={async () => {
                const newEnd = new Date()
                newEnd.setFullYear(newEnd.getFullYear() + 1)
                const endStr = newEnd.toISOString().split('T')[0]
                await updateClient(id, { subscriptionEndDate: endStr })
                await load()
                showToast('Extended by 1 year', 'success')
              }} style={{
                padding: '10px 16px', borderRadius: 10, border: '1.5px solid var(--border)',
                background: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--slate)',
                fontFamily: 'DM Sans, sans-serif', textAlign: 'left'
              }}>
                🗓 Extend by 1 Year
              </button>

              <button onClick={async () => {
                const newEnd = new Date()
                newEnd.setMonth(newEnd.getMonth() + 1)
                const endStr = newEnd.toISOString().split('T')[0]
                await updateClient(id, { subscriptionEndDate: endStr })
                await load()
                showToast('Extended by 1 month', 'success')
              }} style={{
                padding: '10px 16px', borderRadius: 10, border: '1.5px solid var(--border)',
                background: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--slate)',
                fontFamily: 'DM Sans, sans-serif', textAlign: 'left'
              }}>
                🗓 Extend by 1 Month
              </button>
            </div>
          </div>

          {/* Add-on Modules */}
          <div style={cardStyle}>
            <div style={cardHead}>🧩 Add-on Modules</div>
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { key: 'vaccination', label: '💉 Vaccination Module', desc: 'Child profiles, vaccine schedules, parent WhatsApp reminders', forTypes: ['clinic', 'both'] },
              ].filter(mod => !mod.forTypes || mod.forTypes.includes(client.centreType)).map(mod => {
                const isOn = client.modules?.[mod.key] === true
                return (
                  <div key={mod.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 10, border: '1.5px solid var(--border)', background: isOn ? '#F0FDF4' : 'var(--bg)' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>{mod.label}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{mod.desc}</div>
                    </div>
                    <button onClick={async () => {
                      await toggleModule(id, mod.key, !isOn)
                      await load()
                      showToast(`${mod.label} ${!isOn ? 'enabled' : 'disabled'}`, 'success')
                    }} style={{
                      padding: '6px 16px', borderRadius: 20, border: '1.5px solid',
                      borderColor: isOn ? '#16A34A' : 'var(--border)',
                      background: isOn ? '#16A34A' : 'none',
                      color: isOn ? '#fff' : 'var(--slate)',
                      fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      fontFamily: 'DM Sans, sans-serif', flexShrink: 0, marginLeft: 16
                    }}>
                      {isOn ? '● ON' : '○ OFF'}
                    </button>
                  </div>
                )
              })}
              {(!client.centreType || client.centreType === 'diagnostic') && (
                <div style={{ fontSize: 12, color: 'var(--muted)', padding: '8px 4px' }}>
                  No add-on modules available for Diagnostic-only centres.
                </div>
              )}
            </div>
          </div>

          {/* Danger zone */}
          {!isDeactivated && (
            <div style={{ ...cardStyle, border: '1.5px solid #E05252' }}>
              <div style={{ ...cardHead, color: '#E05252', borderColor: '#F5C6C6' }}>⚠ Danger Zone</div>
              <div style={{ padding: '16px 20px' }}>
                <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14, lineHeight: 1.6 }}>
                  Deactivating this account will immediately block the client from logging in. Their data will not be deleted.
                </p>
                <button onClick={() => setDeactivateModal(true)} style={{
                  width: '100%', padding: '11px', background: '#FDEAEA',
                  color: '#E05252', border: '1.5px solid #E05252', borderRadius: 10,
                  cursor: 'pointer', fontSize: 13, fontWeight: 600,
                  fontFamily: 'DM Sans, sans-serif'
                }}>
                  🚫 Deactivate Account
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Deactivate Confirmation Modal */}
      {deactivateModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div style={{
            background: 'var(--surface)', borderRadius: 16, padding: 32,
            width: 460, boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
          }}>
            <div style={{ fontSize: 32, textAlign: 'center', marginBottom: 16 }}>🚫</div>
            <h3 style={{ margin: '0 0 8px', color: '#E05252', textAlign: 'center' }}>Deactivate Account?</h3>
            <p style={{ color: 'var(--slate)', fontSize: 13, lineHeight: 1.7, textAlign: 'center', marginBottom: 20 }}>
              This will immediately block <strong>{client.centreName}</strong> from logging in.
              Their data will be preserved. This action can be reversed.
            </p>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, color: 'var(--slate)', display: 'block', marginBottom: 8 }}>
                Type the centre name to confirm: <strong>{client.centreName}</strong>
              </label>
              <input
                value={confirmName}
                onChange={e => setConfirmName(e.target.value)}
                placeholder={client.centreName}
                style={{ ...inputStyle, borderColor: '#E05252' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => { setDeactivateModal(false); setConfirmName('') }} style={{ ...ghostBtn, flex: 1, justifyContent: 'center', padding: '12px' }}>
                Cancel
              </button>
              <button
                onClick={handleDeactivate}
                disabled={confirmName.trim().toLowerCase() !== client.centreName.trim().toLowerCase()}
                style={{
                  flex: 1, padding: '12px', borderRadius: 10, border: 'none',
                  background: confirmName.trim().toLowerCase() === client.centreName.trim().toLowerCase() ? '#E05252' : '#ccc',
                  color: '#fff', cursor: confirmName.trim().toLowerCase() === client.centreName.trim().toLowerCase() ? 'pointer' : 'not-allowed',
                  fontSize: 14, fontWeight: 600, fontFamily: 'DM Sans, sans-serif'
                }}
              >
                Confirm Deactivate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24,
          background: toast.type === 'success' ? '#27AE7A' : '#E05252',
          color: '#fff', padding: '12px 20px', borderRadius: 10,
          fontSize: 14, fontWeight: 500, zIndex: 1000,
          boxShadow: '0 4px 20px rgba(0,0,0,0.2)'
        }}>
          {toast.msg}
        </div>
      )}
    </AdminLayout>
  )
}

function InfoRow({ label, value, valueColor }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', fontSize: 13 }}>
      <span style={{ color: 'var(--muted)', flexShrink: 0 }}>{label}</span>
      <span style={{ fontWeight: 500, color: valueColor || 'var(--navy)', textAlign: 'right', maxWidth: 280 }}>{value}</span>
    </div>
  )
}

function EditField({ label, value, onChange, type = 'text' }) {
  return (
    <div>
      <label style={lStyle}>{label}</label>
      <input type={type} value={value || ''} onChange={onChange} style={inputStyle}
        onFocus={e => e.target.style.borderColor = 'var(--teal)'}
        onBlur={e => e.target.style.borderColor = 'var(--border)'}
      />
    </div>
  )
}

const cardStyle = { background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden' }
const cardHead = { padding: '14px 22px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 700, color: 'var(--navy)' }
const lStyle = { fontSize: 11, color: 'var(--slate)', fontWeight: 500, display: 'block', marginBottom: 6 }
const inputStyle = {
  width: '100%', border: '1.5px solid var(--border)', borderRadius: 8,
  padding: '9px 12px', fontSize: 13, outline: 'none', boxSizing: 'border-box',
  fontFamily: 'DM Sans, sans-serif', color: 'var(--navy)', background: 'var(--surface)',
  transition: 'border 0.18s'
}
const ghostBtn = {
  padding: '9px 18px', background: 'var(--bg)', color: 'var(--slate)',
  border: '1.5px solid var(--border)', borderRadius: 10, cursor: 'pointer',
  fontSize: 13, fontFamily: 'DM Sans, sans-serif'
}
const tealBtn = {
  padding: '9px 18px', background: 'var(--teal)', color: '#fff',
  border: 'none', borderRadius: 10, cursor: 'pointer',
  fontSize: 13, fontWeight: 600, fontFamily: 'DM Sans, sans-serif'
}
