// src/pages/SettingsCampaigns.jsx
// Campaign Manager section — used inside Settings.jsx
import React, { useState, useEffect } from 'react'
import { useAuth } from '../utils/AuthContext'
import { getCampaigns, saveCampaign, deleteCampaign } from '../firebase/campaigns'

const KNOWN_CAMPAIGNS = [
  { name: 'mediflow_bill_generated',  paramCount: 3, description: 'Bill generated — sent when new visit is registered', purpose: 'bill' },
  { name: 'mediflow_report_ready',    paramCount: 2, description: 'Report ready — sent when report is marked ready',    purpose: 'report' },
  { name: 'mediflow_appt_confirm',    paramCount: 4, description: 'Appointment confirmation — sent when appointment is booked', purpose: 'appt_confirm' },
  { name: 'mediflow_followup_reminder', paramCount: 3, description: 'Follow-up reminder — sent before follow-up date', purpose: 'followup' },
]

function parseCurl(curl) {
  // Extract campaignName, paramCount from cURL body
  try {
    const bodyMatch = curl.match(/-d\s+'({[\s\S]*?})'\s+https/)
      || curl.match(/-d\s+"({[\s\S]*?})"\s+https/)
      || curl.match(/--data\s+'({[\s\S]*?})'\s+https/)
    if (!bodyMatch) return null
    const json = JSON.parse(bodyMatch[1])
    return {
      campaignName: json.campaignName,
      paramCount: Array.isArray(json.templateParams) ? json.templateParams.length : 1,
      mediaUrl: json.media?.url || '',
      mediaFilename: json.media?.filename || '',
    }
  } catch {
    return null
  }
}

