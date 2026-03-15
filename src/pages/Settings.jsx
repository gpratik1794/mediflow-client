// src/pages/Settings.jsx
import React, { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../utils/AuthContext'
import Layout from '../components/Layout'
import { Card, CardHeader, Input, Select, Btn, Toast } from '../components/UI'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { logActivity, getActivityLog, getAllPatients, getAppointments } from '../firebase/clinicDb'
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
  { value: 'vaccine_given',   label: 'vaccine_given — Vaccine marked as given confirmation' },
  { value: 'vaccine_reminder',label: 'vaccine_reminder — Upcoming vaccine reminder to parents' },
  { value: 'custom',         label: 'custom — Other / custom use' },
]

// Available variables for each purpose — used in param mapping UI
// parentName = mother's name when sending to mother, father's name when sending to father
const VARIABLES_BY_PURPOSE = {
  vaccine_given:    ['childName','vaccineName','givenDate','nextVaccineInfo','centreName','parentName','guardianName','nextVaccineName','nextVaccineDate'],
  vaccine_reminder: ['childName','nextVaccineName','nextVaccineDate','centreName','parentName','guardianName'],
  appt_confirm:     ['patientName','apptDate','apptTime','doctorName','centreName'],
  followup:         ['patientName','apptDate','apptTime','doctorName','centreName'],
  bill_generated:   ['patientName','billAmount','visitDate','centreName'],
  report_ready:     ['patientName','visitDate','centreName'],
  custom:           ['childName','vaccineName','givenDate','nextVaccineInfo','nextVaccineName','nextVaccineDate','parentName','guardianName','patientName','apptDate','apptTime','doctorName','centreName','billAmount','visitDate','customParam1','customParam2'],
}

const TYPE_LABELS = {
  diagnostic: 'Diagnostic Centre',
  clinic: 'Clinic',
  both: 'Clinic + Diagnostic',
}

// Masked API key field component
function ApiKeyField({ value, onChange }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft]     = useState('')

  function startEdit() { setDraft(value); setEditing(true) }
  function save() { onChange(draft.trim()); setEditing(false) }
  function cancel() { setEditing(false) }

  const iStyle = { width: '100%', padding: '9px 13px', borderRadius: 9, border: '1.5px solid var(--border)', fontSize: 13, fontFamily: 'DM Sans, sans-serif', boxSizing: 'border-box', background: '#fff', color: 'var(--navy)' }
  const masked = value ? value.slice(0, 4) + '••••••••••••' + value.slice(-4) : ''

  return (
    <div>
      <label style={{ fontSize: 11, color: 'var(--slate)', fontWeight: 600, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.4 }}>AiSynergy API Key (Global)</label>
      {editing ? (
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={draft} onChange={e => setDraft(e.target.value)}
            placeholder="Paste your AiSynergy API key"
            autoFocus type="text"
            style={{ ...iStyle, flex: 1 }} />
          <button type="button" onClick={save} style={{ padding: '9px 14px', borderRadius: 9, border: 'none', background: 'var(--teal)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', whiteSpace: 'nowrap' }}>Save</button>
          <button type="button" onClick={cancel} style={{ padding: '9px 14px', borderRadius: 9, border: '1.5px solid var(--border)', background: '#fff', color: 'var(--slate)', fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>Cancel</button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ ...iStyle, flex: 1, color: value ? 'var(--navy)' : 'var(--muted)', fontFamily: value ? 'monospace' : 'DM Sans, sans-serif', letterSpacing: value ? 2 : 0 }}>
            {value ? masked : 'Not set — click Edit to add'}
          </div>
          <button type="button" onClick={startEdit} style={{ padding: '9px 14px', borderRadius: 9, border: '1.5px solid var(--border)', background: '#fff', color: 'var(--slate)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', whiteSpace: 'nowrap' }}>
            {value ? '✎ Edit' : '+ Add'}
          </button>
        </div>
      )}
      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>Shared across all campaigns. Use "Template Name" tab when adding campaigns to avoid pasting cURL each time.</div>
    </div>
  )
}

