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

const EMPTY_DOCTOR = { name: '', degree: '', speciality: '', phone: '', firstVisitFee: '', repeatVisitFee: '', scheduleNotifyTime: '21:00' }

function DoctorsManager({ doctors, onChange }) {
  const [adding, setAdding]   = useState(false)
  const [draft, setDraft]     = useState(EMPTY_DOCTOR)
  const [expanded, setExpanded] = useState(null) // index of expanded doctor card
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
    }])
    setDraft(EMPTY_DOCTOR)
    setAdding(false); setErr('')
  }

  function handleRemove(i) {
    onChange(doctors.filter((_, j) => j !== i))
    if (expanded === i) setExpanded(null)
  }

  function feeLabel(d) {
    if (!d.firstVisitFee && !d.repeatVisitFee) return null
    const parts = []
    if (d.firstVisitFee) parts.push(`New: ₹${d.firstVisitFee}`)
    if (d.repeatVisitFee) parts.push(`Repeat: ₹${d.repeatVisitFee}`)
    return parts.join(' · ')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {doctors.length === 0 && (
        <div style={{ textAlign: 'center', padding: '16px', color: 'var(--muted)', fontSize: 13 }}>
          No doctors added yet. Add doctors so patients can select them while booking.
        </div>
      )}

      {doctors.map((d, i) => (
        <div key={i} style={{ borderRadius: 10, border: '1.5px solid var(--border)', background: 'var(--surface)', overflow: 'hidden' }}>
          {/* Doctor row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px' }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: 'linear-gradient(135deg,var(--teal),var(--teal-dark,#087A6B))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 15, fontWeight: 700, flexShrink: 0 }}>
              {d.name.charAt(d.name.lastIndexOf(' ') + 1)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)' }}>{d.name}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                {[d.degree, d.speciality].filter(Boolean).join(' · ')}
                {feeLabel(d) && <span style={{ marginLeft: 6, color: 'var(--teal)' }}>· {feeLabel(d)}</span>}
              </div>
            </div>
            <button type="button" onClick={() => setExpanded(expanded === i ? null : i)} style={{ background: 'var(--bg)', border: '1.5px solid var(--border)', borderRadius: 8, color: 'var(--slate)', fontSize: 11, fontWeight: 600, padding: '5px 10px', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', whiteSpace: 'nowrap' }}>
              {expanded === i ? '▲ Less' : '▼ Edit'}
            </button>
            <button type="button" onClick={() => handleRemove(i)} style={{ background: '#FEF2F2', border: 'none', borderRadius: 8, color: '#DC2626', fontSize: 11, fontWeight: 600, padding: '5px 10px', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', whiteSpace: 'nowrap' }}>
              ✕
            </button>
          </div>
          {/* Expanded doctor detail */}
          {expanded === i && (
            <div style={{ borderTop: '1.5px solid var(--border)', padding: '14px 16px', background: 'var(--bg)', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Fees */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy)', marginBottom: 8 }}>💰 Consultation Fees</div>
                <div style={{ display: 'flex', gap: 12 }}>
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
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6, lineHeight: 1.6 }}>
                  These fees are shown as defaults when booking an appointment for this doctor. Receptionist can override at time of booking or mark as Free.
                </div>
              </div>
              {/* Schedule notification time */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy)', marginBottom: 8 }}>📅 Daily Schedule Notification</div>
                <div>
                  <span style={lStyle}>Send tomorrow's schedule at</span>
                  <select style={sStyle}
                    value={d.scheduleNotifyTime || '21:00'}
                    onChange={e => { const updated = [...doctors]; updated[i] = { ...d, scheduleNotifyTime: e.target.value }; onChange(updated) }}>
                    {SCHEDULE_TIME_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6, lineHeight: 1.6 }}>
                    {d.name} will receive tomorrow's appointment schedule on WhatsApp at {SCHEDULE_TIME_OPTIONS.find(o => o.value === (d.scheduleNotifyTime || '21:00'))?.label || '9:00 PM'}.
                    This includes all appointments booked before {SCHEDULE_TIME_OPTIONS.find(o => o.value === (d.scheduleNotifyTime || '21:00'))?.label || '9:00 PM'}.
                  </div>
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
            </div>
          )}
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
    whatsappCampaigns: [],
    aisynergyApiKey: '',
    lateCheckinPenalty: '0',
    weeklyOff: [],
    doctors: [],
    morningStart: '09:00',
    morningEnd:   '13:00',
    eveningStart: '16:00',
    eveningEnd:   '20:00',
    vaccinationReminderDays: '7,3,1',
    fallbackNotifyNumber: '',
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
        whatsappCampaigns: profile.whatsappCampaigns || [],
        aisynergyApiKey:    profile.aisynergyApiKey    || '',
        lateCheckinPenalty: profile.lateCheckinPenalty || '0',
        weeklyOff:           profile.weeklyOff          || [],
        doctors:             profile.doctors             || [],
        morningStart: profile.morningStart || '09:00',
        morningEnd:   profile.morningEnd   || '13:00',
        eveningStart: profile.eveningStart || '16:00',
        eveningEnd:   profile.eveningEnd   || '20:00',
        vaccinationReminderDays: profile.vaccinationReminderDays || '7,3,1',
        fallbackNotifyNumber: profile.fallbackNotifyNumber || '',
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
    } catch (err) {
      console.error(err)
      setToast({ message: 'Failed to save. Try again.', type: 'error' })
    }
    setSaving(false)
  }

  function handleSaveCentreInfo()          { saveFields({ centreName: form.centreName, ownerName: form.ownerName, phone: form.phone, city: form.city, address: form.address }) }
  function handleSaveClinicSettings()      { saveFields({ slotDuration: form.slotDuration, lateCheckinPenalty: form.lateCheckinPenalty, weeklyOff: form.weeklyOff, morningStart: form.morningStart, morningEnd: form.morningEnd, eveningStart: form.eveningStart, eveningEnd: form.eveningEnd, fallbackNotifyNumber: form.fallbackNotifyNumber }) }
  function handleSaveBilling()             { saveFields({ gst: form.gst, gstNumber: form.gstNumber }) }
  function handleSaveVaccinationSettings() { saveFields({ vaccinationReminderDays: form.vaccinationReminderDays }) }
  function handleSaveDoctors()             { saveFields({ doctors: form.doctors }) }

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

  return (
    <Layout title="Settings">
      <div style={{ maxWidth: 680 }}>

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
          <Btn type="button" onClick={handleSaveCentreInfo} disabled={saving} style={{ width: '100%', justifyContent: 'center' }}>
            {saving ? 'Saving…' : '💾 Save Centre Info'}
          </Btn>
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
            {/* Morning / Evening session split */}
            <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy)' }}>🌅 Morning Session</div>
              <div style={{ display: 'flex', gap: 12 }}>
                <Input label="Morning Start" type="time" value={form.morningStart} onChange={setF('morningStart')} />
                <Input label="Morning End"   type="time" value={form.morningEnd}   onChange={setF('morningEnd')} />
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy)', marginTop: 4 }}>🌆 Evening Session</div>
              <div style={{ display: 'flex', gap: 12 }}>
                <Input label="Evening Start" type="time" value={form.eveningStart} onChange={setF('eveningStart')} />
                <Input label="Evening End"   type="time" value={form.eveningEnd}   onChange={setF('eveningEnd')} />
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.6 }}>
                These timings are shown on the public appointment booking form. Slots between morning end and evening start will not be available for online booking.
              </div>
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

            {/* Weekly Off */}
            <div>
              <label style={{ fontSize: 11, color: 'var(--slate)', fontWeight: 600, display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                Weekly Off Days
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, idx) => {
                  const isOff = (form.weeklyOff || []).includes(idx)
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => {
                        const current = form.weeklyOff || []
                        const updated = isOff ? current.filter(d => d !== idx) : [...current, idx]
                        setForm(f => ({ ...f, weeklyOff: updated }))
                      }}
                      style={{
                        padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                        fontFamily: 'DM Sans, sans-serif', cursor: 'pointer',
                        border: `1.5px solid ${isOff ? 'var(--red, #DC2626)' : 'var(--border)'}`,
                        background: isOff ? '#FEF2F2' : 'var(--surface)',
                        color: isOff ? '#DC2626' : 'var(--slate)',
                        transition: 'all 0.15s',
                      }}
                    >
                      {day}
                    </button>
                  )
                })}
              </div>
              {(form.weeklyOff || []).length > 0 ? (
                <div style={{ marginTop: 8, fontSize: 12, color: '#DC2626', fontWeight: 500 }}>
                  🚫 Closed on: {(form.weeklyOff || []).sort((a,b)=>a-b).map(d => ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][d]).join(', ')} — no appointments can be booked on these days
                </div>
              ) : (
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--muted)' }}>
                  No weekly off set — clinic is open all 7 days
                </div>
              )}
            </div>
            {/* Fallback WhatsApp Number */}
            <div>
              <label style={{ fontSize: 11, color: 'var(--slate)', fontWeight: 600, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                Fallback WhatsApp Notification Number
              </label>
              <input
                value={form.fallbackNotifyNumber}
                onChange={e => setForm(f => ({ ...f, fallbackNotifyNumber: e.target.value.replace(/\D/g,'').slice(0,12) }))}
                placeholder="e.g. 919876543210"
                style={{ width: '100%', padding: '9px 13px', borderRadius: 9, border: '1.5px solid var(--border)', fontSize: 13, fontFamily: 'DM Sans, sans-serif', boxSizing: 'border-box', background: '#fff', color: 'var(--navy)' }}
              />
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, lineHeight: 1.6 }}>
                This number receives a WhatsApp notification whenever a patient books an appointment online and no doctor-specific number is available.
                Enter in international format without + (e.g. 919876543210 for India).
              </div>
            </div>
            <Btn type="button" onClick={handleSaveClinicSettings} disabled={saving} style={{ width: '100%', justifyContent: 'center' }}>
              {saving ? 'Saving…' : '💾 Save Clinic Settings'}
            </Btn>
          </Section>
        )}

        {(centreType === 'clinic' || centreType === 'both') && (
          <Section title="👨‍⚕️ Doctors">
            <DoctorsManager
              doctors={form.doctors || []}
              onChange={updated => setForm(f => ({ ...f, doctors: updated }))}
            />
            <Btn type="button" onClick={handleSaveDoctors} disabled={saving} style={{ width: '100%', justifyContent: 'center' }}>
              {saving ? 'Saving…' : '💾 Save Doctors'}
            </Btn>
          </Section>
        )}

        {(centreType === 'clinic' || centreType === 'both') && (
          <Section title="🔗 Online Appointment Booking">
            <BookingLinkBox uid={user?.uid} />
          </Section>
        )}

        {(centreType === 'diagnostic' || centreType === 'both') && (
          <Section title="Billing & GST">
            <Select label="Default GST Rate" value={form.gst} onChange={setF('gst')} options={gstOpts} />
            <Input label="GST Number" value={form.gstNumber} onChange={setF('gstNumber')} placeholder="22AAAAA0000A1Z5 (optional)" />
            <Btn type="button" onClick={handleSaveBilling} disabled={saving} style={{ width: '100%', justifyContent: 'center' }}>
              {saving ? 'Saving…' : '💾 Save Billing Settings'}
            </Btn>
          </Section>
        )}

        <Section title="WhatsApp Campaigns">
          <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '12px 16px', fontSize: 12, color: 'var(--slate)', lineHeight: 1.8 }}>
            Add one entry per approved AiSynergy campaign. Paste the full cURL from AiSynergy → Campaigns → your campaign → API.
            MediFlow reads the API key and campaign settings directly from the cURL — no manual configuration needed.
          </div>

          {/* Global API Key — masked */}
          <ApiKeyField value={form.aisynergyApiKey || ''} onChange={v => setForm(f => ({ ...f, aisynergyApiKey: v }))} />

          <div style={{ background: '#F0F9FF', borderRadius: 10, padding: '12px 16px', fontSize: 12, color: '#0369A1', lineHeight: 1.9 }}>
            <strong>Purpose codes:</strong><br />
            <code>bill_generated</code> — sent when a patient bill is created<br />
            <code>report_ready</code> — sent when report is marked ready<br />
            <code>appt_confirm</code> — sent when appointment is booked (clinic)<br />
            <code>followup</code> — sent for follow-up reminders (clinic)<br />
            <code>vaccine_given</code> — sent when a vaccine is marked as given (params: childName, vaccineName, givenDate, nextVaccineInfo, centreName)
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
                    <button type="button" onClick={async () => {
                      const updated = (form.whatsappCampaigns || []).map((x, j) =>
                        j === i ? { ...x, enabled: !enabled } : x
                      )
                      setForm(f => ({ ...f, whatsappCampaigns: updated }))
                      try { await setDoc(doc(db, 'centres', user.uid, 'profile', 'main'), { whatsappCampaigns: updated }, { merge: true }) } catch(e) {}
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
                    <button type="button" onClick={async () => {
                      const updated = (form.whatsappCampaigns || []).filter((_, j) => j !== i)
                      setForm(f => ({ ...f, whatsappCampaigns: updated }))
                      try { await setDoc(doc(db, 'centres', user.uid, 'profile', 'main'), { whatsappCampaigns: updated }, { merge: true }) } catch(e) {}
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

          <CampaignAdder globalApiKey={form.aisynergyApiKey} onAdd={async newC => {
            const updated = [...(form.whatsappCampaigns || []), { ...newC, enabled: true }]
            setForm(f => ({ ...f, whatsappCampaigns: updated }))
            // Save immediately to Firestore so it persists without clicking Save Settings
            try {
              await setDoc(doc(db, 'centres', user.uid, 'profile', 'main'), { whatsappCampaigns: updated }, { merge: true })
              setToast({ message: 'Campaign saved ✓', type: 'success' })
            } catch(e) { console.error('Campaign save failed:', e) }
          }} />
        </Section>

        {(centreType === 'clinic' || centreType === 'both') && profile?.modules?.vaccination && (
          <Section title="💉 Vaccination Reminder Settings">
            <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '12px 16px', fontSize: 12, color: 'var(--slate)', lineHeight: 1.8 }}>
              Set how many days before a vaccine is due to send WhatsApp reminders to parents.
              Requires a campaign with purpose <code>vaccine_reminder</code> in WhatsApp Campaigns above.
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--slate)', display: 'block', marginBottom: 6 }}>
                Send reminders (days before due date)
              </label>
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
              <div style={{ marginTop: 10, fontSize: 11, color: 'var(--muted)' }}>
                Currently set: {form.vaccinationReminderDays || 'none'} days before due date
              </div>
            </div>
            <Btn type="button" onClick={handleSaveVaccinationSettings} disabled={saving} style={{ width: '100%', justifyContent: 'center' }}>
              {saving ? 'Saving…' : '💾 Save Reminder Settings'}
            </Btn>
          </Section>
        )}
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </Layout>
  )
}