export default function CampaignManager({ apiKey }) {
  const { user } = useAuth()
  const [campaigns, setCampaigns]   = useState([])
  const [loading, setLoading]       = useState(true)
  const [adding, setAdding]         = useState(false) // show add form
  const [saving, setSaving]         = useState(false)
  const [deleting, setDeleting]     = useState(null)
  const [toast, setToast]           = useState(null)

  const [form, setForm] = useState({
    name: '', paramCount: 2, description: '', curl: '',
    mediaUrl: '', mediaFilename: '', _parsed: false
  })

  useEffect(() => { loadCampaigns() }, [user])

  async function loadCampaigns() {
    setLoading(true)
    try {
      const list = await getCampaigns(user.uid)
      setCampaigns(list)
    } catch {}
    setLoading(false)
  }

  function handleCurlPaste(e) {
    const curl = e.target.value
    setForm(f => ({ ...f, curl }))
    const parsed = parseCurl(curl)
    if (parsed?.campaignName) {
      setForm(f => ({
        ...f, curl,
        name: parsed.campaignName,
        paramCount: parsed.paramCount,
        mediaUrl: parsed.mediaUrl || '',
        mediaFilename: parsed.mediaFilename || '',
        _parsed: true
      }))
    }
  }

  async function handleSave() {
    if (!form.name) return
    setSaving(true)
    try {
      await saveCampaign(user.uid, {
        name: form.name,
        paramCount: Number(form.paramCount),
        description: form.description,
        mediaUrl: form.mediaUrl,
        mediaFilename: form.mediaFilename,
      })
      setToast({ ok: true, msg: `Campaign "${form.name}" saved.` })
      setAdding(false)
      setForm({ name: '', paramCount: 2, description: '', curl: '', mediaUrl: '', mediaFilename: '', _parsed: false })
      loadCampaigns()
    } catch (e) {
      setToast({ ok: false, msg: 'Failed to save campaign.' })
    }
    setSaving(false)
    setTimeout(() => setToast(null), 3000)
  }

  async function handleDelete(name) {
    setDeleting(name)
    try {
      await deleteCampaign(user.uid, name)
      setToast({ ok: true, msg: `Campaign "${name}" deleted.` })
      loadCampaigns()
    } catch {
      setToast({ ok: false, msg: 'Failed to delete.' })
    }
    setDeleting(null)
    setTimeout(() => setToast(null), 3000)
  }

  const savedNames = campaigns.map(c => c.name)
  const suggestedToAdd = KNOWN_CAMPAIGNS.filter(k => !savedNames.includes(k.name))

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
          {toast.ok ? '✅ ' : '[!] '}{toast.msg}
        </div>
      )}

      {/* Saved campaigns */}
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
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 16px', borderRadius: 10,
              border: '1.5px solid var(--border)', background: 'var(--surface)'
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10, background: '#E6F7F5',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0
              }}>💬</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)', fontFamily: 'monospace' }}>{c.name}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                  {c.paramCount} param{c.paramCount !== 1 ? 's' : ''}
                  {c.description ? ` · ${c.description}` : ''}
                  {c.mediaUrl ? ' · 📎 has media' : ''}
                </div>
              </div>
              <button
                onClick={() => handleDelete(c.name)}
                disabled={deleting === c.name}
                style={{
                  padding: '5px 12px', borderRadius: 8, border: '1.5px solid var(--border)',
                  background: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--slate)',
                  fontFamily: 'DM Sans, sans-serif'
                }}
              >
                {deleting === c.name ? '…' : 'Remove'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Suggested campaigns to add */}
      {suggestedToAdd.length > 0 && !adding && (
        <div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.8 }}>
            Suggested campaigns to add
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {suggestedToAdd.map(k => (
              <div key={k.name} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 14px', borderRadius: 10,
                border: '1.5px dashed var(--border)', background: 'var(--bg)'
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--slate)', fontFamily: 'monospace' }}>{k.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{k.description}</div>
                </div>
                <button
                  onClick={() => { setAdding(true); setForm(f => ({ ...f, name: k.name, paramCount: k.paramCount, description: k.description })) }}
                  style={{
                    padding: '5px 12px', borderRadius: 8, border: '1.5px solid var(--teal)',
                    background: 'var(--teal-light)', cursor: 'pointer', fontSize: 12,
                    color: 'var(--teal)', fontFamily: 'DM Sans, sans-serif', fontWeight: 600
                  }}
                >
                  + Add
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add form */}
      {adding ? (
        <div style={{ border: '1.5px solid var(--teal)', borderRadius: 12, padding: '18px 20px', background: 'var(--teal-light)', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--teal)' }}>Add Campaign</div>

          {/* cURL paste — auto-fills everything */}
          <div>
            <label style={{ fontSize: 11, color: 'var(--slate)', fontWeight: 500, display: 'block', marginBottom: 5 }}>
              Paste cURL from AiSynergy (auto-fills fields below)
            </label>
            <textarea
              value={form.curl}
              onChange={handleCurlPaste}
              placeholder={"curl -X POST ... -d '{\"campaignName\":\"...\",\"templateParams\":[...]}' https://..."}
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 10, fontSize: 11,
                border: '1.5px solid var(--border)', fontFamily: 'monospace',
                background: '#fff', resize: 'vertical', minHeight: 80,
                boxSizing: 'border-box', color: 'var(--slate)', lineHeight: 1.6
              }}
            />
            {form._parsed && (
              <div style={{ fontSize: 11, color: 'var(--teal)', marginTop: 4 }}>
                ✅ Auto-filled from cURL
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 2 }}>
              <label style={{ fontSize: 11, color: 'var(--slate)', fontWeight: 500, display: 'block', marginBottom: 5 }}>Campaign Name *</label>
              <input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. mediflow_bill_generated"
                style={{
                  width: '100%', padding: '9px 12px', borderRadius: 10, fontSize: 13,
                  border: '1.5px solid var(--border)', fontFamily: 'monospace',
                  background: '#fff', boxSizing: 'border-box'
                }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: 'var(--slate)', fontWeight: 500, display: 'block', marginBottom: 5 }}>No. of Params *</label>
              <input
                type="number" min="1" max="10"
                value={form.paramCount}
                onChange={e => setForm(f => ({ ...f, paramCount: e.target.value }))}
                style={{
                  width: '100%', padding: '9px 12px', borderRadius: 10, fontSize: 13,
                  border: '1.5px solid var(--border)', fontFamily: 'DM Sans, sans-serif',
                  background: '#fff', boxSizing: 'border-box'
                }}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: 11, color: 'var(--slate)', fontWeight: 500, display: 'block', marginBottom: 5 }}>Description (optional)</label>
            <input
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="e.g. Sent when bill is generated"
              style={{
                width: '100%', padding: '9px 12px', borderRadius: 10, fontSize: 13,
                border: '1.5px solid var(--border)', fontFamily: 'DM Sans, sans-serif',
                background: '#fff', boxSizing: 'border-box'
              }}
            />
          </div>

          {form.mediaUrl && (
            <div style={{ fontSize: 12, color: 'var(--teal)', background: '#fff', padding: '8px 12px', borderRadius: 8 }}>
              📎 Media URL detected from cURL: {form.mediaUrl.slice(0, 60)}…
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleSave} disabled={saving || !form.name}
              style={{
                padding: '9px 20px', borderRadius: 10, border: 'none',
                background: form.name ? 'var(--teal)' : 'var(--border)',
                color: '#fff', fontSize: 13, fontWeight: 600,
                cursor: form.name ? 'pointer' : 'not-allowed', fontFamily: 'DM Sans, sans-serif'
              }}>
              {saving ? 'Saving…' : 'Save Campaign'}
            </button>
            <button onClick={() => { setAdding(false); setForm({ name: '', paramCount: 2, description: '', curl: '', mediaUrl: '', mediaFilename: '', _parsed: false }) }}
              style={{
                padding: '9px 16px', borderRadius: 10, border: '1.5px solid var(--border)',
                background: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--slate)',
                fontFamily: 'DM Sans, sans-serif'
              }}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)}
          style={{
            padding: '10px 18px', borderRadius: 10, border: '1.5px dashed var(--teal)',
            background: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--teal)',
            fontFamily: 'DM Sans, sans-serif', fontWeight: 600, textAlign: 'left'
          }}>
          + Add Custom Campaign
        </button>
      )}
    </div>
  )
}