// Add-new-campaign sub-form — NIVO style with param mapping
function CampaignAdder({ onAdd, globalApiKey }) {
  const [open, setOpen]         = useState(false)
  const [tab, setTab]           = useState('name')
  const [purpose, setPurpose]   = useState('bill_generated')
  // Template name tab
  const [tplName, setTplName]   = useState('')
  const [paramCount, setParamCount] = useState('')
  const [paramMap, setParamMap] = useState([]) // [{ slot: 1, variable: 'childName' }]
  const [step, setStep]         = useState(1)  // 1=name entry, 2=param mapping
  // cURL tab
  const [curl, setCurl]         = useState('')
  const [curlPreview, setCurlPreview] = useState(null)
  const [curlParamMap, setCurlParamMap] = useState([])
  const [curlStep, setCurlStep] = useState(1) // 1=paste, 2=param mapping
  const [err, setErr]           = useState('')

  const variables = VARIABLES_BY_PURPOSE[purpose] || VARIABLES_BY_PURPOSE.custom

  function reset() {
    setOpen(false); setTplName(''); setParamCount(''); setParamMap([]); setStep(1)
    setCurl(''); setCurlPreview(null); setCurlParamMap([]); setCurlStep(1)
    setErr(''); setPurpose('bill_generated'); setTab('name')
  }

  function initParamMap(count, vars) {
    return Array.from({ length: count }, (_, i) => ({
      slot: i + 1,
      variable: vars[i] || ''
    }))
  }

  function handleNextName() {
    if (!tplName.trim()) { setErr('Enter the template/campaign name'); return }
    if (!globalApiKey?.trim()) { setErr('Save your AiSynergy API Key in Settings first'); return }
    const count = Number(paramCount)
    if (!count || count < 1) { setErr('Enter number of params (check your template in AiSynergy)'); return }
    setParamMap(initParamMap(count, variables))
    setStep(2); setErr('')
  }

  function handleCurlChange(v) {
    setCurl(v); setErr(''); setCurlStep(1)
    if (v.length > 20) {
      const parsed = parseCurl(v)
      setCurlPreview(parsed)
      if (parsed?.paramCount) setCurlParamMap(initParamMap(parsed.paramCount, variables))
    } else { setCurlPreview(null) }
  }

  function handleNextCurl() {
    if (!curlPreview) { setErr('Paste a valid cURL first'); return }
    setCurlStep(2); setErr('')
  }

  function buildCurl(apiKey, name, count) {
    const dummyParams = Array.from({ length: count }, (_, i) => `param${i+1}`)
    return `curl -X POST -H "Content-Type: application/json" -d '{"apiKey":"${apiKey}","campaignName":"${name}","destination":"919999999999","userName":"AISYNERGY","templateParams":${JSON.stringify(dummyParams)},"source":"mediflow","media":{},"attributes":{},"paramsFallbackValue":{"FirstName":"user"}}' https://backend.api-wa.co/campaign/aisynergy/api/v2`
  }

  function handleSave() {
    const isName = tab === 'name'
    const map    = isName ? paramMap : curlParamMap
    const finalCurl = isName
      ? buildCurl(globalApiKey.trim(), tplName.trim(), paramMap.length)
      : curl.trim()
    const finalName = isName ? tplName.trim() : (curlPreview?.campaignName || tplName)

    if (!finalCurl) { setErr('Missing cURL'); return }
    const parsed = parseCurl(finalCurl)
    if (!parsed?.apiKey) { setErr('Could not parse cURL — check and try again'); return }

    // Build ordered variable list from mapping
    const orderedVars = map.map(m => m.variable || '')
    onAdd({ name: finalName, purpose, curl: finalCurl, paramMapping: orderedVars })
    reset()
  }

  const iStyle2 = { width: '100%', padding: '9px 13px', borderRadius: 9, border: '1.5px solid var(--border)', fontSize: 13, fontFamily: 'DM Sans, sans-serif', boxSizing: 'border-box', background: '#fff', color: 'var(--navy)' }
  const lStyle2 = { fontSize: 11, color: 'var(--slate)', fontWeight: 600, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.4 }

  if (!open) return (
    <button type="button" onClick={() => setOpen(true)} style={{
      padding: '10px 18px', borderRadius: 10, border: '1.5px dashed var(--teal)',
      background: 'none', color: 'var(--teal)', fontSize: 13, fontWeight: 600,
      cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', width: '100%'
    }}>+ Add Campaign</button>
  )

  const currentStep = tab === 'name' ? step : curlStep
  const currentMap  = tab === 'name' ? paramMap : curlParamMap
  const setCurrentMap = tab === 'name' ? setParamMap : setCurlParamMap

  return (
    <div style={{ border: '1.5px solid var(--teal)', borderRadius: 12, padding: '20px', display: 'flex', flexDirection: 'column', gap: 16, background: 'var(--teal-light)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--teal)' }}>Add New Campaign</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {['Step 1: Setup', 'Step 2: Map Params'].map((label, i) => (
            <div key={i} style={{ fontSize: 10, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: currentStep === i+1 ? 'var(--teal)' : 'white', color: currentStep === i+1 ? 'white' : 'var(--muted)', border: '1px solid var(--border)' }}>{label}</div>
          ))}
        </div>
      </div>

      {/* STEP 1 */}
      {currentStep === 1 && (<>
        {/* Purpose */}
        <div>
          <label style={lStyle2}>Purpose</label>
          <select value={purpose} onChange={e => { setPurpose(e.target.value); setErr('') }} style={iStyle2}>
            {PURPOSE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {/* Tab switcher */}
        <div style={{ display: 'flex', border: '1.5px solid var(--border)', borderRadius: 9, overflow: 'hidden' }}>
          {['name', 'curl'].map(k => (
            <button key={k} type="button" onClick={() => { setTab(k); setErr('') }} style={{
              flex: 1, padding: '9px 0', border: 'none', cursor: 'pointer',
              fontFamily: 'DM Sans, sans-serif', fontSize: 12, fontWeight: 600,
              background: tab === k ? 'var(--teal)' : '#fff',
              color: tab === k ? '#fff' : 'var(--muted)',
            }}>{k === 'name' ? '🔍 Template Name' : '📋 Paste cURL'}</button>
          ))}
        </div>

        {tab === 'name' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {!globalApiKey && (
              <div style={{ background: '#FFF7ED', borderRadius: 8, padding: '8px 12px', fontSize: 11, color: '#C2410C' }}>
                ⚠ Save your AiSynergy API Key above first before using this tab.
              </div>
            )}
            <div>
              <label style={lStyle2}>Template / Campaign Name</label>
              <input value={tplName} onChange={e => { setTplName(e.target.value); setErr('') }}
                placeholder="e.g. mediflow_vaccine_confirmation"
                style={iStyle2} />
              <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>Exact name as shown in AiSynergy → Campaigns</div>
            </div>
            <div>
              <label style={lStyle2}>How many params does this template have?</label>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <input type="number" min="1" max="10" value={paramCount}
                  onChange={e => { setParamCount(e.target.value); setErr('') }}
                  placeholder="e.g. 5"
                  style={{ ...iStyle2, width: 100 }} />
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>Count the {'{{1}} {{2}}...'} in your template</span>
              </div>
            </div>
          </div>
        )}

        {tab === 'curl' && (
          <div>
            <label style={lStyle2}>Paste full cURL from AiSynergy → Campaigns → API</label>
            <textarea value={curl} onChange={e => handleCurlChange(e.target.value)}
              placeholder={`curl -X POST -H "Content-Type: application/json" -d '{"apiKey":"...","campaignName":"...",...}' https://backend.api-wa.co/campaign/aisynergy/api/v2`}
              style={{ ...iStyle2, minHeight: 100, fontFamily: 'monospace', fontSize: 11, resize: 'vertical', lineHeight: 1.6 }} />
            {curlPreview && (
              <div style={{ background: '#E6F7F5', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#0B9E8A', marginTop: 8 }}>
                ✅ Parsed · <strong>{curlPreview.campaignName}</strong> · {curlPreview.paramCount} params detected{curlPreview.hasMedia ? ' · media' : ''}
              </div>
            )}
          </div>
        )}

        {err && <div style={{ background: '#FEF2F2', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#C0392B' }}>{err}</div>}

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={tab === 'name' ? handleNextName : handleNextCurl} style={{
            padding: '9px 20px', borderRadius: 9, border: 'none', background: 'var(--teal)',
            color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif'
          }}>Next: Map Params →</button>
          <button type="button" onClick={reset} style={{
            padding: '9px 16px', borderRadius: 9, border: '1.5px solid var(--border)',
            background: '#fff', color: 'var(--slate)', fontSize: 13, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif'
          }}>Cancel</button>
        </div>
      </>)}

      {/* STEP 2: Param Mapping */}
      {currentStep === 2 && (<>
        <div style={{ fontSize: 12, color: 'var(--slate)', lineHeight: 1.6 }}>
          Map each template param <strong>{'{{1}}, {{2}}'}</strong> to a MediFlow variable. This controls what data gets sent in each slot.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {currentMap.map((m, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'white', borderRadius: 10, padding: '10px 14px', border: '1px solid var(--border)' }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--teal-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'var(--teal)', flexShrink: 0 }}>
                {'{{'}{m.slot}{'}}'}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3 }}>Param {m.slot}</div>
                <select value={m.variable} onChange={e => {
                  const updated = [...currentMap]; updated[i] = { ...m, variable: e.target.value }; setCurrentMap(updated)
                }} style={{ ...iStyle2, padding: '6px 10px', fontSize: 12 }}>
                  <option value="">— Select variable —</option>
                  {variables.map(v => <option key={v} value={v}>{v}</option>)}
                  <option value="__custom__">Custom text…</option>
                </select>
                {m.variable === '__custom__' && (
                  <input placeholder="e.g. Fixed text or leave blank"
                    onChange={e => { const updated = [...currentMap]; updated[i] = { ...m, customText: e.target.value }; setCurrentMap(updated) }}
                    style={{ ...iStyle2, marginTop: 6, fontSize: 12, padding: '6px 10px' }} />
                )}
              </div>
            </div>
          ))}
        </div>

        <div style={{ background: '#F0F9FF', borderRadius: 8, padding: '10px 12px', fontSize: 11, color: '#0369A1', lineHeight: 1.6 }}>
          💡 Variables like <code>childName</code>, <code>vaccineName</code> etc. are filled automatically by MediFlow when sending. <code>parentName</code> automatically uses the mother's name when sending to mother, and father's name when sending to father. You can still edit individual params in the "Mark Given" modal before confirming.
        </div>

        {err && <div style={{ background: '#FEF2F2', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#C0392B' }}>{err}</div>}

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => { tab === 'name' ? setStep(1) : setCurlStep(1); setErr('') }} style={{
            padding: '9px 16px', borderRadius: 9, border: '1.5px solid var(--border)',
            background: '#fff', color: 'var(--slate)', fontSize: 13, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif'
          }}>← Back</button>
          <button type="button" onClick={handleSave} style={{
            padding: '9px 20px', borderRadius: 9, border: 'none', background: 'var(--teal)',
            color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif'
          }}>✓ Save Campaign</button>
          <button type="button" onClick={reset} style={{
            padding: '9px 16px', borderRadius: 9, border: '1.5px solid var(--border)',
            background: '#fff', color: 'var(--slate)', fontSize: 13, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif'
          }}>Cancel</button>
        </div>
      </>)}
    </div>
  )
}


// ── Campaign Card — shows body editor + delete, no full edit mode ─────────────
function CampaignCard({ campaign: c, parsed, enabled, centreName, campaigns, onToggleEnabled, onDelete, onSaveBody }) {
  const [showBody, setShowBody]   = useState(false)
  const [bodyDraft, setBodyDraft] = useState(c.templateBody || '')
  const [bodySaved, setBodySaved] = useState(false)

  async function handleSaveBody() {
    await onSaveBody(bodyDraft.trim())
    setBodySaved(true)
    setTimeout(() => setBodySaved(false), 2000)
  }

  const iStyle = { width: '100%', padding: '9px 13px', borderRadius: 9, border: '1.5px solid var(--border)', fontSize: 12, fontFamily: 'DM Sans, sans-serif', boxSizing: 'border-box', background: '#fff', color: 'var(--navy)', outline: 'none', resize: 'vertical' }

  return (
    <div style={{ border: '1.5px solid var(--border)', borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10, background: enabled ? 'var(--surface)' : 'var(--bg)', opacity: enabled ? 1 : 0.7 }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: enabled ? 'var(--teal)' : 'var(--muted)', background: enabled ? 'var(--teal-light)' : 'var(--border)', padding: '3px 10px', borderRadius: 20 }}>{c.purpose}</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>{c.name}</span>
          {parsed && <span style={{ fontSize: 11, color: 'var(--muted)' }}>· {parsed.paramCount} params{parsed.hasMedia ? ' · doc' : ''}</span>}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Toggle body editor */}
          <button type="button" onClick={() => setShowBody(s => !s)} style={{ padding: '4px 10px', borderRadius: 20, border: '1.5px solid var(--border)', background: showBody ? 'var(--teal-light)' : 'none', color: showBody ? 'var(--teal)' : 'var(--muted)', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
            {c.templateBody ? '✎ Edit Body' : '+ Add Body'}
          </button>
          {/* Active/Paused toggle */}
          <button type="button" onClick={onToggleEnabled} style={{ padding: '4px 12px', borderRadius: 20, border: '1.5px solid', borderColor: enabled ? 'var(--teal)' : 'var(--border)', background: enabled ? 'var(--teal-light)' : 'none', color: enabled ? 'var(--teal)' : 'var(--muted)', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
            {enabled ? '● Active' : '○ Paused'}
          </button>
          {/* Delete */}
          <button type="button" onClick={onDelete} style={{ background: 'var(--red-bg)', border: 'none', borderRadius: 8, color: 'var(--red)', fontSize: 11, fontWeight: 600, padding: '4px 10px', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>✕ Delete</button>
        </div>
      </div>

      {/* Campaign name monospace */}
      {parsed && (
        <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace', background: 'var(--bg)', padding: '5px 9px', borderRadius: 7, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          campaign: {parsed.campaignName}
        </div>
      )}

      {/* ── Template Body editor — collapsible ── */}
      {showBody && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--bg)', borderRadius: 10, padding: '12px 14px', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
            Template Body Text
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.6 }}>
            Paste your exact WhatsApp template message here. Use <code>{'{{1}}'}</code>, <code>{'{{2}}'}</code> etc. for params. This is shown as a preview in the Marketing send modal.
          </div>
          <textarea
            value={bodyDraft}
            onChange={e => { setBodyDraft(e.target.value); setBodySaved(false) }}
            placeholder={`e.g. Dear {{1}}, we are hosting a Diabetes Camp on {{2}}. Join us for a free checkup. — ${c.name || 'YourClinic'}`}
            rows={4}
            style={iStyle}
          />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button type="button" onClick={handleSaveBody} style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: 'var(--teal)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
              {bodySaved ? '✓ Saved' : '💾 Save Body'}
            </button>
            <button type="button" onClick={() => { setShowBody(false); setBodyDraft(c.templateBody || '') }} style={{ padding: '7px 12px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'none', color: 'var(--slate)', fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
              Cancel
            </button>
            {c.templateBody && (
              <span style={{ fontSize: 11, color: 'var(--teal)', marginLeft: 4 }}>✓ Body saved</span>
            )}
          </div>
        </div>
      )}

      <CampaignInlineTest campaign={c} centreName={centreName} campaigns={campaigns} />
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

    // Build dummy params matching the exact param count of this campaign
    // Uses paramMapping variable names to fill sensible test values
    const parsed     = parseCurl(campaign.curl)
    const paramCount = parsed?.paramCount || 1
    const mapping    = campaign.paramMapping || []

    const DUMMY_VALUES = {
      patientName:      'Test Patient',
      childName:        'Test Child',
      parentName:       'Parent Name',
      guardianName:     'Guardian Name',
      doctorName:       'Dr. Test',
      centreName:       centreName || 'Test Clinic',
      apptDate:         new Date().toLocaleDateString('en-IN'),
      apptTime:         '11:00 AM',
      nextVaccineName:  'Test Vaccine',
      nextVaccineDate:  new Date().toLocaleDateString('en-IN'),
      vaccineName:      'Test Vaccine',
      givenDate:        new Date().toLocaleDateString('en-IN'),
      nextVaccineInfo:  'Due in 4 weeks',
      billAmount:       '500',
      visitDate:        new Date().toLocaleDateString('en-IN'),
      customParam1:     'Test Value 1',
      customParam2:     'Test Value 2',
    }

    // Build params array — use mapping variable if available, else sensible fallback
    const testParams = Array.from({ length: paramCount }, (_, i) => {
      const variable = mapping[i]
      if (variable && variable !== '__custom__' && DUMMY_VALUES[variable]) {
        return DUMMY_VALUES[variable]
      }
      // Position-based fallbacks for unmapped slots
      if (i === 0) return 'Test Patient'
      if (i === 1) return centreName || 'Test Clinic'
      return `Test Value ${i + 1}`
    })

    const result = await sendCampaign(campaigns, campaign.purpose, phone, testParams)
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

// ── Doctors Manager ───────────────────────────────────────────────────────────

const SCHEDULE_TIME_OPTIONS = [
  { value: '19:00', label: '7:00 PM' },
  { value: '19:30', label: '7:30 PM' },
  { value: '20:00', label: '8:00 PM' },
  { value: '20:30', label: '8:30 PM' },
  { value: '21:00', label: '9:00 PM' },
  { value: '21:30', label: '9:30 PM' },
  { value: '22:00', label: '10:00 PM' },
  { value: '22:30', label: '10:30 PM' },
  { value: '23:00', label: '11:00 PM' },
]

// ── Doctor Availability Component ────────────────────────────────────────────
// Manages vacation dates and per-date slot count overrides
// Shows a mini calendar — today onwards, vacation dates greyed, easy toggle
function DateModal({ ds, unavail, overrides, onToggleLeave, onSlotOverride, onSave, onClose, appointments, bookingUrl, campaigns, aisynergyApiKey, centreName }) {
  const FMTS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const [sy, sm, sd] = ds.split('-').map(Number)
  const dateLabel = `${sd} ${FMTS[sm-1]} ${sy}`
  const isOff   = unavail.includes(ds)
  const cfg     = overrides[ds] || {}
  const mVal    = cfg.morning   || 'all'
  const eVal    = cfg.evening   || 'all'
  const mStart  = cfg.morningStart  || ''
  const eStart  = cfg.eveningStart  || ''
  const hasOver = cfg.morning !== undefined || cfg.evening !== undefined || cfg.morningStart || cfg.eveningStart
  const mLabel  = mVal === 'off' ? 'Closed' : mVal === 'all' ? 'All slots' : `${mVal} slots`
  const eLabel  = eVal === 'off' ? 'Closed' : eVal === 'all' ? 'All slots' : `${eVal} slots`
  const sStyle  = { width: '100%', padding: '8px 10px', borderRadius: 9, border: '1.5px solid var(--border)', fontSize: 13, fontFamily: 'DM Sans, sans-serif', boxSizing: 'border-box', background: '#fff', color: 'var(--navy)' }

  // ── Reschedule ──
  const [sending, setSending] = useState({})
  const [sent, setSent]       = useState({})

  // Determine reschedule scenario per appointment
  function getRescheduleScenario(appt) {
    if (isOff) return 'full_day'
    const sess = appt.session || (appt.appointmentTime && appt.appointmentTime.includes(':') ?
      (() => { const p = appt.appointmentTime.split(' '); const h = parseInt(p[0]); const ampm = p[1]; const h24 = ampm === 'PM' && h !== 12 ? h+12 : (ampm==='AM'&&h===12?0:h); return h24 < 14 ? 'morning' : 'evening' })() : null)
    if (!sess) return 'full_day'
    const sessOverride = cfg[sess]
    const otherSess = sess === 'morning' ? 'evening' : 'morning'
    const otherOverride = cfg[otherSess]
    if (sessOverride === 'off') {
      if (otherOverride !== 'off') return `session_off_${sess}`
      return 'full_day'
    }
    if (mStart && sess === 'morning') return 'start_time_change'
    if (eStart && sess === 'evening') return 'start_time_change'
    return 'slots_limited'
  }

  async function sendReschedule(appt) {
    const key = appt.id
    setSending(s => ({ ...s, [key]: true }))
    try {
      const scenario = getRescheduleScenario(appt)
      const link = bookingUrl || window.location.origin + '/book'
      let msg = ''
      if (scenario === 'full_day') {
        msg = `Hi ${appt.patientName}, your appointment at ${centreName || 'the clinic'} on ${dateLabel} has been cancelled as the doctor is unavailable for the day. Please reschedule your appointment at: ${link}`
      } else if (scenario === 'session_off_morning') {
        msg = `Hi ${appt.patientName}, the morning session on ${dateLabel} at ${centreName || 'the clinic'} has been closed. The evening session is still available — please reschedule at: ${link}`
      } else if (scenario === 'session_off_evening') {
        msg = `Hi ${appt.patientName}, the evening session on ${dateLabel} at ${centreName || 'the clinic'} has been closed. The morning session is still available — please reschedule at: ${link}`
      } else if (scenario === 'start_time_change') {
        const newStart = appt.session === 'morning' ? mStart : eStart
        msg = `Hi ${appt.patientName}, please note that the doctor's session on ${dateLabel} at ${centreName || 'the clinic'} will now start at ${newStart} instead of the usual time. Please update your plan or reschedule at: ${link}`
      } else {
        msg = `Hi ${appt.patientName}, your appointment on ${dateLabel} at ${centreName || 'the clinic'} may be affected due to slot changes. Please confirm or reschedule at: ${link}`
      }
      // Use appt_reschedule campaign if available, otherwise use plain WA via AiSynergy
      const rescheduleCampaign = (campaigns || []).find(c => c.purpose === 'appt_reschedule' && c.enabled !== false)
      if (rescheduleCampaign) {
        const { sendCampaign } = await import('../firebase/whatsapp')
        await sendCampaign([rescheduleCampaign], 'appt_reschedule', appt.phone, [appt.patientName, dateLabel, link, msg])
      } else if (aisynergyApiKey) {
        // Direct plain text WA via AiSynergy /send-message endpoint
        await fetch('https://app.aisynergy.io/api/send-message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aisynergyApiKey}` },
          body: JSON.stringify({ phone: '91' + appt.phone, message: msg })
        })
      }
      setSent(s => ({ ...s, [key]: true }))
    } catch(e) { console.error('Reschedule WA error:', e) }
    setSending(s => ({ ...s, [key]: false }))
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 460, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)' }}>📅 {dateLabel}</div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--muted)', lineHeight: 1 }}>✕</button>
        </div>

        {/* Status */}
        <div style={{ fontSize: 12, borderRadius: 8, padding: '8px 12px', marginBottom: 16,
          background: isOff ? '#FEF2F2' : hasOver ? '#FFFBEB' : 'var(--teal-light)',
          color: isOff ? '#DC2626' : hasOver ? '#D97706' : 'var(--teal)', fontWeight: 600 }}>
          {isOff ? '🔴 Marked as leave — no bookings allowed'
           : hasOver ? `🟡 Override active — 🌅 ${mLabel}${mStart ? ` from ${mStart}` : ''} · 🌆 ${eLabel}${eStart ? ` from ${eStart}` : ''}`
           : '🟢 Normal working day — all slots available'}
        </div>

        {/* Leave toggle */}
        {isOff ? (
          <button type="button" onClick={() => { onToggleLeave(ds); onClose() }}
            style={{ width: '100%', padding: '10px', borderRadius: 9, border: '1.5px solid var(--green)', background: 'var(--green-bg)', color: 'var(--green)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', marginBottom: 12 }}>
            ✓ Remove leave — mark as working day
          </button>
        ) : (
          <button type="button" onClick={() => {
            if (hasOver && !window.confirm(`${dateLabel} has a slot override. Marking as leave will remove overrides too. Proceed?`)) return
            onToggleLeave(ds); onClose()
          }} style={{ width: '100%', padding: '10px', borderRadius: 9, border: '1.5px solid #DC2626', background: '#FEF2F2', color: '#DC2626', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', marginBottom: 16 }}>
            🔴 Mark as full day leave
          </button>
        )}

        {/* Slot overrides — only if not on leave */}
        {!isOff && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy)', marginBottom: 10 }}>🎯 Slot override for this date</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 12 }}>
              {[
                { key: 'morning', label: '🌅 Morning', val: mVal, startVal: mStart, startKey: 'morningStart' },
                { key: 'evening', label: '🌆 Evening', val: eVal, startVal: eStart, startKey: 'eveningStart' },
              ].map(({ key, label, val, startVal, startKey }) => (
                <div key={key} style={{ background: 'var(--bg)', borderRadius: 10, padding: '12px 14px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--slate)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4 }}>Available slots</div>
                      <select value={val} onChange={e => onSlotOverride(ds, key, e.target.value)} style={sStyle}>
                        <option value="all">All (default)</option>
                        <option value="off">Off (closed)</option>
                        {[1,2,3,4,5,6,8,10,12,15,20,25,30].map(n => <option key={n} value={n}>{n} slots</option>)}
                      </select>
                    </div>
                    {val !== 'off' && (
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4 }}>Doctor start time <span style={{ color: '#D97706' }}>(optional)</span></div>
                        <input
                          type="time"
                          value={startVal}
                          onChange={e => onSlotOverride(ds, startKey, e.target.value || null)}
                          style={sStyle}
                          placeholder="Clinic default"
                        />
                      </div>
                    )}
                  </div>
                  {startVal && val !== 'off' && (
                    <div style={{ fontSize: 10, color: '#D97706', marginTop: 6 }}>
                      ⚡ Slots will start at {startVal} instead of the clinic default
                    </div>
                  )}
                </div>
              ))}
            </div>
            {hasOver && (
              <button type="button" onClick={() => { onSlotOverride(ds, '_reset', null); onClose() }}
                style={{ width: '100%', padding: '8px', borderRadius: 9, border: '1.5px solid var(--border)', background: '#fff', color: 'var(--slate)', fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                Reset to clinic defaults
              </button>
            )}
          </div>
        )}

        {/* ── Affected appointments & reschedule ── */}
        {appointments && appointments.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy)', marginBottom: 6 }}>
              📋 {appointments.length} appointment{appointments.length !== 1 ? 's' : ''} on this day
            </div>
            <div style={{ fontSize: 11, color: 'var(--slate)', marginBottom: 10, lineHeight: 1.5 }}>
              {isOff ? 'Doctor is unavailable — send reschedule messages to all patients.' :
               mVal === 'off' ? 'Morning session closed — morning patients should reschedule.' :
               eVal === 'off' ? 'Evening session closed — evening patients should reschedule.' :
               mStart || eStart ? 'Doctor start time changed — affected patients should be notified.' :
               'Slots have been updated for this day.'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {appointments.filter(a => a.status !== 'cancelled').map(appt => {
                const scenario = getRescheduleScenario(appt)
                const scenarioLabel = scenario === 'full_day' ? '🔴 Full day off' :
                  scenario === 'session_off_morning' ? '🌅 Morning closed' :
                  scenario === 'session_off_evening' ? '🌆 Evening closed' :
                  scenario === 'start_time_change' ? '⏰ Time changed' : '📊 Slots limited'
                const needsReschedule = isOff || scenario !== 'slots_limited'
                return (
                  <div key={appt.id} style={{ background: needsReschedule ? '#FEF2F2' : 'var(--bg)', border: `1px solid ${needsReschedule ? '#FECACA' : 'var(--border)'}`, borderRadius: 10, padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--navy)' }}>{appt.patientName}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{appt.appointmentTime || 'Walk-in'} · {appt.phone}</div>
                      <div style={{ fontSize: 10, color: needsReschedule ? '#DC2626' : 'var(--muted)', marginTop: 2 }}>{scenarioLabel}</div>
                    </div>
                    {appt.phone && (
                      <button type="button"
                        disabled={sending[appt.id] || sent[appt.id]}
                        onClick={() => sendReschedule(appt)}
                        style={{ padding: '6px 12px', borderRadius: 8, border: 'none', fontSize: 11, fontWeight: 600, fontFamily: 'DM Sans, sans-serif', cursor: sent[appt.id] ? 'default' : 'pointer',
                          background: sent[appt.id] ? '#D1FAE5' : '#25D366', color: sent[appt.id] ? '#065F46' : '#fff',
                          opacity: sending[appt.id] ? 0.6 : 1, whiteSpace: 'nowrap' }}>
                        {sending[appt.id] ? 'Sending…' : sent[appt.id] ? '✓ Sent' : '📲 Send WA'}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
            <button type="button"
              onClick={() => appointments.filter(a => a.status !== 'cancelled' && a.phone).forEach(a => sendReschedule(a))}
              style={{ width: '100%', marginTop: 10, padding: '9px', borderRadius: 9, border: 'none', background: '#25D366', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
              📲 Send to All Patients
            </button>
          </div>
        )}

        <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
          <button type="button" onClick={onClose}
            style={{ flex: 1, padding: '10px', borderRadius: 9, border: '1.5px solid var(--border)', background: '#fff', color: 'var(--slate)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
            Cancel
          </button>
          <button type="button" onClick={() => { onSave(); onClose() }}
            style={{ flex: 2, padding: '10px', borderRadius: 9, border: 'none', background: 'var(--teal)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
            💾 Save Changes
          </button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10, lineHeight: 1.6 }}>
          Changes apply immediately for new bookings. Existing appointments are not affected automatically.
        </div>
      </div>
    </div>
  )
}
function DoctorAvailability({ doctor: d, doctorIndex: i, doctors, onChange, onSaveDoctors, centreId, bookingUrl, campaigns, aisynergyApiKey, centreName }) {
  const today = new Date(); today.setHours(0,0,0,0)
  const todayStr = today.toISOString().split('T')[0]
  const [calYear,  setCalYear]  = useState(today.getFullYear())
  const [calMonth, setCalMonth] = useState(today.getMonth())
  const [modalDay, setModalDay] = useState(null)
  const [modalAppts, setModalAppts] = useState([])

  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
  const DAYS   = ['Su','Mo','Tu','We','Th','Fr','Sa']
  const unavail   = d.unavailableDates || []
  const overrides = d.slotOverrides    || {}

  function toStr(y, m, day) {
    return `${y}-${String(m+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
  }

  function toggleLeave(ds) {
    const updated = [...doctors]
    const isOff = unavail.includes(ds)
    if (isOff) {
      const newOverrides = { ...overrides }; delete newOverrides[ds]
      updated[i] = { ...d, unavailableDates: unavail.filter(x => x !== ds), slotOverrides: newOverrides }
    } else {
      updated[i] = { ...d, unavailableDates: [...unavail, ds].sort() }
    }
    onChange(updated)
  }

  function saveSlotOverride(ds, session, val) {
    const updated = [...doctors]
    const newOverrides = { ...overrides }
    if (session === '_reset') {
      delete newOverrides[ds]
    } else if (session === 'morningStart' || session === 'eveningStart') {
      // Start time override — store or clear
      const existing = newOverrides[ds] || {}
      if (!val) {
        const { [session]: _, ...rest } = existing
        if (Object.keys(rest).length === 0) delete newOverrides[ds]
        else newOverrides[ds] = rest
      } else {
        newOverrides[ds] = { ...existing, [session]: val }
      }
    } else {
      const existing = newOverrides[ds] || {}
      if (val === 'all') {
        // Check if anything else is set; if nothing meaningful remains, clean up
        const { [session]: _, morningStart, eveningStart, ...rest } = existing
        const other = session === 'morning' ? existing.evening : existing.morning
        const otherStart = session === 'morning' ? existing.eveningStart : existing.morningStart
        const myStart = session === 'morning' ? existing.morningStart : existing.eveningStart
        // Remove this session's startTime too if resetting to 'all'
        const removeKey = session === 'morning' ? 'morningStart' : 'eveningStart'
        const cleaned = { ...existing }; delete cleaned[session]; delete cleaned[removeKey]
        if (!other || other === 'all') {
          if (!otherStart && Object.keys(cleaned).length === 0) delete newOverrides[ds]
          else newOverrides[ds] = cleaned
        } else {
          newOverrides[ds] = { ...cleaned }
        }
      } else {
        newOverrides[ds] = { ...existing, [session]: val === 'off' ? 'off' : parseInt(val) || 'all' }
      }
    }
    updated[i] = { ...d, slotOverrides: newOverrides }
    onChange(updated)
  }

  const canGoPrev = calYear > today.getFullYear() || (calYear === today.getFullYear() && calMonth > today.getMonth())
  const firstDay = new Date(calYear, calMonth, 1).getDay()
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate()
  const cells = []
  for (let p = 0; p < firstDay; p++) cells.push(null)
  for (let day = 1; day <= daysInMonth; day++) cells.push(day)

  return (
    <div>
      {/* Compact month navigator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <button type="button" onClick={() => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y-1) } else setCalMonth(m => m-1) }}
          disabled={!canGoPrev}
          style={{ padding: '3px 8px', borderRadius: 6, border: '1.5px solid var(--border)', background: 'none', cursor: canGoPrev ? 'pointer' : 'not-allowed', color: canGoPrev ? 'var(--navy)' : 'var(--border)', fontSize: 12 }}>‹</button>
        <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--navy)', flex: 1, textAlign: 'center' }}>{MONTHS[calMonth].slice(0,3)} {calYear}</div>
        <button type="button" onClick={() => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y+1) } else setCalMonth(m => m+1) }}
          style={{ padding: '3px 8px', borderRadius: 6, border: '1.5px solid var(--border)', background: 'none', cursor: 'pointer', color: 'var(--navy)', fontSize: 12 }}>›</button>
      </div>

      {/* Day headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 2 }}>
        {DAYS.map(day => <div key={day} style={{ textAlign: 'center', fontSize: 9, fontWeight: 600, color: 'var(--muted)' }}>{day}</div>)}
      </div>

      {/* Calendar grid — compact */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 10 }}>
        {cells.map((day, idx) => {
          if (!day) return <div key={idx} />
          const ds      = toStr(calYear, calMonth, day)
          const isPast  = ds < todayStr
          const isOff   = unavail.includes(ds)
          const ov      = overrides[ds] || {}
          const hasOver = isOff ? false : !!(ov.morning !== undefined || ov.evening !== undefined || ov.morningStart || ov.eveningStart)
          const isToday = ds === todayStr
          // Build pill label
          let pillLabel = null; let pillColor = null
          if (isOff) { pillLabel = 'leave'; pillColor = '#DC2626' }
          else if (hasOver) {
            const parts = []
            if (ov.morning === 'off') parts.push('AM off')
            else if (ov.morning && ov.morning !== 'all') parts.push(`AM:${ov.morning}`)
            if (ov.evening === 'off') parts.push('PM off')
            else if (ov.evening && ov.evening !== 'all') parts.push(`PM:${ov.evening}`)
            if (ov.morningStart) parts.push(`AM@${ov.morningStart}`)
            if (ov.eveningStart) parts.push(`PM@${ov.eveningStart}`)
            pillLabel = parts.length ? parts[0] : 'override'
            pillColor = '#D97706'
          }
          return (
            <button key={ds} type="button"
              onClick={() => {
                if (!isPast) {
                  setModalDay(ds)
                  if (centreId) {
                    getAppointments(centreId, ds).then(appts => {
                      const docAppts = appts.filter(a => !d.name || !a.doctorName || a.doctorName === d.name)
                      setModalAppts(docAppts)
                    }).catch(() => setModalAppts([]))
                  } else { setModalAppts([]) }
                }
              }}
              disabled={isPast}
              title={isOff ? 'Leave' : hasOver ? 'Override set — click to edit' : isToday ? 'Today' : 'Click to configure'}
              style={{
                padding: '3px 1px 4px', borderRadius: 5,
                border: isToday ? '1.5px solid var(--teal)' : isOff ? '1.5px solid #FECACA' : hasOver ? '1.5px solid #FCD34D' : '1.5px solid transparent',
                background: isPast ? 'transparent' : isOff ? '#FEE2E2' : hasOver ? '#FEF3C7' : 'var(--surface)',
                color: isPast ? 'var(--border)' : isOff ? '#DC2626' : 'var(--navy)',
                cursor: isPast ? 'default' : 'pointer',
                fontSize: 11, fontWeight: isToday ? 700 : 400,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexDirection: 'column', gap: 0, lineHeight: 1.2, minHeight: 30,
              }}>
              {day}
              {pillLabel && (
                <span style={{
                  fontSize: 6, fontWeight: 700, color: pillColor,
                  background: isOff ? '#FECACA' : '#FDE68A',
                  borderRadius: 3, padding: '0 2px', marginTop: 1,
                  maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                }}>{pillLabel}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        {[['#FEE2E2','#DC2626','Leave'], ['#FEF3C7','#D97706','Override'], ['var(--teal-light)','var(--teal)','Today']].map(([bg, col, label]) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 10, height: 10, borderRadius: 3, background: bg, border: `1px solid ${col}` }} />
            <span style={{ fontSize: 10, color: 'var(--muted)' }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Active overrides summary */}
      {(unavail.filter(dt => dt >= todayStr).length > 0 || Object.keys(overrides).length > 0) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 4 }}>
          {unavail.filter(dt => dt >= todayStr).sort().map(dt => (
            <div key={dt} onClick={() => setModalDay(dt)}
              style={{ display: 'flex', alignItems: 'center', gap: 3, background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 20, padding: '2px 8px', cursor: 'pointer' }}>
              <span style={{ fontSize: 11, color: '#DC2626', fontWeight: 600 }}>{dt}</span>
              <span style={{ fontSize: 10, color: '#DC2626' }}>leave</span>
            </div>
          ))}
          {Object.entries(overrides).sort().map(([dt, cfg]) => {
            const mL = cfg.morning === 'off' ? 'Off' : cfg.morning === 'all' || !cfg.morning ? '—' : `${cfg.morning}`
            const eL = cfg.evening === 'off' ? 'Off' : cfg.evening === 'all' || !cfg.evening ? '—' : `${cfg.evening}`
            return (
              <div key={dt} onClick={() => setModalDay(dt)}
                style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 20, padding: '2px 8px', cursor: 'pointer' }}>
                <span style={{ fontSize: 11, color: '#92400E', fontWeight: 600 }}>{dt}</span>
                <span style={{ fontSize: 10, color: '#D97706' }}>🌅{mL} 🌆{eL}</span>
              </div>
            )
          })}
        </div>
      )}
      <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 6 }}>Click any date to mark leave or adjust slots</div>

      {/* Date modal */}
      {modalDay && (
        <DateModal ds={modalDay} unavail={unavail} overrides={overrides}
          onToggleLeave={toggleLeave}
          onSlotOverride={saveSlotOverride}
          onSave={() => onSaveDoctors && onSaveDoctors(doctors)}
          onClose={() => setModalDay(null)}
          appointments={modalAppts}
          bookingUrl={bookingUrl}
          campaigns={campaigns}
          aisynergyApiKey={aisynergyApiKey}
          centreName={centreName}
        />
      )}
    </div>
  )
}


const EMPTY_DOCTOR = {
  name: '', degree: '', speciality: '', phone: '',
  firstVisitFee: '', repeatVisitFee: '',
  scheduleNotifyTime: '21:00',
  morningStart: '09:00', morningEnd: '13:00',
  eveningStart: '16:00', eveningEnd: '20:00',
  slotDuration: '30',
  weeklyOff: [],
  lateCheckinPenalty: '0',
}

function DoctorsManager({ doctors, onChange, onSaveDoctors, onRemoveDoctor, centreId, bookingUrl, campaigns, aisynergyApiKey, centreName }) {
  const [adding, setAdding]   = useState(false)
  const [draft, setDraft]     = useState(EMPTY_DOCTOR)
  const [err, setErr]         = useState('')

  const iStyle = { width: '100%', padding: '9px 13px', borderRadius: 9, border: '1.5px solid var(--border)', fontSize: 13, fontFamily: 'DM Sans, sans-serif', boxSizing: 'border-box', background: '#fff', color: 'var(--navy)', outline: 'none' }
  const lStyle = { fontSize: 11, color: 'var(--slate)', fontWeight: 600, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.4 }
  const sStyle = { ...iStyle, padding: '8px 10px' }

  function handleAdd() {
    if (!draft.name.trim()) { setErr('Doctor name is required'); return }
    onChange([...doctors, {
      name: draft.name.trim(),
      degree: draft.degree.trim(),
      speciality: draft.speciality.trim(),
      phone: draft.phone.trim(),
      firstVisitFee: draft.firstVisitFee.trim(),
      repeatVisitFee: draft.repeatVisitFee.trim(),
      scheduleNotifyTime: draft.scheduleNotifyTime || '21:00',
      morningStart: draft.morningStart || '09:00',
      morningEnd:   draft.morningEnd   || '13:00',
      eveningStart: draft.eveningStart || '16:00',
      eveningEnd:   draft.eveningEnd   || '20:00',
      slotDuration: draft.slotDuration || '30',
      weeklyOff:    draft.weeklyOff    || [],
      lateCheckinPenalty: draft.lateCheckinPenalty || '0',
    }])
    setDraft(EMPTY_DOCTOR)
    setAdding(false); setErr('')
  }

  function handleRemove(i) {
    const doctor = doctors[i]
    if (!window.confirm(`Remove Dr. ${doctor.name}?\n\nThis will delete all their settings including availability and slot overrides. This cannot be undone.`)) return
    onChange(doctors.filter((_, j) => j !== i))
    if (onRemoveDoctor) onRemoveDoctor(doctor.name)
  }

  function feeLabel(d) {
    if (!d.firstVisitFee && !d.repeatVisitFee) return null
    const parts = []
    if (d.firstVisitFee) parts.push(`New: ₹${d.firstVisitFee}`)
    if (d.repeatVisitFee) parts.push(`Repeat: ₹${d.repeatVisitFee}`)
    return parts.join(' · ')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {doctors.length === 0 && (
        <div style={{ textAlign: 'center', padding: '16px', color: 'var(--muted)', fontSize: 13 }}>
          No doctors added yet. Add doctors so patients can select them while booking.
        </div>
      )}

      {doctors.map((d, i) => (
        <div key={i} style={{ borderRadius: 12, border: '1.5px solid var(--border)', background: 'var(--surface)', overflow: 'hidden' }}>
          {/* Doctor header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: '1.5px solid var(--border)', background: '#fff' }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg,var(--teal),var(--teal-dark,#087A6B))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 16, fontWeight: 700, flexShrink: 0 }}>
              {d.name.charAt(d.name.lastIndexOf(' ') + 1)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)' }}>{d.name}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                {[d.degree, d.speciality].filter(Boolean).join(' · ')}
                {feeLabel(d) && <span style={{ marginLeft: 6, color: 'var(--teal)' }}>· {feeLabel(d)}</span>}
              </div>
            </div>
            <button type="button" onClick={() => handleRemove(i)} style={{ background: '#FEF2F2', border: 'none', borderRadius: 8, color: '#DC2626', fontSize: 11, fontWeight: 600, padding: '5px 10px', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', whiteSpace: 'nowrap' }}>
              ✕ Remove
            </button>
          </div>
          {/* Always-visible doctor detail */}
          <div style={{ padding: '16px', background: 'var(--bg)', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* ── Scheduling ── */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy)', marginBottom: 8 }}>🕐 Schedule & Sessions</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Slot Duration */}
                <div>
                  <span style={lStyle}>Slot Duration</span>
                  <select style={sStyle}
                    value={d.slotDuration || '30'}
                    onChange={e => { const updated = [...doctors]; updated[i] = { ...d, slotDuration: e.target.value }; onChange(updated) }}>
                    {[['5','5 min'],['10','10 min'],['15','15 min'],['20','20 min'],['30','30 min'],['60','60 min']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                {/* Morning session */}
                <div style={{ background: 'var(--surface)', borderRadius: 9, padding: '10px 12px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#D97706', marginBottom: 8 }}>🌅 Morning Session</div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <span style={lStyle}>Start</span>
                      <input type="time" style={sStyle} value={d.morningStart || '09:00'}
                        onChange={e => { const updated = [...doctors]; updated[i] = { ...d, morningStart: e.target.value }; onChange(updated) }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <span style={lStyle}>End</span>
                      <input type="time" style={sStyle} value={d.morningEnd || '13:00'}
                        onChange={e => { const updated = [...doctors]; updated[i] = { ...d, morningEnd: e.target.value }; onChange(updated) }} />
                    </div>
                  </div>
                </div>
                {/* Evening session */}
                <div style={{ background: 'var(--surface)', borderRadius: 9, padding: '10px 12px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#7C3AED', marginBottom: 8 }}>🌆 Evening Session</div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <span style={lStyle}>Start</span>
                      <input type="time" style={sStyle} value={d.eveningStart || '16:00'}
                        onChange={e => { const updated = [...doctors]; updated[i] = { ...d, eveningStart: e.target.value }; onChange(updated) }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <span style={lStyle}>End</span>
                      <input type="time" style={sStyle} value={d.eveningEnd || '20:00'}
                        onChange={e => { const updated = [...doctors]; updated[i] = { ...d, eveningEnd: e.target.value }; onChange(updated) }} />
                    </div>
                  </div>
                </div>
                {/* Late check-in penalty */}
                <div>
                  <span style={lStyle}>Late Check-in Queue Penalty</span>
                  <select style={sStyle}
                    value={d.lateCheckinPenalty || '0'}
                    onChange={e => { const updated = [...doctors]; updated[i] = { ...d, lateCheckinPenalty: e.target.value }; onChange(updated) }}>
                    <option value="0">No penalty — go next in line</option>
                    <option value="1">Wait 1 patient</option>
                    <option value="2">Wait 2 patients</option>
                    <option value="3">Wait 3 patients</option>
                    <option value="5">Wait 5 patients</option>
                  </select>
                </div>
                {/* Weekly Off */}
                <div>
                  <span style={lStyle}>Weekly Off</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((day, idx) => {
                      const isOff = (d.weeklyOff || []).includes(idx)
                      return (
                        <button key={day} type="button"
                          onClick={() => {
                            const curr = d.weeklyOff || []
                            const updated = [...doctors]; updated[i] = { ...d, weeklyOff: isOff ? curr.filter(x => x !== idx) : [...curr, idx] }; onChange(updated)
                          }}
                          style={{ padding: '5px 10px', borderRadius: 7, fontSize: 12, fontWeight: 600, fontFamily: 'DM Sans, sans-serif', cursor: 'pointer',
                            border: `1.5px solid ${isOff ? '#DC2626' : 'var(--border)'}`,
                            background: isOff ? '#FEF2F2' : 'var(--surface)', color: isOff ? '#DC2626' : 'var(--slate)' }}>
                          {day}
                        </button>
                      )
                    })}
                  </div>
                  {(d.weeklyOff || []).length > 0 && (
                    <div style={{ marginTop: 5, fontSize: 11, color: '#DC2626', fontWeight: 500 }}>
                      Off: {(d.weeklyOff || []).sort((a,b)=>a-b).map(x => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][x]).join(', ')}
                    </div>
                  )}
                </div>
              </div>
            </div>
            {/* Fees */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy)', marginBottom: 8 }}>💰 Consultation Fees</div>
              <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
                <div style={{ flex: 1 }}>
                  <span style={lStyle}>First Visit Fee (₹)</span>
                  <input style={sStyle} type="number" min="0"
                    value={d.firstVisitFee || ''}
                    onChange={e => { const updated = [...doctors]; updated[i] = { ...d, firstVisitFee: e.target.value }; onChange(updated) }}
                    placeholder="e.g. 500" />
                </div>
                <div style={{ flex: 1 }}>
                  <span style={lStyle}>Repeat Visit Fee (₹)</span>
                  <input style={sStyle} type="number" min="0"
                    value={d.repeatVisitFee || ''}
                    onChange={e => { const updated = [...doctors]; updated[i] = { ...d, repeatVisitFee: e.target.value }; onChange(updated) }}
                    placeholder="e.g. 300" />
                </div>
              </div>
              <div style={{ marginBottom: 8 }}>
                <span style={lStyle}>Reset to First Visit Fee after (months)</span>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  {[1, 2, 3, 6, 12].map(n => {
                    const sel = Number(d.feeResetMonths) === n
                    return (
                      <button key={n} type="button"
                        onClick={() => { const updated = [...doctors]; updated[i] = { ...d, feeResetMonths: sel ? '' : n }; onChange(updated) }}
                        style={{ padding: '5px 12px', borderRadius: 20, border: `1.5px solid ${sel ? 'var(--teal)' : 'var(--border)'}`, background: sel ? 'var(--teal-light)' : 'none', color: sel ? 'var(--teal)' : 'var(--slate)', fontSize: 12, fontWeight: sel ? 700 : 400, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                        {n === 1 ? '1 mo' : n === 12 ? '1 yr' : `${n} mo`}
                      </button>
                    )
                  })}
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                    {d.feeResetMonths ? `If last visit was more than ${d.feeResetMonths} month${d.feeResetMonths > 1 ? 's' : ''} ago, first visit fee applies again` : 'Not set — repeat fee always applies for returning patients'}
                  </span>
                </div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, lineHeight: 1.6 }}>
                Fee is auto-fetched when booking based on patient's visit history. Receptionist or doctor can override at time of booking.
              </div>
            </div>
            {/* Schedule notification time */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy)', marginBottom: 8 }}>📅 Daily Schedule Notification</div>
              <span style={lStyle}>Send tomorrow's schedule at</span>
              <select style={sStyle}
                value={d.scheduleNotifyTime || '21:00'}
                onChange={e => { const updated = [...doctors]; updated[i] = { ...d, scheduleNotifyTime: e.target.value }; onChange(updated) }}>
                {SCHEDULE_TIME_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6, lineHeight: 1.6 }}>
                {d.name} will receive tomorrow's appointment schedule on WhatsApp at {SCHEDULE_TIME_OPTIONS.find(o => o.value === (d.scheduleNotifyTime || '21:00'))?.label || '9:00 PM'}.
              </div>
            </div>
            {/* WhatsApp number */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy)', marginBottom: 8 }}>📱 WhatsApp Number</div>
              <input style={sStyle}
                value={d.phone || ''}
                onChange={e => { const updated = [...doctors]; updated[i] = { ...d, phone: e.target.value.replace(/\D/g,'').slice(0,10) }; onChange(updated) }}
                placeholder="10-digit mobile number" maxLength={10} />
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>Used to send daily schedule notifications to this doctor.</div>
            </div>
            {/* Availability — vacation dates + slot overrides */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy)', marginBottom: 8 }}>📆 Availability & Slot Overrides</div>
              <DoctorAvailability doctor={d} doctorIndex={i} doctors={doctors} onChange={onChange} onSaveDoctors={onSaveDoctors}
                centreId={centreId} bookingUrl={bookingUrl} campaigns={campaigns} aisynergyApiKey={aisynergyApiKey} centreName={centreName} />
            </div>
            {/* Save button per doctor */}
            <button type="button"
              onClick={() => onSaveDoctors && onSaveDoctors(doctors)}
              style={{ width: '100%', padding: '10px', borderRadius: 9, border: 'none', background: 'var(--teal)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
              💾 Save {d.name}
            </button>
          </div>
        </div>
      ))}

      {adding ? (
        <div style={{ border: '1.5px solid var(--teal)', borderRadius: 12, padding: 16, background: 'var(--teal-light)', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--teal)' }}>Add Doctor</div>
          <div>
            <span style={lStyle}>Full Name *</span>
            <input style={iStyle} value={draft.name} onChange={e => { setDraft(d => ({ ...d, name: e.target.value })); setErr('') }} placeholder="e.g. Dr. Amit Shah" autoFocus />
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <span style={lStyle}>Degree</span>
              <input style={iStyle} value={draft.degree} onChange={e => setDraft(d => ({ ...d, degree: e.target.value }))} placeholder="e.g. MBBS, MD" />
            </div>
            <div style={{ flex: 1 }}>
              <span style={lStyle}>Speciality</span>
              <input style={iStyle} value={draft.speciality} onChange={e => setDraft(d => ({ ...d, speciality: e.target.value }))} placeholder="e.g. General Physician" />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <span style={lStyle}>First Visit Fee (₹)</span>
              <input style={iStyle} type="number" min="0" value={draft.firstVisitFee} onChange={e => setDraft(d => ({ ...d, firstVisitFee: e.target.value }))} placeholder="e.g. 500" />
            </div>
            <div style={{ flex: 1 }}>
              <span style={lStyle}>Repeat Visit Fee (₹)</span>
              <input style={iStyle} type="number" min="0" value={draft.repeatVisitFee} onChange={e => setDraft(d => ({ ...d, repeatVisitFee: e.target.value }))} placeholder="e.g. 300" />
            </div>
          </div>
          <div>
            <span style={lStyle}>WhatsApp Number (for schedule notifications)</span>
            <input style={iStyle} value={draft.phone} onChange={e => setDraft(d => ({ ...d, phone: e.target.value.replace(/\D/g,'').slice(0,10) }))} placeholder="10-digit mobile number" maxLength={10} />
          </div>
          <div>
            <span style={lStyle}>Send daily schedule at</span>
            <select style={iStyle} value={draft.scheduleNotifyTime} onChange={e => setDraft(d => ({ ...d, scheduleNotifyTime: e.target.value }))}>
              {SCHEDULE_TIME_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, lineHeight: 1.5 }}>
              Doctor receives tomorrow's appointment list on WhatsApp at this time, including all bookings made before it.
            </div>
          </div>
          {err && <div style={{ fontSize: 12, color: '#DC2626' }}>{err}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={handleAdd} style={{ padding: '9px 20px', borderRadius: 9, border: 'none', background: 'var(--teal)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>✓ Add Doctor</button>
            <button type="button" onClick={() => { setAdding(false); setErr('') }} style={{ padding: '9px 16px', borderRadius: 9, border: '1.5px solid var(--border)', background: '#fff', color: 'var(--slate)', fontSize: 13, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>Cancel</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} style={{ padding: '10px 18px', borderRadius: 10, border: '1.5px dashed var(--teal)', background: 'none', color: 'var(--teal)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', width: '100%' }}>
          + Add Doctor
        </button>
      )}
    </div>
  )
}

// ── Clinic Links Box — Booking + Token Display ───────────────────────────────

function LinkCard({ title, icon, desc, link, openLabel, openIcon, accentColor = 'var(--teal)' }) {
  const [copied, setCopied] = useState(false)
  function copyLink() {
    if (!link) return
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    })
  }
  return (
    <div style={{
      flex: 1, background: 'var(--bg)', borderRadius: 14, padding: '18px 20px',
      border: `1.5px solid ${accentColor === 'var(--teal)' ? 'var(--border)' : 'var(--teal-light)'}`,
      display: 'flex', flexDirection: 'column', gap: 10
    }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', marginBottom: 3 }}>{icon} {title}</div>
        <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>{desc}</div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{
          flex: 1, padding: '8px 12px', borderRadius: 8,
          border: '1.5px solid var(--border)', background: '#fff',
          fontSize: 11, color: 'var(--navy)', fontFamily: 'monospace',
          wordBreak: 'break-all', lineHeight: 1.5, userSelect: 'all',
        }}>
          {link || 'Loading…'}
        </div>
        <button type="button" onClick={copyLink} style={{
          padding: '8px 14px', borderRadius: 8, border: 'none', flexShrink: 0,
          background: copied ? '#16A34A' : accentColor,
          color: 'white', fontSize: 12, fontWeight: 600,
          cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
          transition: 'background 0.2s', whiteSpace: 'nowrap',
        }}>
          {copied ? '✓ Copied!' : '📋 Copy'}
        </button>
      </div>
      <a href={link} target="_blank" rel="noopener noreferrer" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        padding: '9px 0', borderRadius: 8,
        border: `1.5px solid ${accentColor}`,
        background: accentColor === 'var(--teal)' ? 'var(--teal-light)' : 'rgba(11,158,138,0.06)',
        color: accentColor, fontSize: 12, fontWeight: 600,
        textDecoration: 'none', fontFamily: 'DM Sans, sans-serif',
      }}>
        {openIcon} {openLabel}
      </a>
    </div>
  )
}

function BookingLinkBox({ uid }) {
  const bookingLink = uid ? `https://mediflow.synergyconsultant.co.in/book/${uid}` : ''
  const displayLink = uid ? `https://mediflow.synergyconsultant.co.in/display/${uid}` : ''
  return (
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
      <LinkCard
        title="Patient Booking Link"
        icon="🔗"
        desc="Share with patients to book appointments online. Use in WhatsApp auto-reply or Google listing."
        link={bookingLink}
        openLabel="Open Booking Form"
        openIcon="↗"
        accentColor="var(--teal)"
      />
      <LinkCard
        title="Token Display URL"
        icon="📺"
        desc="Open on a TV or screen in your waiting area. Shows live token number — no patient details."
        link={displayLink}
        openLabel="Open Display Screen"
        openIcon="📺"
        accentColor="var(--teal)"
      />
    </div>
  )
}

// ── Main Settings component ───────────────────────────────────────────────────


// ── Activity Log Component ────────────────────────────────────────────────────
const ACTION_ICON = {
  appt_created:           '📅',
  appt_status_changed:    '🔄',
  appt_cancelled:         '❌',
  appt_deleted:           '🗑️',
  patient_edited:         '✏️',
  settings_saved:         '⚙️',
  prescription_created:   '💊',
  session_report_sent:    '📊',
  patient_list_downloaded:'📥',
}

function ActivityLog({ centreId }) {
  const [logs,    setLogs]    = useState([])
  const [loading, setLoading] = useState(false)
  const [loaded,  setLoaded]  = useState(false)

  async function load() {
    setLoading(true)
    try {
      const data = await getActivityLog(centreId, 200)
      setLogs(data)
    } catch(e) { console.error(e) }
    setLoading(false)
    setLoaded(true)
  }

  function formatTs(ts) {
    if (!ts?.toDate) return '—'
    const d = ts.toDate()
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
      + ' · ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
  }

  if (!loaded) return (
    <div style={{ textAlign: 'center', padding: 20 }}>
      <button onClick={load} disabled={loading} style={{ padding: '9px 24px', borderRadius: 10, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--teal)', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
        {loading ? 'Loading…' : '📋 Load Activity Log'}
      </button>
    </div>
  )

  if (logs.length === 0) return (
    <div style={{ textAlign: 'center', padding: '20px', color: 'var(--muted)', fontSize: 13 }}>No activity recorded yet.</div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {logs.map((log, i) => (
        <div key={log.id || i} style={{ display: 'flex', gap: 12, padding: '10px 2px', borderBottom: '1px solid var(--border)', alignItems: 'flex-start' }}>
          <div style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>{ACTION_ICON[log.action] || '📌'}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>{log.label}</div>
            {log.detail && <div style={{ fontSize: 12, color: 'var(--slate)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.detail}</div>}
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{formatTs(log.timestamp)}{log.by ? ' · ' + log.by : ''}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Patient Export Component ──────────────────────────────────────────────────
function PatientExport({ centreId, ownerEmail, centreName, user }) {
  const [sending, setSending] = useState(false)
  const [done,    setDone]    = useState(false)
  const [err,     setErr]     = useState('')

  async function handleExport() {
    setSending(true); setErr(''); setDone(false)
    try {
      const patients = await getAllPatients(centreId)
      // Build CSV
      const headers = ['Name','Phone','Age','Gender','DOB','Source','Last Visit']
      const rows = patients.map(p => [
        p.name || '',
        p.phone || '',   // unmasked in export
        p.age || '',
        p.gender || '',
        p.dob || '',
        p.source || '',
        p.lastClinicVisit || p.lastDiagnosticVisit || '',
      ])
      const csv = [headers, ...rows].map(r => r.map(v => '"' + String(v).replace(/"/g,'""') + '"').join(',')).join('\n')
      const blob = new Blob([csv], { type: 'text/csv' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `${centreName || 'patients'}_export_${new Date().toISOString().split('T')[0]}.csv`
      a.click()
      URL.revokeObjectURL(url)
      await logActivity(centreId, { action: 'patient_list_downloaded', label: 'Patient List Exported', detail: `${patients.length} patients · CSV downloaded`, by: user?.email || '' })
      setDone(true)
    } catch(e) {
      console.error(e)
      setErr('Export failed. Try again.')
    }
    setSending(false)
  }

  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--slate)', marginBottom: 12, lineHeight: 1.7 }}>
        Downloads a CSV file of all patients with name, phone, age, gender, DOB, source and last visit date.
        Phone numbers are <strong>unmasked</strong> in the export.
      </div>
      <button onClick={handleExport} disabled={sending} style={{ padding: '9px 20px', borderRadius: 10, border: 'none', background: sending ? 'var(--border)' : 'var(--teal)', color: sending ? 'var(--muted)' : 'white', fontWeight: 600, fontSize: 13, cursor: sending ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
        {sending ? 'Preparing…' : '📥 Download Patient List (CSV)'}
      </button>
      {done && <div style={{ marginTop: 8, fontSize: 12, color: '#065F46' }}>✓ Downloaded successfully</div>}
      {err  && <div style={{ marginTop: 8, fontSize: 12, color: '#DC2626' }}>{err}</div>}
    </div>
  )
}

// ── TAG_PRESET_COLORS — quick color swatches ─────────────────────────────────
const TAG_PRESET_COLORS = [
  '#F59E0B', '#EF4444', '#8B5CF6', '#3B82F6', '#EC4899',
  '#10B981', '#06B6D4', '#F97316', '#6366F1', '#14B8A6',
  '#84CC16', '#E11D48',
]

// ── Patient Tags Manager ──────────────────────────────────────────────────────
// Used in Settings > Clinic tab — owner and each doctor can manage their own tags
function PatientTagsManager({ centreId, tags, onChange, saving, onSave }) {
  const [newName,  setNewName]  = useState('')
  const [newColor, setNewColor] = useState(TAG_PRESET_COLORS[0])
  const [err, setErr]           = useState('')

  function handleAdd() {
    const name = newName.trim()
    if (!name)                                    { setErr('Enter a tag name'); return }
    if (name.length > 30)                         { setErr('Tag name too long (max 30 chars)'); return }
    if ((tags || []).some(t => t.name.toLowerCase() === name.toLowerCase()))
                                                  { setErr('Tag already exists'); return }
    onChange([...(tags || []), { name, color: newColor }])
    setNewName(''); setNewColor(TAG_PRESET_COLORS[0]); setErr('')
  }

  function handleDelete(name) {
    onChange((tags || []).filter(t => t.name !== name))
  }

  const iStyle = { padding: '9px 13px', borderRadius: 9, border: '1.5px solid var(--border)', fontSize: 13, fontFamily: 'DM Sans, sans-serif', background: '#fff', color: 'var(--navy)', outline: 'none', flex: 1 }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ background: '#F0F9FF', borderRadius: 10, padding: '12px 16px', fontSize: 12, color: '#0369A1', lineHeight: 1.8 }}>
        💡 Tags are used to segment your patients for targeted WhatsApp campaigns in Marketing → Campaigns. Each tag you create here becomes a filter option. Tags are added to patients automatically from prescriptions, or manually from the patient record.
      </div>

      {/* Existing tags */}
      {(tags || []).length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--muted)', padding: '10px 0' }}>No tags yet. Add your first tag below.</div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {(tags || []).map(t => (
            <div key={t.name} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 10px 5px 10px', borderRadius: 20,
              background: t.color + '20', border: `1.5px solid ${t.color}`,
              fontSize: 13, fontWeight: 600, color: t.color,
            }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: t.color, flexShrink: 0 }} />
              {t.name}
              <button type="button" onClick={() => handleDelete(t.name)} style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 0 2px',
                fontSize: 13, color: t.color, lineHeight: 1, opacity: 0.7, fontFamily: 'DM Sans, sans-serif'
              }}>✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Add new tag row */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 11, color: 'var(--slate)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>Add New Tag</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            value={newName}
            onChange={e => { setNewName(e.target.value); setErr('') }}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            placeholder="e.g. Diabetes, Post-op, VIP"
            maxLength={30}
            style={{ ...iStyle, maxWidth: 220 }}
          />
          {/* Color swatches */}
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {TAG_PRESET_COLORS.map(c => (
              <button key={c} type="button" onClick={() => setNewColor(c)} style={{
                width: 22, height: 22, borderRadius: '50%', background: c, border: `2.5px solid ${newColor === c ? 'var(--navy)' : 'transparent'}`,
                cursor: 'pointer', padding: 0, flexShrink: 0,
                boxShadow: newColor === c ? '0 0 0 1.5px white inset' : 'none',
                transition: 'border 0.15s',
              }} />
            ))}
          </div>
          <button type="button" onClick={handleAdd} style={{
            padding: '9px 16px', borderRadius: 9, border: 'none', background: 'var(--teal)',
            color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            fontFamily: 'DM Sans, sans-serif', whiteSpace: 'nowrap',
          }}>+ Add</button>
        </div>
        {err && <div style={{ fontSize: 12, color: '#DC2626' }}>{err}</div>}
      </div>

      <Btn type="button" onClick={onSave} disabled={saving} style={{ width: '100%', justifyContent: 'center' }}>
        {saving ? 'Saving…' : '💾 Save Tags'}
      </Btn>
    </div>
  )
}

export default function Settings() {
  const { user, profile, maxStaff } = useAuth()
  const [toast, setToast]   = useState(null)
  const [saving, setSaving] = useState(false)

  // Staff tab state
  const [staffList, setStaffList]       = useState([])
  const [staffLoading, setStaffLoading] = useState(false)
  const [newStaff, setNewStaff]         = useState({ name: '', email: '', password: '', role: 'receptionist' })
  const [staffSaving, setStaffSaving]   = useState(false)
  const [staffErr, setStaffErr]         = useState('')
  const [staffSuccess, setStaffSuccess] = useState('')

  const [form, setForm] = useState({
    centreName:        '',
    ownerName:         '',
    phone:             '',
    city:              '',
    address:           '',
    centreType:        'diagnostic',
    gst:               '0',
    gstNumber:         '',
    whatsappCampaigns: [],
    aisynergyApiKey: '',
    doctors: [],
    vaccinationReminderDays: '7,3,1',
    fallbackNotifyNumber: '',
    tokenSystem: 'fixed',
    customPatientTags: [],
    feeConfirmationRequired: true,
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
        whatsappCampaigns: profile.whatsappCampaigns || [],
        aisynergyApiKey:    profile.aisynergyApiKey    || '',
        doctors:             profile.doctors             || [],
        vaccinationReminderDays: profile.vaccinationReminderDays || '7,3,1',
        fallbackNotifyNumber: profile.fallbackNotifyNumber || '',
        tokenSystem: profile.tokenSystem || 'fixed',
        customPatientTags: profile.customPatientTags || [],
        feeConfirmationRequired: profile.feeConfirmationRequired !== false,
      }))
    }
  }, [profile])

  const setF = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  async function saveFields(fields) {
    setSaving(true)
    try {
      await setDoc(
        doc(db, 'centres', user.uid, 'profile', 'main'),
        { ...fields, updatedAt: serverTimestamp() },
        { merge: true }
      )
      setToast({ message: 'Saved successfully ✓', type: 'success' })
      logActivity(user.uid, { action: 'settings_saved', label: 'Settings Saved', detail: Object.keys(fields).join(', '), by: user?.email || '' })
    } catch (err) {
      console.error(err)
      setToast({ message: 'Failed to save. Try again.', type: 'error' })
    }
    setSaving(false)
  }

  function handleSaveCentreInfo()          { saveFields({ centreName: form.centreName, ownerName: form.ownerName, phone: form.phone, city: form.city, address: form.address }) }
  function handleSaveClinicSettings()      { saveFields({ fallbackNotifyNumber: form.fallbackNotifyNumber }) }
  function handleSaveBilling()             { saveFields({ gst: form.gst, gstNumber: form.gstNumber }) }
  function handleSaveVaccinationSettings() { saveFields({ vaccinationReminderDays: form.vaccinationReminderDays }) }
  function handleSaveDoctors()             { saveFields({ doctors: form.doctors }) }
  function handleSaveAppointmentSettings() { saveFields({ tokenSystem: form.tokenSystem }) }
  function handleSavePatientTags()         { saveFields({ customPatientTags: form.customPatientTags }) }
  function handleSaveFeeSettings()         { saveFields({ feeConfirmationRequired: form.feeConfirmationRequired }) }

  // ── Staff functions ──────────────────────────────────────────────────────
  async function loadStaffList() {
    if (!user?.uid) return
    setStaffLoading(true)
    try {
      const { collection, query, where, getDocs } = await import('firebase/firestore')
      const { db } = await import('../firebase/config')
      const snap = await getDocs(query(
        collection(db, 'staffUsers'),
        where('centreId', '==', user.uid)
      ))
      setStaffList(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch (e) { console.error(e) }
    setStaffLoading(false)
  }

  async function handleCreateStaff() {
    setStaffErr(''); setStaffSuccess('')
    const { name, email, password, role } = newStaff
    if (!name.trim() || !email.trim() || !password.trim())
      return setStaffErr('Please fill in name, email and password.')
    if (password.length < 6)
      return setStaffErr('Password must be at least 6 characters.')
    // Check staff limit — staffList includes existing staff (not the admin owner)
    // maxStaff = total accounts including admin, so max staff = maxStaff - 1
    const allowedStaff = (maxStaff || 1) - 1
    if (staffList.length >= allowedStaff) {
      return setStaffErr(
        allowedStaff === 0
          ? 'Your plan does not allow staff accounts. Please contact Synergy Consultant to upgrade.'
          : `Staff limit reached. Your plan allows ${allowedStaff} staff account${allowedStaff > 1 ? 's' : ''}. Contact Synergy Consultant to increase the limit.`
      )
    }
    setStaffSaving(true)
    try {
      const res = await fetch('/api/create-staff-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, role, centreId: user.uid })
      })
      const data = await res.json()
      if (!res.ok) { setStaffErr(data.error || 'Failed to create account.'); setStaffSaving(false); return }
      setStaffSuccess('Account created for ' + name + '.')
      setNewStaff({ name: '', email: '', password: '', role: 'receptionist' })
      await loadStaffList()
    } catch (e) { setStaffErr('Network error. Try again.') }
    setStaffSaving(false)
  }

  async function handleUpdatePermission(staffUid, key, value) {
    try {
      const { doc, updateDoc } = await import('firebase/firestore')
      const { db } = await import('../firebase/config')
      await updateDoc(doc(db, 'staffUsers', staffUid), { [`permissions.${key}`]: value })
      setStaffList(list => list.map(s => s.id === staffUid
        ? { ...s, permissions: { ...(s.permissions || {}), [key]: value } }
        : s
      ))
      setToast({ message: 'Permission updated', type: 'success' })
    } catch (e) {
      setToast({ message: 'Failed to update permission', type: 'error' })
    }
  }

  async function handleDeleteStaff(staffUid, staffName) {
    if (!window.confirm('Remove ' + staffName + ' access? They will no longer be able to log in.')) return
    try {
      const res = await fetch('/api/delete-staff-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffUid, centreId: user.uid })
      })
      if (res.ok) {
        setStaffList(s => s.filter(x => x.id !== staffUid))
        setToast({ message: staffName + ' removed.', type: 'success' })
      }
    } catch (e) { setToast({ message: 'Failed to remove. Try again.', type: 'error' }) }
  }

  // Legacy full-save kept for reference (not used in UI anymore)
  async function handleSave(e) {
    e?.preventDefault()
    saveFields(form)
  }

  const gstOpts = [
    { value: '0',  label: '0% GST' },
    { value: '5',  label: '5%' },
    { value: '12', label: '12%' },
    { value: '18', label: '18%' },
  ]

  const centreType = form.centreType || 'diagnostic'
  const isClinic = centreType === 'clinic' || centreType === 'both'
  const isDiag   = centreType === 'diagnostic' || centreType === 'both'

  // ── Tabs with drag-to-reorder, persisted per user ──
  // Store ALL keys always — visibility applied at render time, never at storage time
  const ALL_TAB_DEFS = [
    { key: 'general',  label: '🏥 General' },
    { key: 'clinic',   label: '🗓️ Clinic' },
    { key: 'whatsapp', label: '💬 WhatsApp' },
    { key: 'doctors',  label: '👨‍⚕️ Doctors' },
    { key: 'staff',    label: '👤 Staff' },
    { key: 'data',     label: '📋 Data & Logs' },
  ]
  const ALL_TAB_KEYS = ALL_TAB_DEFS.map(t => t.key)

  const STORAGE_KEY = user?.uid ? `mf_tab_order_${user.uid}` : null

  const getStoredOrder = (uid) => {
    try {
      const key = uid ? `mf_tab_order_${uid}` : null
      if (key) {
        const saved = localStorage.getItem(key)
        if (saved) {
          const parsed = JSON.parse(saved)
          const valid = parsed.filter(k => ALL_TAB_KEYS.includes(k))
          const added = ALL_TAB_KEYS.filter(k => !valid.includes(k))
          return [...valid, ...added]
        }
      }
    } catch(e) {}
    return [...ALL_TAB_KEYS]
  }

  const [tabOrder, setTabOrder] = useState(() => getStoredOrder(null))
  const [activeTab, setActiveTab] = useState('general')
  const [dragIdx, setDragIdx]   = useState(null)
  const [dragOver, setDragOver] = useState(null)

  // Re-sync when uid becomes available (null on first render)
  // Also clears stale stored orders that are missing keys (e.g. saved before clinic tabs existed)
  useEffect(() => {
    if (user?.uid) {
      const order = getStoredOrder(user.uid)
      // If stored order is missing any all-tab keys, it's stale — reset it
      const hasAll = ALL_TAB_KEYS.every(k => order.includes(k))
      if (!hasAll) {
        try { localStorage.removeItem(`mf_tab_order_${user.uid}`) } catch(e) {}
        setTabOrder([...ALL_TAB_KEYS])
      } else {
        setTabOrder(order)
      }
    }
  }, [user?.uid])

  // Persist whenever order changes (only after uid is known)
  useEffect(() => {
    if (STORAGE_KEY) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(tabOrder)) } catch(e) {}
    }
  }, [tabOrder, STORAGE_KEY])

  // Visibility filter applied here — clinic/doctors only shown for clinic type
  const tabs = tabOrder
    .map(k => ALL_TAB_DEFS.find(t => t.key === k))
    .filter(t => {
      if (!t) return false
      if (t.key === 'clinic' || t.key === 'doctors') return isClinic
      return true
    })

  function handleDragStart(e, idx) {
    setDragIdx(idx)
    e.dataTransfer.effectAllowed = 'move'
  }
  function handleDragOver(e, idx) {
    e.preventDefault()
    setDragOver(idx)
  }
  function handleDrop(e, idx) {
    e.preventDefault()
    if (dragIdx === null || dragIdx === idx) { setDragIdx(null); setDragOver(null); return }
    const newOrder = [...tabOrder]
    const [moved] = newOrder.splice(dragIdx, 1)
    newOrder.splice(idx, 0, moved)
    setTabOrder(newOrder)
    setDragIdx(null); setDragOver(null)
  }

  const tabStyle = (key, isDragging, isOver) => ({
    padding: '8px 14px', borderRadius: 8, border: isOver ? '2px dashed var(--teal)' : '2px solid transparent',
    cursor: 'grab', fontFamily: 'DM Sans, sans-serif', fontSize: 13, fontWeight: 600,
    background: activeTab === key ? 'var(--teal)' : isDragging ? 'var(--bg)' : 'transparent',
    color: activeTab === key ? '#fff' : 'var(--slate)',
    opacity: isDragging ? 0.4 : 1,
    transition: 'background 0.15s, opacity 0.15s', whiteSpace: 'nowrap',
    userSelect: 'none',
  })

  return (
    <Layout title="Settings">
      <div style={{ maxWidth: 700 }}>

        {/* Tab bar — draggable to reorder */}
        <div style={{ display: 'flex', gap: 4, overflowX: 'auto', padding: '2px 0 4px', WebkitOverflowScrolling: 'touch',
          borderBottom: '2px solid var(--border)', marginBottom: 24, alignItems: 'center' }}>
          {tabs.map((t, idx) => (
            <button
              key={t.key}
              type="button"
              draggable
              onDragStart={e => handleDragStart(e, idx)}
              onDragOver={e => handleDragOver(e, idx)}
              onDrop={e => handleDrop(e, idx)}
              onDragEnd={() => { setDragIdx(null); setDragOver(null) }}
              style={tabStyle(t.key, dragIdx === idx, dragOver === idx)}
              onClick={() => setActiveTab(t.key)}
            >{t.label}</button>
          ))}
          <div style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 'auto', whiteSpace: 'nowrap', paddingRight: 4, flexShrink: 0 }}>drag to reorder</div>
        </div>

        {/* ── GENERAL TAB ── */}
        {activeTab === 'general' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <Section title="Centre Information">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 11, color: 'var(--slate)', fontWeight: 500 }}>Centre Type</label>
                <div style={{ padding: '10px 14px', borderRadius: 10, border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: 13, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
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
              <Btn type="button" onClick={handleSaveCentreInfo} disabled={saving} style={{ width: '100%', justifyContent: 'center' }}>
                {saving ? 'Saving…' : '💾 Save Centre Info'}
              </Btn>
            </Section>

            {isDiag && (
              <Section title="Billing & GST">
                <Select label="Default GST Rate" value={form.gst} onChange={setF('gst')} options={gstOpts} />
                <Input label="GST Number" value={form.gstNumber} onChange={setF('gstNumber')} placeholder="22AAAAA0000A1Z5 (optional)" />
                <Btn type="button" onClick={handleSaveBilling} disabled={saving} style={{ width: '100%', justifyContent: 'center' }}>
                  {saving ? 'Saving…' : '💾 Save Billing Settings'}
                </Btn>
              </Section>
            )}

            {isClinic && (
              <Section title="🔗 Online Appointment Booking">
                <BookingLinkBox uid={user?.uid} />
              </Section>
            )}
          </div>
        )}

        {/* ── CLINIC TAB ── */}
        {activeTab === 'clinic' && isClinic && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <Section title="Appointment Settings">
              <div style={{ background: '#F0F9FF', borderRadius: 10, padding: '12px 16px', fontSize: 12, color: '#0369A1', lineHeight: 1.8 }}>
                💡 Slot duration, session timings, weekly off, and late check-in penalty are now configured <strong>per doctor</strong> in the Doctors tab. Each doctor can have their own independent schedule.
              </div>

              {/* ── Token Number System ── */}
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)', marginBottom: 4 }}>Token Number System</div>
                <div style={{ fontSize: 12, color: 'var(--slate)', marginBottom: 14, lineHeight: 1.7 }}>
                  Controls how token numbers are assigned to appointments.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    {
                      value: 'fixed',
                      label: 'Fixed Slot Tokens',
                      emoji: '🔢',
                      desc: 'Token is permanently tied to the slot time. If your session starts at 11:00 AM with 10-min slots — 11:00 AM = Token 1, 11:10 AM = Token 2, 11:20 AM = Token 3, always. Even if 11:30 is the only booked slot, it gets Token 4. Patients know their token number before arriving.',
                    },
                    {
                      value: 'relative',
                      label: 'Booking-Relative Tokens',
                      emoji: '📋',
                      desc: 'Token is assigned based on position among booked slots only. If only 11:30 is booked, it gets Token 1. When 11:10 is booked later, it becomes Token 1 and 11:30 becomes Token 2. Tokens are always compact with no gaps.',
                    },
                  ].map(opt => {
                    const selected = (form.tokenSystem || 'fixed') === opt.value
                    return (
                      <div
                        key={opt.value}
                        onClick={() => setForm(f => ({ ...f, tokenSystem: opt.value }))}
                        style={{
                          border: `2px solid ${selected ? 'var(--teal)' : 'var(--border)'}`,
                          borderRadius: 12,
                          padding: '14px 16px',
                          cursor: 'pointer',
                          background: selected ? 'var(--teal-light)' : 'var(--surface)',
                          transition: 'all 0.18s',
                          display: 'flex',
                          gap: 12,
                          alignItems: 'flex-start',
                        }}
                      >
                        <div style={{
                          width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                          background: selected ? 'var(--teal)' : 'var(--bg)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
                        }}>
                          {opt.emoji}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: selected ? 'var(--teal)' : 'var(--navy)' }}>{opt.label}</span>
                            {selected && <span style={{ fontSize: 10, fontWeight: 700, background: 'var(--teal)', color: '#fff', padding: '2px 8px', borderRadius: 20 }}>ACTIVE</span>}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--slate)', lineHeight: 1.7 }}>{opt.desc}</div>
                        </div>
                        <div style={{
                          width: 20, height: 20, borderRadius: '50%', flexShrink: 0, marginTop: 2,
                          border: `2px solid ${selected ? 'var(--teal)' : 'var(--border)'}`,
                          background: selected ? 'var(--teal)' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {selected && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff' }} />}
                        </div>
                      </div>
                    )
                  })}
                </div>
                <Btn type="button" onClick={handleSaveAppointmentSettings} disabled={saving} style={{ width: '100%', justifyContent: 'center', marginTop: 14 }}>
                  {saving ? 'Saving…' : '💾 Save Token Settings'}
                </Btn>
              </div>
            </Section>

            {/* ── Fee Confirmation ── */}
            <Section title="💰 Fee Collection Settings">
              <div style={{ background: '#F0F9FF', borderRadius: 10, padding: '12px 16px', fontSize: 12, color: '#0369A1', lineHeight: 1.8 }}>
                💡 Per-doctor fees (First Visit / Repeat Visit / Reset period) are set in the <strong>Doctors tab</strong>. Fee is auto-fetched based on the patient's visit history when booking.
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)', marginBottom: 4 }}>Fee Confirmation Requirement</div>
                <div style={{ fontSize: 12, color: 'var(--slate)', marginBottom: 12, lineHeight: 1.7 }}>
                  When enabled, the fee amount must be confirmed before an appointment can be marked as paid. When disabled, clicking "Paid" immediately marks it paid with the pre-set amount — no confirmation needed.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    { value: true,  label: 'Require confirmation', emoji: '✋', desc: 'Doctor / receptionist sees a fee modal with the amount — must confirm before marking paid. Recommended.' },
                    { value: false, label: 'Auto-mark paid',        emoji: '⚡', desc: 'Clicking Paid immediately saves without showing a modal. Use only if fees are always pre-filled correctly.' },
                  ].map(opt => {
                    const selected = form.feeConfirmationRequired === opt.value
                    return (
                      <div key={String(opt.value)} onClick={() => setForm(f => ({ ...f, feeConfirmationRequired: opt.value }))}
                        style={{ border: `2px solid ${selected ? 'var(--teal)' : 'var(--border)'}`, borderRadius: 12, padding: '12px 14px', cursor: 'pointer', background: selected ? 'var(--teal-light)' : 'var(--surface)', display: 'flex', gap: 12, alignItems: 'flex-start', transition: 'all 0.15s' }}>
                        <span style={{ fontSize: 20, flexShrink: 0, marginTop: 1 }}>{opt.emoji}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: selected ? 'var(--teal)' : 'var(--navy)' }}>{opt.label}</span>
                            {selected && <span style={{ fontSize: 10, fontWeight: 700, background: 'var(--teal)', color: '#fff', padding: '2px 8px', borderRadius: 20 }}>ACTIVE</span>}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--slate)', lineHeight: 1.6 }}>{opt.desc}</div>
                        </div>
                        <div style={{ width: 18, height: 18, borderRadius: '50%', flexShrink: 0, marginTop: 3, border: `2px solid ${selected ? 'var(--teal)' : 'var(--border)'}`, background: selected ? 'var(--teal)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {selected && <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#fff' }} />}
                        </div>
                      </div>
                    )
                  })}
                </div>
                <Btn type="button" onClick={handleSaveFeeSettings} disabled={saving} style={{ width: '100%', justifyContent: 'center', marginTop: 14 }}>
                  {saving ? 'Saving…' : '💾 Save Fee Settings'}
                </Btn>
              </div>
            </Section>

            {profile?.modules?.vaccination && (
              <Section title="💉 Vaccination Reminders">
                <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '12px 16px', fontSize: 12, color: 'var(--slate)', lineHeight: 1.8 }}>
                  Days before vaccine due date to send WhatsApp reminders. Requires <code>vaccine_reminder</code> campaign in WhatsApp tab.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {['7', '3', '1'].map(day => {
                    const days = (form.vaccinationReminderDays || '7,3,1').split(',').map(s => s.trim())
                    const checked = days.includes(day)
                    return (
                      <label key={day} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13, color: 'var(--navy)' }}>
                        <input type="checkbox" checked={checked} onChange={() => {
                          const current = (form.vaccinationReminderDays || '').split(',').map(s => s.trim()).filter(Boolean)
                          const updated = checked ? current.filter(d => d !== day) : [...current, day]
                          updated.sort((a,b) => Number(b) - Number(a))
                          setForm(f => ({ ...f, vaccinationReminderDays: updated.join(',') }))
                        }} style={{ width: 16, height: 16, accentColor: 'var(--teal)' }} />
                        {day === '7' ? '7 days before (1 week)' : day === '3' ? '3 days before' : '1 day before'}
                      </label>
                    )
                  })}
                </div>
                <Btn type="button" onClick={handleSaveVaccinationSettings} disabled={saving} style={{ width: '100%', justifyContent: 'center' }}>
                  {saving ? 'Saving…' : '💾 Save Reminder Settings'}
                </Btn>
              </Section>
            )}

            {/* ── Patient Tags ── */}
            <Section title="🏷️ Patient Tags">
              <PatientTagsManager
                centreId={user?.uid}
                tags={form.customPatientTags || []}
                onChange={tags => setForm(f => ({ ...f, customPatientTags: tags }))}
                saving={saving}
                onSave={handleSavePatientTags}
              />
            </Section>
          </div>
        )}

        {/* ── WHATSAPP TAB ── */}
        {activeTab === 'whatsapp' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <Section title="AiSynergy API">
              <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '12px 16px', fontSize: 12, color: 'var(--slate)', lineHeight: 1.8 }}>
                Your AiSynergy API key is used for all WhatsApp messages sent by MediFlow. Get it from AiSynergy → Settings → API Key.
              </div>
              <ApiKeyField value={form.aisynergyApiKey || ''} onChange={v => setForm(f => ({ ...f, aisynergyApiKey: v }))} />
            </Section>

            <Section title="Notification Numbers">
              <div>
                <label style={{ fontSize: 11, color: 'var(--slate)', fontWeight: 600, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                  Fallback WhatsApp Number
                </label>
                <input
                  value={form.fallbackNotifyNumber}
                  onChange={e => setForm(f => ({ ...f, fallbackNotifyNumber: e.target.value.replace(/\D/g,'').slice(0,12) }))}
                  placeholder="e.g. 919876543210"
                  style={{ width: '100%', padding: '9px 13px', borderRadius: 9, border: '1.5px solid var(--border)', fontSize: 13, fontFamily: 'DM Sans, sans-serif', boxSizing: 'border-box', background: '#fff', color: 'var(--navy)' }}
                />
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, lineHeight: 1.6 }}>
                  Receives booking notifications when no doctor-specific number is set. International format without + (e.g. 919876543210).
                </div>
              </div>
              <Btn type="button" onClick={() => saveFields({ aisynergyApiKey: form.aisynergyApiKey, fallbackNotifyNumber: form.fallbackNotifyNumber })} disabled={saving} style={{ width: '100%', justifyContent: 'center' }}>
                {saving ? 'Saving…' : '💾 Save WhatsApp Settings'}
              </Btn>
            </Section>

            <Section title="Campaigns">
              <div style={{ background: '#F0F9FF', borderRadius: 10, padding: '12px 16px', fontSize: 12, color: '#0369A1', lineHeight: 1.9 }}>
                <strong>Purpose codes:</strong><br />
                <code>bill_generated</code> · <code>report_ready</code> · <code>appt_confirm</code> · <code>followup</code> · <code>vaccine_given</code> · <code>vaccine_reminder</code> · <code>booking_alert</code> · <code>doctor_session_report</code> · <code>doctor_schedule</code>
              </div>

              {(form.whatsappCampaigns || []).length === 0 && (
                <div style={{ textAlign: 'center', padding: '20px', color: 'var(--muted)', fontSize: 13 }}>No campaigns yet. Add one below.</div>
              )}

              {(form.whatsappCampaigns || []).map((c, i) => {
                const parsed  = parseCurl(c.curl)
                const enabled = c.enabled !== false
                return (
                  <CampaignCard
                    key={i}
                    campaign={c}
                    parsed={parsed}
                    enabled={enabled}
                    centreName={form.centreName}
                    campaigns={form.whatsappCampaigns || []}
                    onToggleEnabled={async () => {
                      const updated = (form.whatsappCampaigns || []).map((x, j) => j === i ? { ...x, enabled: !enabled } : x)
                      setForm(f => ({ ...f, whatsappCampaigns: updated }))
                      try { await setDoc(doc(db, 'centres', user.uid, 'profile', 'main'), { whatsappCampaigns: updated }, { merge: true }) } catch(e) {}
                    }}
                    onDelete={async () => {
                      const updated = (form.whatsappCampaigns || []).filter((_, j) => j !== i)
                      setForm(f => ({ ...f, whatsappCampaigns: updated }))
                      try { await setDoc(doc(db, 'centres', user.uid, 'profile', 'main'), { whatsappCampaigns: updated }, { merge: true }) } catch(e) {}
                    }}
                    onSaveBody={async (body) => {
                      const updated = (form.whatsappCampaigns || []).map((x, j) => j === i ? { ...x, templateBody: body } : x)
                      setForm(f => ({ ...f, whatsappCampaigns: updated }))
                      try { await setDoc(doc(db, 'centres', user.uid, 'profile', 'main'), { whatsappCampaigns: updated }, { merge: true }) } catch(e) {}
                    }}
                  />
                )
              })}

              <CampaignAdder globalApiKey={form.aisynergyApiKey} onAdd={async newC => {
                const updated = [...(form.whatsappCampaigns || []), { ...newC, enabled: true }]
                setForm(f => ({ ...f, whatsappCampaigns: updated }))
                try {
                  await setDoc(doc(db, 'centres', user.uid, 'profile', 'main'), { whatsappCampaigns: updated }, { merge: true })
                  setToast({ message: 'Campaign saved ✓', type: 'success' })
                } catch(e) { console.error(e) }
              }} />
            </Section>
          </div>
        )}

        {/* ── DOCTORS TAB ── */}
        {activeTab === 'doctors' && isClinic && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <Section title="👨‍⚕️ Doctors">
              <DoctorsManager
                doctors={form.doctors || []}
                onChange={updated => setForm(f => ({ ...f, doctors: updated }))}
                onSaveDoctors={(latestDoctors) => saveFields({ doctors: latestDoctors ?? form.doctors })}
                onRemoveDoctor={(name) => {
                  const updated = (form.doctors || []).filter(d => d.name !== name)
                  saveFields({ doctors: updated })
                  logActivity(user.uid, { action: 'doctor_removed', label: 'Doctor Removed', detail: name, by: user?.email || '' })
                }}
                centreId={user?.uid}
                bookingUrl={`${window.location.origin}/book/${user?.uid}`}
                campaigns={form.whatsappCampaigns || []}
                aisynergyApiKey={form.aisynergyApiKey}
                centreName={form.centreName}
              />
            </Section>
          </div>
        )}

        {/* ── STAFF TAB ── */}
        {activeTab === 'staff' && (() => {
          if (!staffLoading && staffList.length === 0) loadStaffList()
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Staff limit info banner */}
              {(() => {
                const allowed = (maxStaff || 1) - 1
                const used = staffList.length
                const remaining = allowed - used
                return (
                  <div style={{
                    background: remaining <= 0 ? '#FEF6E7' : '#E6F7F5',
                    border: `1px solid ${remaining <= 0 ? '#F5A623' : '#0B9E8A'}`,
                    borderRadius: 10, padding: '12px 16px', fontSize: 13,
                    color: remaining <= 0 ? '#92400E' : '#0B6B5E',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                  }}>
                    <span>
                      {remaining <= 0
                        ? `⚠️ Staff limit reached — ${used}/${allowed} accounts used`
                        : `👤 Staff accounts: ${used} used of ${allowed} allowed`}
                    </span>
                    {remaining <= 0 && (
                      <span style={{ fontSize: 11, fontWeight: 600 }}>Contact Synergy Consultant to upgrade</span>
                    )}
                  </div>
                )
              })()}

              <Section title="Add Staff Account">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <Input label="Full Name" value={newStaff.name} onChange={v => setNewStaff(s => ({ ...s, name: v }))} placeholder="e.g. Priya Sharma" />
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: 11, color: 'var(--slate)', fontWeight: 500, display: 'block', marginBottom: 4 }}>Role</label>
                      <select value={newStaff.role} onChange={e => setNewStaff(s => ({ ...s, role: e.target.value }))}
                        style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid var(--border)', fontSize: 13, fontFamily: 'DM Sans, sans-serif', background: 'var(--surface)', color: 'var(--navy)', outline: 'none' }}>
                        <option value="receptionist">Receptionist</option>
                        <option value="doctor">Doctor</option>
                      </select>
                    </div>
                  </div>
                  <Input label="Login Email" value={newStaff.email} onChange={v => setNewStaff(s => ({ ...s, email: v }))} placeholder="staff@example.com" />
                  <Input label="Password" value={newStaff.password} onChange={v => setNewStaff(s => ({ ...s, password: v }))} placeholder="Min 6 characters" />
                  {staffErr && <div style={{ background: '#FEE2E2', border: '1px solid #FCA5A5', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#B91C1C' }}>{staffErr}</div>}
                  {staffSuccess && <div style={{ background: '#DCFCE7', border: '1px solid #86EFAC', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#166534' }}>{staffSuccess}</div>}
                  <Btn onClick={handleCreateStaff} disabled={staffSaving}>
                    {staffSaving ? 'Creating…' : '+ Create Account'}
                  </Btn>
                </div>
              </Section>

              <Section title="Current Staff">
                {staffLoading ? (
                  <div style={{ fontSize: 13, color: 'var(--muted)' }}>Loading…</div>
                ) : staffList.length === 0 ? (
                  <div style={{ fontSize: 13, color: 'var(--muted)' }}>No staff accounts created yet.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {staffList.map(s => (
                      <div key={s.id} style={{ borderRadius: 10, border: '1.5px solid var(--border)', background: 'var(--surface)', overflow: 'hidden' }}>
                        {/* Staff header */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
                          <div style={{ width: 36, height: 36, borderRadius: '50%', background: s.role === 'doctor' ? '#EFF6FF' : '#F0FDF4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                            {s.role === 'doctor' ? '👨‍⚕️' : '🧑‍💼'}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--navy)' }}>{s.name}</div>
                            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{s.email} · <span style={{ textTransform: 'capitalize' }}>{s.role}</span></div>
                          </div>
                          <button onClick={() => handleDeleteStaff(s.id, s.name)}
                            style={{ background: 'none', border: '1.5px solid #FCA5A5', borderRadius: 8, padding: '6px 12px', fontSize: 12, color: '#DC2626', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                            Remove
                          </button>
                        </div>
                        {/* Permissions — only for receptionists */}
                        {s.role === 'receptionist' && (
                          <div style={{ borderTop: '1px solid var(--border)', padding: '10px 16px', background: 'var(--bg)', display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Permissions:</span>
                            {[
                              { key: 'showMarketing', label: 'Marketing tab', default: true },
                              { key: 'showFollowups', label: 'Follow-ups tab', default: true },
                              { key: 'showPhone',     label: 'See full phone numbers', default: false },
                            ].map(perm => {
                              const isOn = perm.default
                                ? s.permissions?.[perm.key] !== false
                                : s.permissions?.[perm.key] === true
                              return (
                                <label key={perm.key} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: 'var(--slate)' }}>
                                  <div onClick={() => handleUpdatePermission(s.id, perm.key, !isOn)}
                                    style={{ width: 32, height: 18, borderRadius: 9, background: isOn ? 'var(--teal)' : 'var(--border)', position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0 }}>
                                    <div style={{ position: 'absolute', top: 2, left: isOn ? 16 : 2, width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
                                  </div>
                                  {perm.label}
                                </label>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Section>
            </div>
          )
        })()}

        {/* ── DATA TAB ── */}
        {activeTab === 'data' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <Section title="📋 Activity Log">
              <div style={{ fontSize: 12, color: 'var(--slate)', marginBottom: 12 }}>
                Tracks all key actions — appointments, settings changes, prescriptions, and exports.
              </div>
              <ActivityLog centreId={user?.uid} />
            </Section>
            <Section title="📥 Patient Data Export">
              <PatientExport centreId={user?.uid} ownerEmail={form.phone} centreName={form.centreName} user={user} />
            </Section>
          </div>
        )}

      </div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </Layout>
  )
}
