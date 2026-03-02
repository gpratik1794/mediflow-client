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
  { value: 'appt_reminder',  label: 'appt_reminder — Appointment reminder (clinic)' },
  { value: 'followup',       label: 'followup — Follow-up reminder (clinic)' },
  { value: 'custom',         label: 'custom — Other / custom use' },
]

// All MediFlow data fields available as template parameters
const MEDIFLOW_PARAMS = [
  { value: 'patientName',  label: 'Patient Name' },
  { value: 'doctorName',   label: 'Doctor Name' },
  { value: 'centreName',   label: 'Centre / Clinic Name' },
  { value: 'date',         label: 'Appointment Date' },
  { value: 'timeSlot',     label: 'Appointment Time Slot' },
  { value: 'totalAmount',  label: 'Bill Total Amount (₹)' },
  { value: 'followUpDate', label: 'Follow-up Date' },
  { value: 'tokenNumber',  label: 'Token Number' },
  { value: 'testNames',    label: 'Test Names (comma separated)' },
  { value: 'phone',        label: 'Patient Phone Number' },
  { value: 'custom_text',  label: '— Custom fixed text —' },
]

const PARAM_LABEL = MEDIFLOW_PARAMS.reduce((acc, p) => { acc[p.value] = p.label; return acc }, {})

const TYPE_LABELS = {
  diagnostic: 'Diagnostic Centre',
  clinic: 'Clinic',
  both: 'Clinic + Diagnostic',
}

// ── Delete Confirmation Modal ────────────────────────────────────────────────
function DeleteModal({ campaign, onConfirm, onCancel }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
      zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, padding: '28px 28px 24px',
        maxWidth: 420, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.18)'
      }}>
        <div style={{ fontSize: 32, textAlign: 'center', marginBottom: 12 }}>⚠️</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#1a1a2e', textAlign: 'center', marginBottom: 12 }}>
          Delete Campaign?
        </div>
        <div style={{
          background: '#FEF2F2', borderRadius: 10, padding: '14px 16px',
          fontSize: 13, color: '#B91C1C', lineHeight: 1.9, marginBottom: 14, textAlign: 'center'
        }}>
          <strong>"{campaign.name}"</strong> will be permanently removed.<br />
          WhatsApp messages for <strong>{campaign.purpose}</strong> will{' '}
          <strong>stop sending</strong> until you add a replacement.
        </div>
        <div style={{ fontSize: 12, color: '#6B7280', textAlign: 'center', marginBottom: 22, lineHeight: 1.7 }}>
          Your AiSynergy campaign itself will not be affected —<br />
          only MediFlow will stop using it.
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" onClick={onCancel} style={{
            flex: 1, padding: '11px', borderRadius: 10,
            border: '1.5px solid var(--border)', background: '#fff',
            color: 'var(--slate)', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'DM Sans, sans-serif'
          }}>Cancel</button>
          <button type="button" onClick={onConfirm} style={{
            flex: 1, padding: '11px', borderRadius: 10, border: 'none',
            background: '#DC2626', color: '#fff', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'DM Sans, sans-serif'
          }}>Yes, Delete</button>
        </div>
      </div>
    </div>
  )
}

