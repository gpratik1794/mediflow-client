// src/pages/SettingsCampaigns.jsx
import React, { useState, useEffect } from 'react'
import { useAuth } from '../utils/AuthContext'
import { getCampaigns, saveCampaign, deleteCampaign } from '../firebase/campaigns'

// What trigger/event each campaign handles inside MediFlow
const PURPOSES = [
  { value: 'appt_confirm',   label: 'Appointment Confirmed',  hint: 'Sent when a new appointment is booked' },
  { value: 'report_ready',   label: 'Report Ready',           hint: 'Sent when a diagnostic report is uploaded & ready' },
  { value: 'followup',       label: 'Follow-up Reminder',     hint: 'Sent as a follow-up reminder to the patient' },
  { value: 'bill_generated', label: 'Bill Generated',         hint: 'Sent when a new diagnostic visit / bill is created' },
]

// MediFlow data fields that can be mapped to template parameters
const MEDIFLOW_FIELDS = [
  { value: 'patientName',     label: 'Patient Name' },
  { value: 'doctorName',      label: 'Doctor / Owner Name' },
  { value: 'centreName',      label: 'Centre / Clinic Name' },
  { value: 'phone',           label: 'Patient Phone Number' },
  { value: 'date',            label: 'Appointment / Visit Date' },
  { value: 'appointmentTime', label: 'Appointment Time' },
  { value: 'visitType',       label: 'Visit Type (New / Follow-up)' },
  { value: 'tokenNumber',     label: 'Queue Token Number' },
  { value: 'totalAmount',     label: 'Bill Total Amount (₹)' },
  { value: 'followUpDate',    label: 'Follow-up Date' },
]

