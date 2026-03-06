// src/pages/Settings.jsx
import React, { useState, useEffect } from 'react'
import { useAuth } from '../utils/AuthContext'
import Layout from '../components/Layout'
import { Card, CardHeader, Input, Select, Btn, Toast } from '../components/UI'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase/config'
import { parseCurl, sendCampaign } from '../firebase/whatsapp'

// ── Helpers defined outside component so they never remount ──────────────────

function Section({ title, children }) {
  return (
    <Card style={{ marginBottom: 20 }}>
      <CardHeader title={title} />
      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {children}
      </div>
    </Card>
  )
}

const PURPOSE_OPTIONS = [
  { value: 'bill_generated', label: 'bill_generated — Bill created (diagnostic)' },
  { value: 'report_ready',   label: 'report_ready — Report ready (diagnostic)' },
  { value: 'appt_confirm',   label: 'appt_confirm — Appointment booked (clinic)' },
  { value: 'followup',       label: 'followup — Follow-up reminder (clinic)' },
  { value: 'custom',         label: 'custom — Other / custom use' },
]

const TYPE_LABELS = {
  diagnostic: 'Diagnostic Centre',
  clinic: 'Clinic',
  both: 'Clinic + Diagnostic',
}

// Add-new-campaign sub-form — also outside main component
function CampaignAdder({ onAdd }) {
  const [open, setOpen]     = useState(false)
  const [name, setName]     = useState('')
  const [purpose, setPurpose] = useState('bill_generated')
  const [curl, setCurl]     = useState('')
  const [preview, setPreview] = useState(null)
  const [err, setErr]       = useState('')

  function handleCurlChange(v) {
    setCurl(v)
    setErr('')
    if (v.length > 20) {
      const parsed = parseCurl(v)
      setPreview(parsed)
    } else {
      setPreview(null)
    }
  }

  function handleAdd() {
    if (!name.trim()) { setErr('Enter a campaign name'); return }
    if (!curl.trim())  { setErr('Paste the cURL'); return }
    const parsed = parseCurl(curl)
    if (!parsed)       { setErr('Could not parse cURL — paste the full curl command including -d and the URL at the end'); return }
    if (!parsed.apiKey){ setErr('No apiKey found in cURL body'); return }
    onAdd({ name: name.trim(), purpose, curl: curl.trim() })
    setName(''); setCurl(''); setPreview(null); setErr(''); setOpen(false)
  }

  if (!open) return (
    <button type="button" onClick={() => setOpen(true)} style={{
      padding: '10px 18px', borderRadius: 10, border: '1.5px dashed var(--teal)',
      background: 'none', color: 'var(--teal)', fontSize: 13, fontWeight: 600,
      cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', width: '100%'
    }}>+ Add Campaign</button>
  )

  return (
    <div style={{ border: '1.5px solid var(--teal)', borderRadius: 12, padding: '18px', display: 'flex', flexDirection: 'column', gap: 12, background: 'var(--teal-light)' }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--teal)' }}>Add New Campaign</div>

      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 11, color: 'var(--slate)', fontWeight: 500, display: 'block', marginBottom: 5 }}>Campaign Label (your name for it)</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Bill Notification"
            style={{ width: '100%', padding: '9px 13px', borderRadius: 9, border: '1.5px solid var(--border)', fontSize: 13, fontFamily: 'DM Sans, sans-serif', boxSizing: 'border-box', background: '#fff' }} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 11, color: 'var(--slate)', fontWeight: 500, display: 'block', marginBottom: 5 }}>Purpose (when to send this)</label>
          <select value={purpose} onChange={e => setPurpose(e.target.value)} style={{
            width: '100%', padding: '10px 13px', borderRadius: 9, border: '1.5px solid var(--border)',
            fontSize: 13, fontFamily: 'DM Sans, sans-serif', background: '#fff', color: 'var(--navy)', boxSizing: 'border-box'
          }}>
            {PURPOSE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label style={{ fontSize: 11, color: 'var(--slate)', fontWeight: 500, display: 'block', marginBottom: 5 }}>
          Paste full cURL from AiSynergy → Campaigns → your campaign → API
        </label>
        <textarea value={curl} onChange={e => handleCurlChange(e.target.value)}
          placeholder={"curl -X POST -H \"Content-Type: application/json\" -d '{\n  \"apiKey\": \"...\",\n  \"campaignName\": \"...\",\n  ...\n}' https://backend.api-wa.co/campaign/aisynergy/api/v2"}
          style={{
            width: '100%', minHeight: 110, padding: '10px 13px', borderRadius: 9,
            border: '1.5px solid var(--border)', fontSize: 11, fontFamily: 'monospace',
            background: '#fff', resize: 'vertical', lineHeight: 1.6, boxSizing: 'border-box'
          }} />
      </div>

      {/* Preview parsed result */}
      {preview && (
        <div style={{ background: '#E6F7F5', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#0B9E8A', lineHeight: 1.8 }}>
          ✅ cURL parsed successfully<br />
          Campaign: <strong>{preview.campaignName}</strong> · {preview.paramCount} template param{preview.paramCount !== 1 ? 's' : ''}
          {preview.hasMedia && ' · includes media/document'}
        </div>
      )}

      {err && (
        <div style={{ background: '#FEF2F2', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#C0392B' }}>
          {err}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={handleAdd} style={{
          padding: '9px 20px', borderRadius: 9, border: 'none', background: 'var(--teal)',
          color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif'
        }}>Save Campaign</button>
        <button type="button" onClick={() => { setOpen(false); setName(''); setCurl(''); setPreview(null); setErr('') }} style={{
          padding: '9px 16px', borderRadius: 9, border: '1.5px solid var(--border)',
          background: '#fff', color: 'var(--slate)', fontSize: 13, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif'
        }}>Cancel</button>
      </div>
    </div>
  )
}

// Inline test for a single campaign — shown inside each campaign card
function CampaignInlineTest({ campaign, centreName, campaigns }) {
  const [phone, setPhone]   = useState('')
  const [status, setStatus] = useState(null)
  const [detail, setDetail] = useState('')
  const [open, setOpen]     = useState(false)

  async function runTest() {
    if (!phone || phone.replace(/\D/g,'').length < 10) {
      setStatus('fail'); setDetail('Enter a valid 10-digit phone number.'); return
    }
    setStatus('sending'); setDetail('')
    const result = await sendCampaign(
      campaigns, campaign.purpose, phone,
      ['Test Patient', centreName || 'Test Centre', '500']
    )
    if (result.ok) {
      setStatus('ok'); setDetail(`Sent to ${phone}. Check WhatsApp.`)
    } else {
      setStatus('fail'); setDetail(result.error)
    }
  }

  if (!open) return (
    <button type="button" onClick={() => setOpen(true)} style={{
      background: 'none', border: 'none', color: 'var(--teal)', fontSize: 12,
      cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', padding: 0, textAlign: 'left'
    }}>▶ Test this campaign</button>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 11, color: 'var(--slate)', fontWeight: 500, display: 'block', marginBottom: 4 }}>
            Send test to
          </label>
          <input value={phone} onChange={e => setPhone(e.target.value)}
            placeholder="10-digit number"
            style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid var(--border)',
              fontSize: 13, fontFamily: 'DM Sans, sans-serif', boxSizing: 'border-box' }} />
        </div>
        <button type="button" onClick={runTest} disabled={status === 'sending'} style={{
          padding: '9px 16px', borderRadius: 8, border: 'none',
          background: status === 'sending' ? 'var(--border)' : 'var(--teal)',
          color: '#fff', fontSize: 12, fontWeight: 600,
          cursor: status === 'sending' ? 'default' : 'pointer',
          fontFamily: 'DM Sans, sans-serif', whiteSpace: 'nowrap'
        }}>
          {status === 'sending' ? 'Sending…' : 'Send Test'}
        </button>
        <button type="button" onClick={() => { setOpen(false); setStatus(null) }} style={{
          padding: '9px 10px', borderRadius: 8, border: '1.5px solid var(--border)',
          background: 'none', fontSize: 12, cursor: 'pointer', color: 'var(--muted)',
          fontFamily: 'DM Sans, sans-serif'
        }}>✕</button>
      </div>
      {status && status !== 'sending' && (
        <div style={{
          padding: '7px 12px', borderRadius: 8, fontSize: 12,
          background: status === 'ok' ? '#E6F7F5' : '#FEF2F2',
          color: status === 'ok' ? '#0B9E8A' : '#C0392B'
        }}>
          {status === 'ok' ? '✅ ' : '⚠ '}{detail}
        </div>
      )}
    </div>
  )
}

// Test a saved campaign — KEPT for backward compat but no longer rendered
function CampaignTester({ campaigns, purpose, phone, centreName }) {
  return null
}

// ── Main Settings component ───────────────────────────────────────────────────

export default function Settings() {
  const { user, profile } = useAuth()
  const [toast, setToast]   = useState(null)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    centreName:        '',
    ownerName:         '',
    phone:             '',
    city:              '',
    address:           '',
    centreType:        'diagnostic',
    gst:               '0',
    gstNumber:         '',
    slotDuration:      '30',
    clinicStart:       '09:00',
    clinicEnd:         '20:00',
    whatsappCampaigns: [],
    lateCheckinPenalty: '0',
  })

  useEffect(() => {
    if (profile) {
      setForm(f => ({
        ...f,
        centreName:        profile.centreName        || '',
        ownerName:         profile.ownerName         || '',
        phone:             profile.phone             || '',
        city:              profile.city              || '',
        address:           profile.address           || '',
        centreType:        profile.centreType        || 'diagnostic',
        gst:               profile.gst               || '0',
        gstNumber:         profile.gstNumber         || '',
        slotDuration:      profile.slotDuration      || '30',
        clinicStart:       profile.clinicStart       || '09:00',
        clinicEnd:         profile.clinicEnd         || '20:00',
        whatsappCampaigns: profile.whatsappCampaigns || [],
        lateCheckinPenalty: profile.lateCheckinPenalty || '0',
      }))
    }
  }, [profile])

  const setF = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await setDoc(
        doc(db, 'centres', user.uid, 'profile', 'main'),
        { ...form, updatedAt: serverTimestamp() },
        { merge: true }
      )
      setToast({ message: 'Settings saved successfully', type: 'success' })
    } catch (err) {
      console.error(err)
      setToast({ message: 'Failed to save settings', type: 'error' })
    }
    setSaving(false)
  }

  const gstOpts = [
    { value: '0',  label: '0% GST' },
    { value: '5',  label: '5%' },
    { value: '12', label: '12%' },
    { value: '18', label: '18%' },
  ]

  const centreType = form.centreType || 'diagnostic'

  return (
    <Layout title="Settings">
      <form onSubmit={handleSave} style={{ maxWidth: 680 }}>

        <Section title="Centre Information">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, color: 'var(--slate)', fontWeight: 500 }}>Centre Type</label>
            <div style={{
              padding: '10px 14px', borderRadius: 10, border: '1.5px solid var(--border)',
              background: 'var(--bg)', fontSize: 13, color: 'var(--muted)',
              display: 'flex', alignItems: 'center', gap: 8
            }}>
              {TYPE_LABELS[centreType] || 'Diagnostic Centre'}
              <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 4 }}>(set by admin)</span>
            </div>
          </div>
          <Input label="Centre / Clinic Name" value={form.centreName} onChange={setF('centreName')} placeholder="e.g. Sunrise Diagnostics" required />
          <Input label="Owner / Admin Name"   value={form.ownerName}  onChange={setF('ownerName')}  placeholder="Full name" required />
          <div style={{ display: 'flex', gap: 12 }}>
            <Input label="Phone" type="tel" value={form.phone} onChange={setF('phone')} placeholder="+91 XXXXXXXXXX" />
            <Input label="City"             value={form.city}  onChange={setF('city')}  placeholder="City" />
          </div>
          <Input label="Full Address" value={form.address} onChange={setF('address')} placeholder="Street, Area, City, PIN" />
        </Section>

        {(centreType === 'clinic' || centreType === 'both') && (
          <Section title="Clinic Settings">
            <Select label="Appointment Slot Duration" value={form.slotDuration} onChange={setF('slotDuration')}
              options={[
                { value: '5',  label: '5 minutes (12 slots/hour)' },
                { value: '10', label: '10 minutes (6 slots/hour)' },
                { value: '15', label: '15 minutes (4 slots/hour)' },
                { value: '20', label: '20 minutes (3 slots/hour)' },
                { value: '30', label: '30 minutes (2 slots/hour)' },
                { value: '60', label: '60 minutes (1 slot/hour)' },
              ]}
            />
            <div style={{ display: 'flex', gap: 12 }}>
              <Input label="Clinic Start Time" type="time" value={form.clinicStart} onChange={setF('clinicStart')} />
              <Input label="Clinic End Time"   type="time" value={form.clinicEnd}   onChange={setF('clinicEnd')} />
            </div>

            <Select label="Late Check-in Queue Penalty"
              value={form.lateCheckinPenalty}
              onChange={setF('lateCheckinPenalty')}
              options={[
                { value: '0', label: 'No penalty — check in at any time, go next in line' },
                { value: '1', label: 'Wait 1 patient before being called in' },
                { value: '2', label: 'Wait 2 patients before being called in' },
                { value: '3', label: 'Wait 3 patients before being called in' },
                { value: '5', label: 'Wait 5 patients before being called in' },
              ]}
            />
            <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '12px 16px', fontSize: 12, color: 'var(--slate)', lineHeight: 1.8 }}>
              If a patient misses their slot and checks in late, this controls how many patients must go before them.
              For example, set to 3: if patient #4 was skipped and #5,#6,#7 have gone in, patient #4 checks in and goes after #10 (current+3).
              Set to 0 to let late patients go next in line immediately.
            </div>
          </Section>
        )}

        {(centreType === 'diagnostic' || centreType === 'both') && (
          <Section title="Billing & GST">
            <Select label="Default GST Rate" value={form.gst} onChange={setF('gst')} options={gstOpts} />
            <Input label="GST Number" value={form.gstNumber} onChange={setF('gstNumber')} placeholder="22AAAAA0000A1Z5 (optional)" />
          </Section>
        )}

        <Section title="WhatsApp Campaigns">
          <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '12px 16px', fontSize: 12, color: 'var(--slate)', lineHeight: 1.8 }}>
            Add one entry per approved AiSynergy campaign. Paste the full cURL from AiSynergy → Campaigns → your campaign → API.
            MediFlow reads the API key and campaign settings directly from the cURL — no manual configuration needed.
          </div>

          <div style={{ background: '#F0F9FF', borderRadius: 10, padding: '12px 16px', fontSize: 12, color: '#0369A1', lineHeight: 1.9 }}>
            <strong>Purpose codes:</strong><br />
            <code>bill_generated</code> — sent when a patient bill is created<br />
            <code>report_ready</code> — sent when report is marked ready<br />
            <code>appt_confirm</code> — sent when appointment is booked (clinic)<br />
            <code>followup</code> — sent for follow-up reminders (clinic)
          </div>

          {(form.whatsappCampaigns || []).length === 0 && (
            <div style={{ textAlign: 'center', padding: '20px', color: 'var(--muted)', fontSize: 13 }}>
              No campaigns added yet. Click + Add Campaign below.
            </div>
          )}

          {(form.whatsappCampaigns || []).map((c, i) => {
            const parsed  = parseCurl(c.curl)
            const enabled = c.enabled !== false // default true
            return (
              <div key={i} style={{
                border: `1.5px solid ${enabled ? 'var(--border)' : 'var(--border)'}`,
                borderRadius: 12, padding: '14px 16px',
                display: 'flex', flexDirection: 'column', gap: 10,
                background: enabled ? 'var(--surface)' : 'var(--bg)',
                opacity: enabled ? 1 : 0.7
              }}>
                {/* Header row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize: 11, fontWeight: 600,
                      color: enabled ? 'var(--teal)' : 'var(--muted)',
                      background: enabled ? 'var(--teal-light)' : 'var(--border)',
                      padding: '3px 10px', borderRadius: 20
                    }}>{c.purpose}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>{c.name}</span>
                    {parsed && (
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                        · {parsed.paramCount} param{parsed.paramCount !== 1 ? 's' : ''}
                        {parsed.hasMedia ? ' · document' : ''}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {/* Active / Paused toggle */}
                    <button type="button" onClick={() => {
                      const updated = (form.whatsappCampaigns || []).map((x, j) =>
                        j === i ? { ...x, enabled: !enabled } : x
                      )
                      setForm(f => ({ ...f, whatsappCampaigns: updated }))
                    }} style={{
                      padding: '4px 12px', borderRadius: 20, border: '1.5px solid',
                      borderColor: enabled ? 'var(--teal)' : 'var(--border)',
                      background: enabled ? 'var(--teal-light)' : 'none',
                      color: enabled ? 'var(--teal)' : 'var(--muted)',
                      fontSize: 11, fontWeight: 600, cursor: 'pointer',
                      fontFamily: 'DM Sans, sans-serif'
                    }}>
                      {enabled ? '● Active' : '○ Paused'}
                    </button>
                    <button type="button" onClick={() => {
                      const updated = (form.whatsappCampaigns || []).filter((_, j) => j !== i)
                      setForm(f => ({ ...f, whatsappCampaigns: updated }))
                    }} style={{
                      background: 'var(--red-bg)', border: 'none', borderRadius: 8,
                      color: 'var(--red)', fontSize: 11, fontWeight: 600, padding: '4px 10px',
                      cursor: 'pointer', fontFamily: 'DM Sans, sans-serif'
                    }}>✕ Delete</button>
                  </div>
                </div>

                {/* Campaign name chip */}
                {parsed && (
                  <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace',
                    background: 'var(--bg)', padding: '5px 9px', borderRadius: 7,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                  }}>
                    campaign: {parsed.campaignName}
                  </div>
                )}

                {/* Inline test row */}
                <CampaignInlineTest
                  campaign={c}
                  centreName={form.centreName}
                  campaigns={form.whatsappCampaigns || []}
                />
              </div>
            )
          })}

          <CampaignAdder onAdd={newC => setForm(f => ({
            ...f,
            whatsappCampaigns: [...(f.whatsappCampaigns || []), { ...newC, enabled: true }]
          }))} />
        </Section>

        <Btn type="submit" disabled={saving} style={{ width: '100%', justifyContent: 'center' }}>
          {saving ? 'Saving…' : '💾 Save Settings'}
        </Btn>
      </form>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </Layout>
  )
}