// ── Parameter Mapper ─────────────────────────────────────────────────────────
function ParamMapper({ paramCount, paramMappings, onChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <label style={{ fontSize: 11, color: 'var(--slate)', fontWeight: 600, display: 'block' }}>
        Map Template Parameters → MediFlow Data
      </label>
      <div style={{
        background: '#F0F9FF', borderRadius: 8, padding: '8px 12px',
        fontSize: 11, color: '#0369A1', lineHeight: 1.8, marginBottom: 2
      }}>
        Your template has <strong>{paramCount}</strong> parameter{paramCount !== 1 ? 's' : ''}{' '}
        ({"{{1}}"}, {"{{2}}"} etc). Map each one to the MediFlow data you want inserted.
      </div>
      {Array.from({ length: paramCount }).map((_, idx) => {
        const mapping = paramMappings[idx] || { mediflowKey: '', customText: '' }
        return (
          <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <div style={{
              minWidth: 40, height: 38, borderRadius: 8, background: 'var(--teal-light)',
              color: 'var(--teal)', fontSize: 11, fontWeight: 700, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1
            }}>
              {`{{${idx + 1}}}`}
            </div>
            <div style={{ flex: 1 }}>
              <select
                value={mapping.mediflowKey || ''}
                onChange={e => {
                  const updated = [...paramMappings]
                  updated[idx] = { ...mapping, mediflowKey: e.target.value, customText: '' }
                  onChange(updated)
                }}
                style={{
                  width: '100%', padding: '9px 12px', borderRadius: 9,
                  border: '1.5px solid var(--border)', fontSize: 12,
                  fontFamily: 'DM Sans, sans-serif', background: '#fff',
                  color: mapping.mediflowKey ? 'var(--navy)' : 'var(--muted)'
                }}
              >
                <option value="">— Select what to insert here —</option>
                {MEDIFLOW_PARAMS.map(p => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
              {mapping.mediflowKey === 'custom_text' && (
                <input
                  value={mapping.customText || ''}
                  onChange={e => {
                    const updated = [...paramMappings]
                    updated[idx] = { ...mapping, customText: e.target.value }
                    onChange(updated)
                  }}
                  placeholder="Type the fixed text to always insert here"
                  style={{
                    width: '100%', marginTop: 6, padding: '8px 12px', borderRadius: 9,
                    border: '1.5px solid var(--border)', fontSize: 12,
                    fontFamily: 'DM Sans, sans-serif', background: '#fff', boxSizing: 'border-box'
                  }}
                />
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Add New Campaign sub-form ─────────────────────────────────────────────────
function CampaignAdder({ onAdd }) {
  const [open, setOpen]               = useState(false)
  const [name, setName]               = useState('')
  const [purpose, setPurpose]         = useState('bill_generated')
  const [curl, setCurl]               = useState('')
  const [preview, setPreview]         = useState(null)
  const [paramCount, setParamCount]   = useState('')
  const [paramMappings, setParamMappings] = useState([])
  const [err, setErr]                 = useState('')

  function handleCurlChange(v) {
    setCurl(v)
    setErr('')
    if (v.length > 20) {
      const parsed = parseCurl(v)
      setPreview(parsed)
      if (parsed && parsed.paramCount && paramCount === '') {
        const n = parsed.paramCount
        setParamCount(String(n))
        setParamMappings(Array.from({ length: n }, () => ({ mediflowKey: '', customText: '' })))
      }
    } else {
      setPreview(null)
    }
  }

  function handleParamCountChange(v) {
    const n = parseInt(v, 10)
    setParamCount(v)
    if (!isNaN(n) && n >= 0 && n <= 10) {
      setParamMappings(prev =>
        Array.from({ length: n }, (_, i) => prev[i] || { mediflowKey: '', customText: '' })
      )
    }
  }

  function handleAdd() {
    if (!name.trim()) { setErr('Enter a campaign label'); return }
    if (!curl.trim()) { setErr('Paste the cURL from AiSynergy'); return }
    const parsed = parseCurl(curl)
    if (!parsed)      { setErr('Could not parse cURL — paste the full curl command including -d and the URL'); return }
    if (!parsed.apiKey){ setErr('No apiKey found in cURL body — make sure you copied the full cURL'); return }

    const pc = parseInt(paramCount, 10)
    if (isNaN(pc) || pc < 0) { setErr('Select how many parameters your template has (use 0 if none)'); return }

    for (let i = 0; i < pc; i++) {
      const m = paramMappings[i]
      if (!m || !m.mediflowKey) { setErr(`Map parameter {{${i + 1}}} to a MediFlow field`); return }
      if (m.mediflowKey === 'custom_text' && !m.customText?.trim()) {
        setErr(`Enter the custom text for parameter {{${i + 1}}}`); return
      }
    }

    onAdd({ name: name.trim(), purpose, curl: curl.trim(), paramCount: pc, paramMappings: paramMappings.slice(0, pc) })
    setName(''); setCurl(''); setPreview(null); setErr(''); setParamCount(''); setParamMappings([])
    setOpen(false)
  }

  function handleCancel() {
    setOpen(false); setName(''); setCurl(''); setPreview(null)
    setErr(''); setParamCount(''); setParamMappings([])
  }

  if (!open) return (
    <button type="button" onClick={() => setOpen(true)} style={{
      padding: '10px 18px', borderRadius: 10, border: '1.5px dashed var(--teal)',
      background: 'none', color: 'var(--teal)', fontSize: 13, fontWeight: 600,
      cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', width: '100%'
    }}>+ Add Campaign</button>
  )

  const pc = parseInt(paramCount, 10)

  return (
    <div style={{
      border: '1.5px solid var(--teal)', borderRadius: 12, padding: '20px',
      display: 'flex', flexDirection: 'column', gap: 16, background: 'var(--teal-light)'
    }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--teal)' }}>Add New Campaign</div>

      {/* Label + Purpose */}
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 11, color: 'var(--slate)', fontWeight: 500, display: 'block', marginBottom: 5 }}>
            Campaign Label <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(your name for it)</span>
          </label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Bill Notification"
            style={{
              width: '100%', padding: '9px 13px', borderRadius: 9,
              border: '1.5px solid var(--border)', fontSize: 13,
              fontFamily: 'DM Sans, sans-serif', boxSizing: 'border-box', background: '#fff'
            }} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 11, color: 'var(--slate)', fontWeight: 500, display: 'block', marginBottom: 5 }}>
            Purpose <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(when MediFlow sends this)</span>
          </label>
          <select value={purpose} onChange={e => setPurpose(e.target.value)} style={{
            width: '100%', padding: '10px 13px', borderRadius: 9,
            border: '1.5px solid var(--border)', fontSize: 13,
            fontFamily: 'DM Sans, sans-serif', background: '#fff', color: 'var(--navy)', boxSizing: 'border-box'
          }}>
            {PURPOSE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {/* cURL paste */}
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

      {preview && (
        <div style={{ background: '#E6F7F5', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#0B9E8A', lineHeight: 1.8 }}>
          ✅ cURL parsed — Campaign: <strong>{preview.campaignName}</strong>
          {preview.hasMedia ? ' · includes media/document' : ''}
          {preview.paramCount > 0 ? ` · ${preview.paramCount} template params detected` : ''}
        </div>
      )}

      {/* How many parameters */}
      <div>
        <label style={{ fontSize: 11, color: 'var(--slate)', fontWeight: 500, display: 'block', marginBottom: 8 }}>
          How many parameters does your template have?
          <span style={{ color: 'var(--muted)', fontWeight: 400, marginLeft: 6 }}>
            (count the {"{{1}}"}, {"{{2}}"} placeholders in your AiSynergy template)
          </span>
        </label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {[0, 1, 2, 3, 4, 5, 6].map(n => (
            <button key={n} type="button" onClick={() => handleParamCountChange(String(n))} style={{
              padding: '8px 16px', borderRadius: 8,
              border: paramCount === String(n) ? '2px solid var(--teal)' : '1.5px solid var(--border)',
              background: paramCount === String(n) ? 'var(--teal)' : '#fff',
              color: paramCount === String(n) ? '#fff' : 'var(--navy)',
              fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif'
            }}>{n}</button>
          ))}
          <input type="number" min="0" max="10" value={paramCount}
            onChange={e => handleParamCountChange(e.target.value)} placeholder="other"
            style={{
              width: 70, padding: '8px 10px', borderRadius: 8,
              border: '1.5px solid var(--border)', fontSize: 13,
              fontFamily: 'DM Sans, sans-serif', textAlign: 'center'
            }} />
        </div>
      </div>

      {/* Parameter mapping */}
      {paramCount !== '' && !isNaN(pc) && pc > 0 && (
        <div style={{ background: '#fff', borderRadius: 10, padding: '16px', border: '1.5px solid var(--border)' }}>
          <ParamMapper paramCount={pc} paramMappings={paramMappings} onChange={setParamMappings} />
        </div>
      )}
      {paramCount === '0' && (
        <div style={{ background: '#F0FDF4', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#166534' }}>
          ✅ No parameters — this template sends the same message to everyone with no dynamic fields.
        </div>
      )}

      {err && (
        <div style={{ background: '#FEF2F2', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#C0392B', lineHeight: 1.6 }}>
          ⚠️ {err}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={handleAdd} style={{
          padding: '10px 24px', borderRadius: 9, border: 'none',
          background: 'var(--teal)', color: '#fff', fontSize: 13, fontWeight: 600,
          cursor: 'pointer', fontFamily: 'DM Sans, sans-serif'
        }}>Save Campaign</button>
        <button type="button" onClick={handleCancel} style={{
          padding: '10px 18px', borderRadius: 9, border: '1.5px solid var(--border)',
          background: '#fff', color: 'var(--slate)', fontSize: 13,
          cursor: 'pointer', fontFamily: 'DM Sans, sans-serif'
        }}>Cancel</button>
      </div>
    </div>
  )
}

// ── Test a saved campaign ────────────────────────────────────────────────────
function CampaignTester({ campaigns, purpose, phone, centreName }) {
  const [status, setStatus] = useState(null)
  const [detail, setDetail] = useState('')

  async function runTest() {
    if (!purpose) { setStatus('fail'); setDetail('Select a campaign to test.'); return }
    if (!phone || phone.replace(/\D/g, '').length < 10) {
      setStatus('fail'); setDetail('Enter a valid 10-digit phone number.'); return
    }
    setStatus('sending'); setDetail('')
    const result = await sendCampaign(campaigns, purpose, phone, ['Test Patient', centreName || 'Test Centre', '500'])
    if (result.ok) {
      setStatus('ok')
      setDetail(`Success! Message sent to ${phone}. Check WhatsApp.`)
    } else {
      setStatus('fail')
      setDetail(result.error)
    }
  }

  return (
    <div>
      <button type="button" onClick={runTest} disabled={status === 'sending'} style={{
        padding: '10px 20px', borderRadius: 10, border: 'none', cursor: 'pointer',
        background: status === 'sending' ? 'var(--border)' : 'var(--teal)',
        color: '#fff', fontSize: 13, fontWeight: 600, fontFamily: 'DM Sans, sans-serif'
      }}>
        {status === 'sending' ? 'Sending…' : '▶ Send Test Message'}
      </button>
      {status && status !== 'sending' && (
        <div style={{
          marginTop: 10, padding: '10px 14px', borderRadius: 10, fontSize: 12, lineHeight: 1.7,
          background: status === 'ok' ? '#E6F7F5' : '#FEF2F2',
          color: status === 'ok' ? '#0B9E8A' : '#C0392B',
          border: `1px solid ${status === 'ok' ? '#0B9E8A' : '#F5C6C6'}`
        }}>
          {status === 'ok' ? '✅ ' : '⚠️ '}{detail}
        </div>
      )}
    </div>
  )
}

// ── Main Settings component ───────────────────────────────────────────────────

export default function Settings() {
  const { user, profile } = useAuth()
  const [toast, setToast]               = useState(null)
  const [saving, setSaving]             = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const [form, setForm] = useState({
    centreName: '', ownerName: '', phone: '', city: '', address: '',
    centreType: 'diagnostic', gst: '0', gstNumber: '',
    slotDuration: '30', clinicStart: '09:00', clinicEnd: '20:00',
    whatsappCampaigns: [], lateCheckinPenalty: '0',
    _testPurpose: '', _testPhone: '',
  })

  useEffect(() => {
    if (profile) {
      setForm(f => ({
        ...f,
        centreName:         profile.centreName         || '',
        ownerName:          profile.ownerName          || '',
        phone:              profile.phone              || '',
        city:               profile.city               || '',
        address:            profile.address            || '',
        centreType:         profile.centreType         || 'diagnostic',
        gst:                profile.gst                || '0',
        gstNumber:          profile.gstNumber          || '',
        slotDuration:       profile.slotDuration       || '30',
        clinicStart:        profile.clinicStart        || '09:00',
        clinicEnd:          profile.clinicEnd          || '20:00',
        whatsappCampaigns:  profile.whatsappCampaigns  || [],
        lateCheckinPenalty: profile.lateCheckinPenalty || '0',
      }))
    }
  }, [profile])

  const setF = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  function handleDeleteRequest(campaign, index) { setDeleteTarget({ campaign, index }) }

  function handleDeleteConfirm() {
    if (!deleteTarget) return
    const updated = (form.whatsappCampaigns || []).filter((_, j) => j !== deleteTarget.index)
    setForm(f => ({ ...f, whatsappCampaigns: updated }))
    setDeleteTarget(null)
    setToast({ message: `Campaign "${deleteTarget.campaign.name}" deleted. Save settings to apply.`, type: 'success' })
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    try {
      const { _testPurpose, _testPhone, ...saveData } = form
      await setDoc(doc(db, 'centres', user.uid, 'profile', 'main'), { ...saveData, updatedAt: serverTimestamp() }, { merge: true })
      setToast({ message: 'Settings saved successfully', type: 'success' })
    } catch (err) {
      console.error(err)
      setToast({ message: 'Failed to save settings', type: 'error' })
    }
    setSaving(false)
  }

  const centreType = form.centreType || 'diagnostic'

  const gstOpts = [
    { value: '0', label: '0% GST' }, { value: '5', label: '5%' },
    { value: '12', label: '12%' },   { value: '18', label: '18%' },
  ]

  return (
    <Layout title="Settings">

      {deleteTarget && (
        <DeleteModal
          campaign={deleteTarget.campaign}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      <form onSubmit={handleSave} style={{ maxWidth: 680 }}>

        {/* ── Centre Information ── */}
        <Section title="Centre Information">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, color: 'var(--slate)', fontWeight: 500 }}>Centre Type</label>
            <div style={{
              padding: '10px 14px', borderRadius: 10, border: '1.5px solid var(--border)',
              background: 'var(--bg)', fontSize: 13, color: 'var(--muted)',
              display: 'flex', alignItems: 'center', gap: 8
            }}>
              {TYPE_LABELS[centreType] || 'Diagnostic Centre'}
              <span style={{ fontSize: 11, marginLeft: 4 }}>(set by admin)</span>
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

        {/* ── Clinic Settings ── */}
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
            <Select label="Late Check-in Queue Penalty" value={form.lateCheckinPenalty} onChange={setF('lateCheckinPenalty')}
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
              Set to 0 to let late patients go next in line immediately.
            </div>
          </Section>
        )}

        {/* ── Billing & GST ── */}
        {(centreType === 'diagnostic' || centreType === 'both') && (
          <Section title="Billing & GST">
            <Select label="Default GST Rate" value={form.gst} onChange={setF('gst')} options={gstOpts} />
            <Input label="GST Number" value={form.gstNumber} onChange={setF('gstNumber')} placeholder="22AAAAA0000A1Z5 (optional)" />
          </Section>
        )}

        {/* ── WhatsApp Campaigns ── */}
        <Section title="WhatsApp Campaigns">
          <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '12px 16px', fontSize: 12, color: 'var(--slate)', lineHeight: 1.8 }}>
            Add one entry per approved AiSynergy campaign. Paste the full cURL and map each template parameter
            to a MediFlow data field — MediFlow will fill in patient details automatically when sending.
          </div>

          <div style={{ background: '#F0F9FF', borderRadius: 10, padding: '12px 16px', fontSize: 12, color: '#0369A1', lineHeight: 1.9 }}>
            <strong>Purpose codes:</strong><br />
            <code>bill_generated</code> — sent when a patient bill is created<br />
            <code>report_ready</code> — sent when report is marked ready<br />
            <code>appt_confirm</code> — sent when appointment is booked (clinic)<br />
            <code>appt_reminder</code> — sent as appointment reminder (clinic)<br />
            <code>followup</code> — sent for follow-up reminders (clinic)
          </div>

          {(form.whatsappCampaigns || []).length === 0 && (
            <div style={{
              textAlign: 'center', padding: '28px', color: 'var(--muted)', fontSize: 13,
              border: '1.5px dashed var(--border)', borderRadius: 12, lineHeight: 1.8
            }}>
              No campaigns added yet.<br />
              <span style={{ fontSize: 12 }}>Click + Add Campaign below to connect your first AiSynergy campaign.</span>
            </div>
          )}

          {(form.whatsappCampaigns || []).map((c, i) => {
            const parsed = parseCurl(c.curl)
            return (
              <div key={i} style={{
                border: '1.5px solid var(--border)', borderRadius: 12, padding: '16px',
                display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--surface)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize: 11, fontWeight: 600, color: 'var(--teal)',
                      background: 'var(--teal-light)', padding: '3px 10px', borderRadius: 20
                    }}>{c.purpose}</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--navy)' }}>{c.name}</span>
                  </div>
                  <button type="button" onClick={() => handleDeleteRequest(c, i)} style={{
                    background: 'var(--red-bg)', border: 'none', borderRadius: 8,
                    color: 'var(--red)', fontSize: 11, fontWeight: 600,
                    padding: '5px 12px', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', flexShrink: 0
                  }}>✕ Delete</button>
                </div>

                {parsed && (
                  <div style={{
                    fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace',
                    background: 'var(--bg)', padding: '6px 10px', borderRadius: 7,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                  }}>
                    campaign: {parsed.campaignName} · {c.paramCount ?? parsed.paramCount} param{(c.paramCount ?? parsed.paramCount) !== 1 ? 's' : ''}
                    {parsed.hasMedia ? ' · document' : ''}
                  </div>
                )}

                {c.paramMappings && c.paramMappings.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {c.paramMappings.map((m, j) => (
                      <span key={j} style={{
                        fontSize: 11, background: '#F0F9FF', color: '#0369A1',
                        padding: '3px 10px', borderRadius: 20, border: '1px solid #BAE6FD'
                      }}>
                        {`{{${j + 1}}}`} → {m.mediflowKey === 'custom_text'
                          ? `"${m.customText}"`
                          : (PARAM_LABEL[m.mediflowKey] || m.mediflowKey)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )
          })}

          <CampaignAdder onAdd={newC => setForm(f => ({
            ...f,
            whatsappCampaigns: [...(f.whatsappCampaigns || []), newC]
          }))} />
        </Section>

        {/* ── Test WhatsApp ── */}
        <Section title="Test WhatsApp">
          <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '12px 16px', fontSize: 12, color: 'var(--slate)', lineHeight: 1.8 }}>
            Test any saved campaign before going live. <strong>Save settings first</strong> if you just added a campaign.
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: 'var(--slate)', fontWeight: 500, display: 'block', marginBottom: 5 }}>Select Campaign</label>
              <select value={form._testPurpose || ''} onChange={setF('_testPurpose')} style={{
                width: '100%', padding: '10px 14px', borderRadius: 10,
                border: '1.5px solid var(--border)', fontSize: 13,
                fontFamily: 'DM Sans, sans-serif', background: 'var(--surface)', color: 'var(--navy)'
              }}>
                <option value="">Select…</option>
                {(form.whatsappCampaigns || []).map(c => (
                  <option key={c.purpose} value={c.purpose}>{c.purpose} — {c.name}</option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <Input label="Send Test To (phone)" value={form._testPhone || ''} onChange={setF('_testPhone')} placeholder="10-digit number" />
            </div>
          </div>
          <CampaignTester
            campaigns={form.whatsappCampaigns || []}
            purpose={form._testPurpose}
            phone={form._testPhone}
            centreName={form.centreName}
          />
        </Section>

        <Btn type="submit" disabled={saving} style={{ width: '100%', justifyContent: 'center' }}>
          {saving ? 'Saving…' : '💾 Save Settings'}
        </Btn>
      </form>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </Layout>
  )
}