function parseCurl(curl) {
  try {
    const match = curl.match(/-d\s+'([\s\S]*?)'\s+https?:\/\//s) ||
                  curl.match(/-d\s+"([\s\S]*?)"\s+https?:\/\//s)
    if (!match) return null
    const body = JSON.parse(match[1])
    return {
      campaignName:  body.campaignName || '',
      paramCount:    Array.isArray(body.templateParams) ? body.templateParams.length : 1,
      mediaUrl:      body.media?.url      || '',
      mediaFilename: body.media?.filename || '',
    }
  } catch { return null }
}

const emptyForm = {
  curl: '', campaignName: '', purpose: '',
  paramCount: 1, paramMapping: [''],
  description: '', mediaUrl: '', mediaFilename: '', _parsed: false
}

export default function CampaignManager({ apiKey }) {
  const { user } = useAuth()
  const [campaigns, setCampaigns] = useState([])
  const [loading, setLoading]     = useState(true)
  const [adding, setAdding]       = useState(false)
  const [saving, setSaving]       = useState(false)
  const [toast, setToast]         = useState(null)
  const [form, setForm]           = useState(emptyForm)

  useEffect(() => { loadCampaigns() }, [user])

  async function loadCampaigns() {
    setLoading(true)
    try { setCampaigns(await getCampaigns(user.uid)) } catch {}
    setLoading(false)
  }

  function handleCurlPaste(e) {
    const curl = e.target.value
    const parsed = parseCurl(curl)
    if (parsed?.campaignName) {
      const count = parsed.paramCount
      setForm(f => ({
        ...f, curl,
        campaignName:  parsed.campaignName,
        paramCount:    count,
        paramMapping:  Array(count).fill('').map((_, i) => f.paramMapping[i] || ''),
        mediaUrl:      parsed.mediaUrl,
        mediaFilename: parsed.mediaFilename,
        _parsed: true
      }))
    } else {
      setForm(f => ({ ...f, curl, _parsed: false }))
    }
  }

  function handleParamCountChange(val) {
    const count = Math.max(1, Math.min(10, parseInt(val) || 1))
    setForm(f => ({
      ...f,
      paramCount:   count,
      paramMapping: Array(count).fill('').map((_, i) => f.paramMapping[i] || '')
    }))
  }

  function setParamMapping(idx, val) {
    setForm(f => {
      const m = [...f.paramMapping]
      m[idx] = val
      return { ...f, paramMapping: m }
    })
  }

  async function handleSave() {
    if (!form.campaignName || !form.purpose) return
    setSaving(true)
    try {
      await saveCampaign(user.uid, {
        name:          form.campaignName,
        purpose:       form.purpose,
        curl:          form.curl,
        paramCount:    Number(form.paramCount),
        paramMapping:  form.paramMapping,
        description:   form.description,
        mediaUrl:      form.mediaUrl,
        mediaFilename: form.mediaFilename,
      })
      setToast({ ok: true, msg: `Campaign "${form.campaignName}" saved.` })
      setAdding(false)
      setForm(emptyForm)
      loadCampaigns()
    } catch {
      setToast({ ok: false, msg: 'Failed to save campaign.' })
    }
    setSaving(false)
    setTimeout(() => setToast(null), 3500)
  }

  async function handleDelete(c) {
    // Confirmation popup — clearly explains consequence
    const confirmed = window.confirm(
      `Delete "${c.name}"?\n\n⚠️ WhatsApp messages for "${c.purpose ? PURPOSES.find(p=>p.value===c.purpose)?.label : c.name}" will STOP sending immediately.\n\nThis cannot be undone.`
    )
    if (!confirmed) return
    try {
      await deleteCampaign(user.uid, c.name)
      setToast({ ok: true, msg: `"${c.name}" deleted.` })
      loadCampaigns()
    } catch {
      setToast({ ok: false, msg: 'Failed to delete.' })
    }
    setTimeout(() => setToast(null), 3500)
  }

  const purposeLabel = v => PURPOSES.find(p => p.value === v)?.label || v
  const fieldLabel   = v => MEDIFLOW_FIELDS.find(f => f.value === v)?.label || v

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Toast */}
      {toast && (
        <div style={{
          padding: '10px 16px', borderRadius: 10, fontSize: 13,
          background: toast.ok ? '#E6F7F5' : '#FEF2F2',
          color: toast.ok ? '#0B9E8A' : '#C0392B',
          border: `1px solid ${toast.ok ? '#0B9E8A' : '#F5C6C6'}`
        }}>
          {toast.ok ? '✅ ' : '⚠️ '}{toast.msg}
        </div>
      )}

      {/* Saved campaigns list */}
      {loading ? (
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>Loading campaigns…</div>
      ) : campaigns.length === 0 ? (
        <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '14px 16px', fontSize: 13, color: 'var(--slate)' }}>
          No campaigns added yet. Add your AiSynergy campaigns below so MediFlow can send WhatsApp messages automatically.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {campaigns.map(c => (
            <div key={c.name} style={{
              display: 'flex', alignItems: 'flex-start', gap: 12,
              padding: '12px 16px', borderRadius: 10,
              border: '1.5px solid var(--border)', background: 'var(--surface)'
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10, background: '#E6F7F5',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, flexShrink: 0, marginTop: 2
              }}>💬</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)', fontFamily: 'monospace' }}>{c.name}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                  {c.purpose && (
                    <span style={{ background: 'var(--teal-light)', color: 'var(--teal)', borderRadius: 4, padding: '1px 8px', fontSize: 11, fontWeight: 600 }}>
                      {purposeLabel(c.purpose)}
                    </span>
                  )}
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                    {c.paramCount} param{c.paramCount !== 1 ? 's' : ''}
                  </span>
                </div>
                {c.paramMapping?.length > 0 && (
                  <div style={{ fontSize: 11, color: 'var(--slate)', marginTop: 4 }}>
                    {c.paramMapping.map((p, i) => (
                      <span key={i}>
                        {i > 0 && ' → '}
                        <span style={{ background: 'var(--bg)', borderRadius: 4, padding: '1px 6px' }}>
                          {'{{'}{i+1}{'}}'}={fieldLabel(p) || '?'}
                        </span>
                      </span>
                    ))}
                  </div>
                )}
                {c.description && (
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{c.description}</div>
                )}
              </div>
              <button
                onClick={() => handleDelete(c)}
                style={{
                  padding: '5px 12px', borderRadius: 8,
                  border: '1.5px solid #E74C3C',
                  background: 'none', cursor: 'pointer', fontSize: 12,
                  color: '#E74C3C', fontFamily: 'DM Sans, sans-serif',
                  flexShrink: 0
                }}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add form */}
      {adding ? (
        <div style={{
          border: '1.5px solid var(--teal)', borderRadius: 12, padding: '20px',
          background: 'var(--teal-light)', display: 'flex', flexDirection: 'column', gap: 18
        }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--teal)' }}>Add WhatsApp Campaign</div>

          {/* Step 1 — cURL */}
          <div>
            <label style={lStyle}>
              Step 1 — Paste your cURL from AiSynergy
              <span style={{ color: 'var(--muted)', fontWeight: 400 }}> (fields below will auto-fill)</span>
            </label>
            <textarea
              value={form.curl}
              onChange={handleCurlPaste}
              rows={4}
              placeholder={`curl -X POST -H "Content-Type: application/json" -d '{"apiKey":"...","campaignName":"clinic_appointment_confirmed","templateParams":["$p1","$p2","$p3","$p4"]}' https://backend.api-wa.co/...`}
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 10,
                fontSize: 11, border: '1.5px solid var(--border)',
                fontFamily: 'monospace', background: '#fff',
                resize: 'vertical', boxSizing: 'border-box',
                color: 'var(--slate)', lineHeight: 1.6
              }}
            />
            {form._parsed && (
              <div style={{ fontSize: 11, color: 'var(--teal)', marginTop: 4 }}>✅ Auto-filled from cURL</div>
            )}
          </div>

          {/* Step 2 — Campaign name + Purpose */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={lStyle}>
                Step 2 — Campaign Name *
                <span style={{ color: 'var(--muted)', fontWeight: 400 }}> (must match AiSynergy exactly)</span>
              </label>
              <input
                value={form.campaignName}
                onChange={e => setForm(f => ({ ...f, campaignName: e.target.value }))}
                placeholder="e.g. clinic_appointment_confirmed"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={lStyle}>When to send (Trigger) *</label>
              <select
                value={form.purpose}
                onChange={e => setForm(f => ({ ...f, purpose: e.target.value }))}
                style={inputStyle}
              >
                <option value="">— Select trigger —</option>
                {PURPOSES.map(p => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
              {form.purpose && (
                <div style={{ fontSize: 11, color: 'var(--slate)', marginTop: 4 }}>
                  {PURPOSES.find(p => p.value === form.purpose)?.hint}
                </div>
              )}
            </div>
          </div>

          {/* Step 3 — Param count + mapping */}
          <div>
            <label style={lStyle}>Step 3 — How many parameters does this template have?</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <input
                type="number" min="1" max="10"
                value={form.paramCount}
                onChange={e => handleParamCountChange(e.target.value)}
                style={{ ...inputStyle, width: 80 }}
              />
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                parameter{form.paramCount !== 1 ? 's' : ''} in the WhatsApp template
              </span>
            </div>

            <label style={lStyle}>Map each parameter to a MediFlow data field</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {Array.from({ length: form.paramCount }).map((_, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: 'var(--teal)', color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 700, flexShrink: 0
                  }}>{i + 1}</div>
                  <span style={{ fontSize: 12, color: 'var(--navy)', fontFamily: 'monospace', width: 44, flexShrink: 0 }}>
                    {`{{${i+1}}}`}
                  </span>
                  <select
                    value={form.paramMapping[i] || ''}
                    onChange={e => setParamMapping(i, e.target.value)}
                    style={{ ...inputStyle, flex: 1, background: '#fff' }}
                  >
                    <option value="">— Select MediFlow field —</option>
                    {MEDIFLOW_FIELDS.map(f => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>
              Each numbered circle matches the {'{{1}}'}, {'{{2}}'} position in your AiSynergy template. Select what MediFlow data should fill it.
            </div>
          </div>

          {/* Optional description */}
          <div>
            <label style={lStyle}>Description <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(optional — just for your reference)</span></label>
            <input
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="e.g. Confirmation sent when appointment is booked"
              style={inputStyle}
            />
          </div>

          {form.mediaUrl && (
            <div style={{ fontSize: 12, color: 'var(--teal)', background: '#fff', padding: '8px 12px', borderRadius: 8 }}>
              📎 Media attachment detected from cURL: {form.mediaUrl.slice(0, 70)}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleSave}
              disabled={saving || !form.campaignName || !form.purpose}
              style={{
                padding: '9px 20px', borderRadius: 10, border: 'none',
                background: (form.campaignName && form.purpose) ? 'var(--teal)' : 'var(--border)',
                color: '#fff', fontSize: 13, fontWeight: 600,
                cursor: (form.campaignName && form.purpose) ? 'pointer' : 'not-allowed',
                fontFamily: 'DM Sans, sans-serif'
              }}>
              {saving ? 'Saving…' : 'Save Campaign'}
            </button>
            <button
              onClick={() => { setAdding(false); setForm(emptyForm) }}
              style={{
                padding: '9px 16px', borderRadius: 10,
                border: '1.5px solid var(--border)',
                background: 'none', cursor: 'pointer', fontSize: 13,
                color: 'var(--slate)', fontFamily: 'DM Sans, sans-serif'
              }}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          style={{
            padding: '10px 18px', borderRadius: 10,
            border: '1.5px dashed var(--teal)',
            background: 'none', cursor: 'pointer', fontSize: 13,
            color: 'var(--teal)', fontFamily: 'DM Sans, sans-serif',
            fontWeight: 600, textAlign: 'left'
          }}>
          + Add Campaign
        </button>
      )}
    </div>
  )
}

const lStyle = {
  fontSize: 11, color: 'var(--slate)', fontWeight: 500,
  display: 'block', marginBottom: 5
}
const inputStyle = {
  width: '100%', padding: '9px 12px', borderRadius: 10, fontSize: 13,
  border: '1.5px solid var(--border)', fontFamily: 'DM Sans, sans-serif',
  background: '#fff', boxSizing: 'border-box', color: 'var(--navy)'
}