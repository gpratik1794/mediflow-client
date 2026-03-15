// src/pages/clinic/ClinicPatients.jsx
import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../utils/AuthContext'
import Layout from '../../components/Layout'
import { Card, CardHeader, Btn, Empty } from '../../components/UI'
import { collection, query, orderBy, getDocs } from 'firebase/firestore'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { parseCurl } from '../../firebase/whatsapp'
import { saveBroadcastHistory, getBroadcastHistory } from '../../firebase/clinicDb'

// ── Fallback hardcoded tags ────────────────────────────────────────────────────
const FALLBACK_TAG_LABELS = { diabetes:'Diabetes', hypert:'Hypertension', thyroid:'Thyroid', asthma:'Asthma', cardiac:'Cardiac', ortho:'Ortho', peds:'Paeds', obesity:'Obesity' }
const FALLBACK_TAG_COLORS = { diabetes:'#F59E0B', hypert:'#EF4444', thyroid:'#8B5CF6', asthma:'#3B82F6', cardiac:'#EC4899', ortho:'#10B981', peds:'#06B6D4', obesity:'#F97316' }

// ── Constants copied from Settings (needed for inline CampaignAdder) ───────────
const PURPOSE_OPTIONS = [
  { value: 'bill_generated',   label: 'bill_generated — Bill created (diagnostic)' },
  { value: 'report_ready',     label: 'report_ready — Report ready (diagnostic)' },
  { value: 'appt_confirm',     label: 'appt_confirm — Appointment booked (clinic)' },
  { value: 'followup',         label: 'followup — Follow-up reminder (clinic)' },
  { value: 'vaccine_given',    label: 'vaccine_given — Vaccine given confirmation' },
  { value: 'vaccine_reminder', label: 'vaccine_reminder — Upcoming vaccine reminder' },
  { value: 'custom',           label: 'custom — Other / custom use' },
]
const VARIABLES_BY_PURPOSE = {
  appt_confirm:     ['patientName','apptDate','apptTime','doctorName','centreName'],
  followup:         ['patientName','apptDate','apptTime','doctorName','centreName'],
  bill_generated:   ['patientName','billAmount','visitDate','centreName'],
  report_ready:     ['patientName','visitDate','centreName'],
  vaccine_given:    ['childName','vaccineName','givenDate','nextVaccineInfo','centreName','parentName'],
  vaccine_reminder: ['childName','nextVaccineName','nextVaccineDate','centreName','parentName'],
  custom:           ['patientName','apptDate','apptTime','doctorName','centreName','billAmount','visitDate','childName','vaccineName','parentName','customParam1','customParam2'],
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function maskPhone(phone) {
  if (!phone) return ''
  const p = String(phone).replace(/[^0-9]/g,'')
  if (p.length < 6) return '••••••'
  return p.slice(0, 2) + '••••••' + p.slice(-2)
}

function renderTemplateBody(body, params) {
  if (!body) return null
  let text = body
  ;(params || []).forEach((val, i) => {
    text = text.replace(new RegExp(`\\{\\{${i + 1}\\}\\}`, 'g'), val || `{{${i + 1}}}`)
  })
  return text
}

function WABubble({ body, params }) {
  const rendered = renderTemplateBody(body, params)
  if (!rendered) return null
  return (
    <div style={{ background: '#E9FBE5', borderRadius: '12px 12px 12px 2px', padding: '10px 14px', fontSize: 13, color: '#111', lineHeight: 1.65, whiteSpace: 'pre-wrap', maxWidth: '100%', wordBreak: 'break-word', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
      {rendered}
      <div style={{ fontSize: 10, color: '#8FA3AE', textAlign: 'right', marginTop: 4 }}>
        {new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} ✓✓
      </div>
    </div>
  )
}

function formatSentAt(sentAt) {
  if (!sentAt) return '—'
  try {
    const d = sentAt.toDate ? sentAt.toDate() : new Date(sentAt)
    return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch { return '—' }
}

// ── Inline Campaign Adder (self-contained, same logic as Settings CampaignAdder) ─
function InlineCampaignAdder({ globalApiKey, onAdd, onCancel }) {
  const [tab, setTab]           = useState('name')
  const [purpose, setPurpose]   = useState('custom')
  const [tplName, setTplName]   = useState('')
  const [paramCount, setParamCount] = useState('')
  const [paramMap, setParamMap] = useState([])
  const [step, setStep]         = useState(1)
  const [curl, setCurl]         = useState('')
  const [curlPreview, setCurlPreview] = useState(null)
  const [curlParamMap, setCurlParamMap] = useState([])
  const [curlStep, setCurlStep] = useState(1)
  const [err, setErr]           = useState('')

  const variables = VARIABLES_BY_PURPOSE[purpose] || VARIABLES_BY_PURPOSE.custom

  function initParamMap(count, vars) {
    return Array.from({ length: count }, (_, i) => ({ slot: i + 1, variable: vars[i] || '' }))
  }

  function handleCurlChange(v) {
    setCurl(v); setErr(''); setCurlStep(1)
    if (v.length > 20) {
      const parsed = parseCurl(v)
      setCurlPreview(parsed)
      if (parsed?.paramCount) setCurlParamMap(initParamMap(parsed.paramCount, variables))
    } else { setCurlPreview(null) }
  }

  function buildCurl(apiKey, name, count) {
    const dummyParams = Array.from({ length: count }, (_, i) => `param${i+1}`)
    return `curl -X POST -H "Content-Type: application/json" -d '{"apiKey":"${apiKey}","campaignName":"${name}","destination":"919999999999","userName":"AISYNERGY","templateParams":${JSON.stringify(dummyParams)},"source":"mediflow","media":{},"attributes":{},"paramsFallbackValue":{"FirstName":"user"}}' https://backend.api-wa.co/campaign/aisynergy/api/v2`
  }

  function handleNext() {
    if (tab === 'name') {
      if (!tplName.trim())        { setErr('Enter template name'); return }
      if (!globalApiKey?.trim())  { setErr('No API key saved — go to Settings → WhatsApp first'); return }
      const count = Number(paramCount)
      if (!count || count < 1)    { setErr('Enter param count'); return }
      setParamMap(initParamMap(count, variables))
      setStep(2); setErr('')
    } else {
      if (!curlPreview) { setErr('Paste a valid cURL first'); return }
      setCurlStep(2); setErr('')
    }
  }

  function handleSave() {
    const isName    = tab === 'name'
    const map       = isName ? paramMap : curlParamMap
    const finalCurl = isName ? buildCurl(globalApiKey.trim(), tplName.trim(), paramMap.length) : curl.trim()
    const finalName = isName ? tplName.trim() : (curlPreview?.campaignName || tplName)
    if (!finalCurl) { setErr('Missing cURL'); return }
    const parsed = parseCurl(finalCurl)
    if (!parsed?.apiKey) { setErr('Could not parse cURL — check and try again'); return }
    const orderedVars = map.map(m => m.variable || '')
    onAdd({ name: finalName, purpose, curl: finalCurl, paramMapping: orderedVars })
  }

  const currentStep = tab === 'name' ? step : curlStep
  const currentMap  = tab === 'name' ? paramMap : curlParamMap
  const setCurrentMap = tab === 'name' ? setParamMap : setCurlParamMap

  const iStyle = { width: '100%', padding: '8px 11px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 12, fontFamily: 'DM Sans, sans-serif', boxSizing: 'border-box', background: '#fff', color: 'var(--navy)', outline: 'none' }
  const lStyle = { fontSize: 10, color: 'var(--slate)', fontWeight: 600, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4 }

  return (
    <div style={{ border: '1.5px solid var(--teal)', borderRadius: 12, padding: 16, background: 'var(--teal-light)', display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--teal)' }}>Add New Campaign</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {['Step 1: Setup', 'Step 2: Map Params'].map((label, i) => (
            <div key={i} style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: currentStep === i+1 ? 'var(--teal)' : 'white', color: currentStep === i+1 ? 'white' : 'var(--muted)', border: '1px solid var(--border)' }}>{label}</div>
          ))}
        </div>
      </div>

      {currentStep === 1 && (<>
        <div>
          <label style={lStyle}>Purpose</label>
          <select value={purpose} onChange={e => { setPurpose(e.target.value); setErr('') }} style={iStyle}>
            {PURPOSE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', border: '1.5px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          {['name', 'curl'].map(k => (
            <button key={k} type="button" onClick={() => { setTab(k); setErr('') }} style={{
              flex: 1, padding: '8px 0', border: 'none', cursor: 'pointer',
              fontFamily: 'DM Sans, sans-serif', fontSize: 12, fontWeight: 600,
              background: tab === k ? 'var(--teal)' : '#fff',
              color: tab === k ? '#fff' : 'var(--muted)',
            }}>{k === 'name' ? '🔍 Template Name' : '📋 Paste cURL'}</button>
          ))}
        </div>

        {tab === 'name' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {!globalApiKey && <div style={{ background: '#FFF7ED', borderRadius: 7, padding: '7px 10px', fontSize: 11, color: '#C2410C' }}>⚠ Save your API Key in Settings → WhatsApp first.</div>}
            <div>
              <label style={lStyle}>Template / Campaign Name</label>
              <input value={tplName} onChange={e => { setTplName(e.target.value); setErr('') }} placeholder="e.g. marketing_diabetes_camp" style={iStyle} />
            </div>
            <div>
              <label style={lStyle}>Number of params</label>
              <input type="number" min="1" max="10" value={paramCount} onChange={e => { setParamCount(e.target.value); setErr('') }} placeholder="e.g. 3" style={{ ...iStyle, width: 90 }} />
            </div>
          </div>
        )}

        {tab === 'curl' && (
          <div>
            <label style={lStyle}>Paste full cURL from AiSynergy</label>
            <textarea value={curl} onChange={e => handleCurlChange(e.target.value)}
              placeholder={`curl -X POST ... https://backend.api-wa.co/campaign/aisynergy/api/v2`}
              style={{ ...iStyle, minHeight: 80, fontFamily: 'monospace', fontSize: 10, resize: 'vertical', lineHeight: 1.5 }} />
            {curlPreview && (
              <div style={{ background: '#E6F7F5', borderRadius: 7, padding: '6px 10px', fontSize: 11, color: '#0B9E8A', marginTop: 6 }}>
                ✅ {curlPreview.campaignName} · {curlPreview.paramCount} params
              </div>
            )}
          </div>
        )}

        {err && <div style={{ background: '#FEF2F2', borderRadius: 7, padding: '6px 10px', fontSize: 11, color: '#C0392B' }}>{err}</div>}

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={handleNext} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--teal)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>Next →</button>
          <button type="button" onClick={onCancel} style={{ padding: '8px 12px', borderRadius: 8, border: '1.5px solid var(--border)', background: '#fff', color: 'var(--slate)', fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>Cancel</button>
        </div>
      </>)}

      {currentStep === 2 && (<>
        <div style={{ fontSize: 11, color: 'var(--slate)', lineHeight: 1.5 }}>
          Map each <strong>{'{{param}}'}</strong> to a MediFlow variable.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {currentMap.map((m, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'white', borderRadius: 9, padding: '8px 12px', border: '1px solid var(--border)' }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--teal-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'var(--teal)', flexShrink: 0 }}>
                {m.slot}
              </div>
              <select value={m.variable} onChange={e => {
                const updated = [...currentMap]; updated[i] = { ...m, variable: e.target.value }; setCurrentMap(updated)
              }} style={{ ...iStyle, flex: 1, padding: '6px 8px', fontSize: 11 }}>
                <option value="">— Select variable —</option>
                {variables.map(v => <option key={v} value={v}>{v}</option>)}
                <option value="__custom__">Custom text…</option>
              </select>
            </div>
          ))}
        </div>
        {err && <div style={{ background: '#FEF2F2', borderRadius: 7, padding: '6px 10px', fontSize: 11, color: '#C0392B' }}>{err}</div>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => tab === 'name' ? setStep(1) : setCurlStep(1)} style={{ padding: '8px 12px', borderRadius: 8, border: '1.5px solid var(--border)', background: '#fff', color: 'var(--slate)', fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>← Back</button>
          <button type="button" onClick={handleSave} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--teal)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>✓ Save Campaign</button>
          <button type="button" onClick={onCancel} style={{ padding: '8px 12px', borderRadius: 8, border: '1.5px solid var(--border)', background: '#fff', color: 'var(--slate)', fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>Cancel</button>
        </div>
      </>)}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function ClinicPatients() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [patients, setPatients]   = useState([])
  const [search, setSearch]       = useState('')
  const [loading, setLoading]     = useState(true)
  const [activeTab, setActiveTab] = useState('campaigns')

  // ── Tag / doctor maps ──────────────────────────────────────────────────────
  const customTags    = profile?.customPatientTags || []
  const hasCustomTags = customTags.length > 0
  const TAG_LABELS = hasCustomTags ? Object.fromEntries(customTags.map(t => [t.name, t.name])) : FALLBACK_TAG_LABELS
  const TAG_COLORS = hasCustomTags ? Object.fromEntries(customTags.map(t => [t.name, t.color])) : FALLBACK_TAG_COLORS
  const ALL_TAGS   = hasCustomTags ? customTags.map(t => t.name) : Object.keys(FALLBACK_TAG_LABELS)
  const ALL_DOCTORS = (profile?.doctors || []).map(d => d.name).filter(Boolean)

  // ── Audience filter state (multi-tag + doctor + AND/OR) ───────────────────
  const [filterTags, setFilterTags]   = useState([])   // array of selected tag names
  const [filterLogic, setFilterLogic] = useState('OR') // 'OR' | 'AND'
  const [filterDoctor, setFilterDoctor] = useState('') // '' = any doctor

  // ── Selection + send state ─────────────────────────────────────────────────
  const [selected, setSelected]           = useState(new Set())
  const [showWAModal, setShowWAModal]     = useState(false)
  const [waSending, setWaSending]         = useState(false)
  const [waError, setWaError]             = useState(null)
  const [lastSendResult, setLastSendResult] = useState(null)

  // ── History state ──────────────────────────────────────────────────────────
  const [history, setHistory]               = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [expandedHistory, setExpandedHistory] = useState(new Set())

  // ── Template / param state ─────────────────────────────────────────────────
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [customParams, setCustomParams]         = useState({})
  const [showCampaignAdder, setShowCampaignAdder] = useState(false)
  const [localCampaigns, setLocalCampaigns]     = useState(null) // null = use profile

  const allCampaigns = localCampaigns ?? (profile?.whatsappCampaigns || [])

  useEffect(() => { loadPatients() }, [user])
  useEffect(() => { if (activeTab === 'campaigns') loadHistory() }, [activeTab])

  async function loadPatients() {
    setLoading(true)
    try {
      const q = query(collection(db, 'centres', user.uid, 'patients'), orderBy('name', 'asc'))
      const snap = await getDocs(q)
      setPatients(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  async function loadHistory() {
    if (!user?.uid) return
    setHistoryLoading(true)
    try {
      const centreId = profile?._centreId || user.uid
      setHistory(await getBroadcastHistory(centreId))
    } catch (e) { console.error(e) }
    setHistoryLoading(false)
  }

  // ── Filtered patients (multi-tag AND/OR + doctor) ─────────────────────────
  const audienceFiltered = patients.filter(p => {
    // Tag filter
    const tagMatch = filterTags.length === 0
      ? true
      : filterLogic === 'OR'
        ? filterTags.some(tag => (p.tags || []).includes(tag))
        : filterTags.every(tag => (p.tags || []).includes(tag))
    // Doctor filter — derived from patient's lastDoctorName field
    const doctorMatch = !filterDoctor || (p.lastDoctorName === filterDoctor)
    return tagMatch && doctorMatch
  })

  const filtered = patients.filter(p =>
    p.name?.toLowerCase().includes(search.toLowerCase()) || p.phone?.includes(search)
  )

  // ── Param helpers ──────────────────────────────────────────────────────────
  const AUTO_RESOLVE = {
    centreName: profile?.centreName || '',
    doctorName: profile?.doctors?.[0]?.name || '',
  }

  function getParamCount(template) {
    if (!template) return 0
    return parseCurl(template.curl)?.paramCount || 1
  }

  function isAutoResolvable(variable) {
    if (!variable || variable === '__custom__') return false
    return variable in AUTO_RESOLVE
  }

  function resolveSlot(slot, patientName) {
    if (slot === 1) return patientName
    const variable = selectedTemplate?.paramMapping?.[slot - 1]
    if (variable === 'patientName') return patientName
    if (variable && isAutoResolvable(variable)) return AUTO_RESOLVE[variable]
    return customParams[slot] || ''
  }

  function getManualSlots(template) {
    if (!template) return []
    const manual = []
    for (let i = 2; i <= getParamCount(template); i++) {
      const variable = template.paramMapping?.[i - 1]
      if (!isAutoResolvable(variable) && variable !== 'patientName')
        manual.push({ slot: i, variable })
    }
    return manual
  }

  function buildParams(patientName, paramCount) {
    return Array.from({ length: paramCount }, (_, i) => resolveSlot(i + 1, patientName))
  }

  // ── Selection helpers ──────────────────────────────────────────────────────
  function toggleSelect(id) {
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleAll() {
    setSelected(selected.size === audienceFiltered.length ? new Set() : new Set(audienceFiltered.map(p => p.id)))
  }
  function toggleFilterTag(tag) {
    setFilterTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])
    setSelected(new Set())
  }

  // ── Modal helpers ──────────────────────────────────────────────────────────
  function openWAModal() {
    const first = allCampaigns.find(c => c.enabled !== false) || allCampaigns[0] || null
    setSelectedTemplate(first)
    setCustomParams({})
    setWaError(null)
    setShowCampaignAdder(false)
    setShowWAModal(true)
  }

  function closeWAModal() {
    setShowWAModal(false)
    setSelectedTemplate(null)
    setCustomParams({})
    setWaError(null)
    setShowCampaignAdder(false)
  }

  function selectTemplate(t) {
    setSelectedTemplate(t)
    setCustomParams({})
    setWaError(null)
  }

  // ── Add campaign inline (saves to Firestore + updates local state) ─────────
  async function handleAddCampaignInline(newC) {
    const updated = [...allCampaigns, { ...newC, enabled: true }]
    setLocalCampaigns(updated)
    setShowCampaignAdder(false)
    selectTemplate({ ...newC, enabled: true })
    try {
      const centreId = profile?._centreId || user?.uid
      await setDoc(doc(db, 'centres', centreId, 'profile', 'main'), { whatsappCampaigns: updated }, { merge: true })
    } catch (e) { console.error('[addCampaignInline]', e) }
  }

  // ── Bulk send ──────────────────────────────────────────────────────────────
  async function handleBulkWA() {
    if (!selectedTemplate || selected.size === 0) return
    setWaError(null)

    for (const { slot } of getManualSlots(selectedTemplate)) {
      if (!customParams[slot]?.trim()) { setWaError(`Please fill in {{${slot}}} before sending.`); return }
    }

    const parsed = parseCurl(selectedTemplate.curl)
    if (!parsed?.apiKey) { setWaError('Could not read API key. Check cURL in Settings → WhatsApp → Campaigns.'); return }

    setWaSending(true)
    const paramCount       = getParamCount(selectedTemplate)
    const selectedPatients = audienceFiltered.filter(p => selected.has(p.id))
    let sent = 0
    const recipients = []

    for (const p of selectedPatients) {
      if (!p.phone) { recipients.push({ phone: '—', name: p.name, status: 'failed', error: 'No phone number' }); continue }
      const digits      = p.phone.replace(/\D/g, '')
      const destination = digits.startsWith('91') && digits.length === 12 ? digits : '91' + digits.slice(-10)
      const payload = {
        apiKey: parsed.apiKey, campaignName: parsed.campaignName, destination,
        userName: 'AISYNERGY', templateParams: buildParams(p.name, paramCount),
        source: 'mediflow', media: {}, attributes: {},
        paramsFallbackValue: { FirstName: p.name || 'user' }
      }
      try {
        const res  = await fetch('https://backend.api-wa.co/campaign/aisynergy/api/v2', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        const text = await res.text()
        if (res.ok) { sent++; recipients.push({ phone: p.phone, name: p.name, status: 'sent' }) }
        else recipients.push({ phone: p.phone, name: p.name, status: 'failed', error: `API ${res.status}: ${text}` })
      } catch (e) { recipients.push({ phone: p.phone, name: p.name, status: 'failed', error: e.message }) }
    }

    const centreId = profile?._centreId || user?.uid
    await saveBroadcastHistory(centreId, {
      name: selectedTemplate.name, templateName: parsed.campaignName,
      tagFilters: filterTags, audienceSize: selectedPatients.length,
      sentCount: sent, failedCount: selectedPatients.length - sent,
      mediaAttached: null, sentBy: profile?.ownerName || user?.email || '', recipients,
    })

    setLastSendResult({ sent, failed: recipients.filter(r => r.status === 'failed'), total: selectedPatients.length })
    setWaSending(false)
    closeWAModal()
    setSelected(new Set())
    loadHistory()
  }

  function exportCSV() {
    const rows = [['Name','Phone','Age','Gender','Tags','Last Visit']]
    filtered.forEach(p => rows.push([p.name, p.phone, p.age, p.gender, (p.tags||[]).join(';'), p.lastClinicVisit||'']))
    const csv  = rows.map(r => r.map(v => `"${v||''}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a'); a.href = url; a.download = 'patients.csv'; a.click()
  }

  function TagPill({ tag }) {
    const color = TAG_COLORS[tag] || 'var(--teal)'
    return <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 600, background: color + '20', color }}>{TAG_LABELS[tag] || tag}</span>
  }

  // ── Audience summary label ─────────────────────────────────────────────────
  function audienceSummary() {
    const parts = []
    if (filterTags.length > 0) parts.push(`Tags: ${filterTags.map(t => TAG_LABELS[t] || t).join(` ${filterLogic} `)}`)
    if (filterDoctor) parts.push(`Doctor: ${filterDoctor}`)
    return parts.length > 0 ? parts.join(' · ') : 'All patients'
  }

  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <Layout title="Marketing"
      action={
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn variant="ghost" small onClick={exportCSV}>⬇ Export CSV</Btn>
          {activeTab === 'campaigns' && (
            <Btn onClick={openWAModal} disabled={selected.size === 0}>
              📤 Send Campaign{selected.size > 0 ? ` (${selected.size})` : ''}
            </Btn>
          )}
          <Btn onClick={() => navigate('/clinic/appointments/new')}>+ New Appointment</Btn>
        </div>
      }
    >

      {/* ── Top Tabs ── */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '1px solid var(--border)' }}>
        {[['campaigns','📣 Campaigns'], ['patients','👥 Patients']].map(([tab, label]) => (
          <button key={tab} onClick={() => { setActiveTab(tab); setLastSendResult(null); setWaError(null) }} style={{
            padding: '10px 20px', background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: activeTab === tab ? 700 : 400,
            color: activeTab === tab ? 'var(--teal)' : 'var(--slate)',
            borderBottom: `2.5px solid ${activeTab === tab ? 'var(--teal)' : 'transparent'}`,
            fontFamily: 'DM Sans, sans-serif', marginBottom: -1, transition: 'all 0.15s'
          }}>{label}</button>
        ))}
      </div>

      {/* ═══════════ PATIENTS TAB ═══════════ */}
      {activeTab === 'patients' && (
        <>
          <div style={{ marginBottom: 20 }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or phone…"
              style={{ width: '100%', maxWidth: 400, padding: '10px 16px', borderRadius: 10, border: '1.5px solid var(--border)', fontSize: 13, fontFamily: 'DM Sans, sans-serif', outline: 'none', boxSizing: 'border-box', background: 'var(--surface)' }} />
          </div>
          <Card>
            <CardHeader title={`All Patients (${filtered.length})`} />
            {loading ? <Empty icon="⏳" message="Loading patients…" />
              : filtered.length === 0 ? <Empty icon="👥" message={search ? 'No patients match your search' : 'No patients yet.'} />
              : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg)' }}>
                      {['Name','Phone','Age / Gender','Tags','Last Visit',''].map(h => (
                        <th key={h} style={{ textAlign: 'left', padding: '10px 18px', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--muted)', fontWeight: 500, borderBottom: '1px solid var(--border)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(p => (
                      <tr key={p.id} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                        onClick={() => navigate(`/patients/${p.id}`)}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--teal-light)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <td style={{ padding: '13px 18px' }}><div style={{ fontWeight: 500, fontSize: 14, color: 'var(--navy)' }}>{p.name}</div></td>
                        <td style={{ padding: '13px 18px', fontSize: 13, color: 'var(--slate)' }}>{maskPhone(p.phone)}</td>
                        <td style={{ padding: '13px 18px', fontSize: 13, color: 'var(--slate)' }}>{p.age ? `${p.age}y` : '—'} {p.gender ? `· ${p.gender}` : ''}</td>
                        <td style={{ padding: '13px 18px' }}><div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>{(p.tags || []).map(tag => <TagPill key={tag} tag={tag} />)}</div></td>
                        <td style={{ padding: '13px 18px', fontSize: 12, color: 'var(--muted)' }}>{p.lastClinicVisit || '—'}</td>
                        <td style={{ padding: '13px 18px', color: 'var(--teal)', fontSize: 18 }}>›</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
          </Card>
        </>
      )}

      {/* ═══════════ CAMPAIGNS TAB ═══════════ */}
      {activeTab === 'campaigns' && (
        <>
          {/* Post-send banner */}
          {lastSendResult && (
            <div style={{ marginBottom: 16, padding: '14px 18px', background: lastSendResult.sent === 0 ? '#FEF2F2' : '#D1FAE5', border: `1px solid ${lastSendResult.sent === 0 ? '#FCA5A5' : '#6EE7B7'}`, borderRadius: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: lastSendResult.sent === 0 ? '#991B1B' : '#065F46', marginBottom: 6 }}>
                {lastSendResult.sent === 0 ? '⚠ All sends failed' : `✓ Sent to ${lastSendResult.sent} of ${lastSendResult.total} patient${lastSendResult.total !== 1 ? 's' : ''}`}
              </div>
              {lastSendResult.failed.length > 0 && (
                <div style={{ fontSize: 12, color: '#B91C1C', marginBottom: 6 }}>
                  <strong>Failed ({lastSendResult.failed.length}):</strong>
                  {lastSendResult.failed.map((r, i) => <div key={i} style={{ paddingLeft: 10, marginTop: 2 }}>• {r.name} — {r.error}</div>)}
                </div>
              )}
              {lastSendResult.sent > 0 && <div style={{ fontSize: 11, color: '#065F46' }}>📋 Saved to History below · Delivered/Read requires webhook setup</div>}
            </div>
          )}

          {/* ── Audience Filter Card ── */}
          <Card>
            <CardHeader title="🎯 Audience Filter" />
            <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Tag filter row */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: 0.4 }}>Filter by Tag</span>
                  {filterTags.length > 1 && (
                    <div style={{ display: 'flex', border: '1.5px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                      {['OR','AND'].map(logic => (
                        <button key={logic} type="button" onClick={() => setFilterLogic(logic)} style={{
                          padding: '3px 12px', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700,
                          background: filterLogic === logic ? 'var(--teal)' : '#fff',
                          color: filterLogic === logic ? '#fff' : 'var(--muted)',
                          fontFamily: 'DM Sans, sans-serif',
                        }}>{logic}</button>
                      ))}
                    </div>
                  )}
                  {filterTags.length > 0 && (
                    <button type="button" onClick={() => { setFilterTags([]); setSelected(new Set()) }} style={{ fontSize: 11, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontFamily: 'DM Sans, sans-serif' }}>Clear tags</button>
                  )}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {ALL_TAGS.map(tag => {
                    const count    = patients.filter(p => (p.tags || []).includes(tag)).length
                    if (count === 0) return null
                    const on    = filterTags.includes(tag)
                    const color = TAG_COLORS[tag] || 'var(--teal)'
                    return (
                      <button key={tag} type="button" onClick={() => toggleFilterTag(tag)} style={{
                        padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        border: `1.5px solid ${on ? color : 'var(--border)'}`,
                        background: on ? color + '20' : 'none',
                        color: on ? color : 'var(--slate)', fontFamily: 'DM Sans, sans-serif',
                        position: 'relative',
                      }}>
                        {on && <span style={{ marginRight: 4 }}>✓</span>}
                        {TAG_LABELS[tag] || tag} ({count})
                      </button>
                    )
                  })}
                  {ALL_TAGS.length === 0 && <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>No tags configured. Add in Settings → Clinic → Patient Tags.</div>}
                </div>
              </div>

              {/* Doctor filter row */}
              {ALL_DOCTORS.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>Filter by Doctor</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <button type="button" onClick={() => { setFilterDoctor(''); setSelected(new Set()) }} style={{
                      padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      border: `1.5px solid ${!filterDoctor ? 'var(--teal)' : 'var(--border)'}`,
                      background: !filterDoctor ? 'var(--teal-light)' : 'none',
                      color: !filterDoctor ? 'var(--teal)' : 'var(--slate)', fontFamily: 'DM Sans, sans-serif'
                    }}>Any Doctor</button>
                    {ALL_DOCTORS.map(doc => {
                      const on = filterDoctor === doc
                      return (
                        <button key={doc} type="button" onClick={() => { setFilterDoctor(on ? '' : doc); setSelected(new Set()) }} style={{
                          padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                          border: `1.5px solid ${on ? 'var(--teal)' : 'var(--border)'}`,
                          background: on ? 'var(--teal-light)' : 'none',
                          color: on ? 'var(--teal)' : 'var(--slate)', fontFamily: 'DM Sans, sans-serif'
                        }}>👨‍⚕️ {doc}</button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Active filter summary */}
              {(filterTags.length > 0 || filterDoctor) && (
                <div style={{ background: 'var(--teal-light)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: 'var(--teal)', fontWeight: 600 }}>
                  🎯 {audienceSummary()} — <strong>{audienceFiltered.length} patient{audienceFiltered.length !== 1 ? 's' : ''}</strong> match
                </div>
              )}
            </div>
          </Card>

          {/* ── Patient list with checkboxes ── */}
          <Card>
            <CardHeader
              title={`${filterTags.length > 0 || filterDoctor ? 'Filtered' : 'All'} Patients (${audienceFiltered.length})`}
              action={
                selected.size > 0 && (
                  <Btn small onClick={openWAModal} disabled={allCampaigns.length === 0}>
                    📱 Send WhatsApp ({selected.size})
                  </Btn>
                )
              }
            />
            {audienceFiltered.length === 0 ? (
              <Empty icon="🏷" message="No patients match the current filter." />
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--bg)' }}>
                    <th style={{ padding: '10px 18px', width: 40 }}>
                      <input type="checkbox" checked={selected.size === audienceFiltered.length && audienceFiltered.length > 0} onChange={toggleAll} style={{ cursor: 'pointer', width: 15, height: 15 }} />
                    </th>
                    {['Name','Phone','Age / Gender','Tags'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '10px 18px', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--muted)', fontWeight: 500, borderBottom: '1px solid var(--border)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {audienceFiltered.map(p => (
                    <tr key={p.id} style={{ borderBottom: '1px solid var(--border)', background: selected.has(p.id) ? 'var(--teal-light)' : 'transparent', transition: 'background 0.1s' }}>
                      <td style={{ padding: '12px 18px' }}>
                        <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSelect(p.id)} style={{ cursor: 'pointer', width: 15, height: 15 }} />
                      </td>
                      <td style={{ padding: '12px 18px' }}>
                        <div style={{ fontWeight: 500, fontSize: 14, color: 'var(--navy)', cursor: 'pointer' }} onClick={() => navigate(`/patients/${p.id}`)}>{p.name}</div>
                      </td>
                      <td style={{ padding: '12px 18px', fontSize: 13, color: 'var(--slate)' }}>{maskPhone(p.phone)}</td>
                      <td style={{ padding: '12px 18px', fontSize: 13, color: 'var(--slate)' }}>{p.age ? `${p.age}y` : '—'} {p.gender ? `· ${p.gender}` : ''}</td>
                      <td style={{ padding: '12px 18px' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {(p.tags || []).map(tag => <TagPill key={tag} tag={tag} />)}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          {/* ── Campaign History ── */}
          <div style={{ marginTop: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)' }}>📋 Campaign History</div>
              <Btn variant="ghost" small onClick={loadHistory} disabled={historyLoading}>{historyLoading ? 'Refreshing…' : '↻ Refresh'}</Btn>
            </div>

            {historyLoading ? <Empty icon="⏳" message="Loading…" />
              : history.length === 0 ? <Empty icon="📋" message="No campaigns sent yet. Select patients above and click Send Campaign." />
              : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {history.map(record => {
                    const isExpanded  = expandedHistory.has(record.id)
                    const sentCount   = record.sentCount   ?? (record.recipients || []).filter(r => r.status === 'sent').length
                    const failedCount = record.failedCount ?? (record.recipients || []).filter(r => r.status === 'failed').length
                    return (
                      <Card key={record.id}>
                        <div style={{ padding: '16px 20px' }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)', marginBottom: 3 }}>{record.name || record.templateName || 'Campaign'}</div>
                              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>{formatSentAt(record.sentAt)} · by {record.sentBy || '—'}</div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20, background: '#D1FAE5', color: '#065F46', fontWeight: 600 }}>✓ {sentCount} sent</span>
                                {failedCount > 0 && <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20, background: '#FEE2E2', color: '#991B1B', fontWeight: 600 }}>✗ {failedCount} failed</span>}
                                <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20, background: 'var(--bg)', color: 'var(--slate)', fontWeight: 600 }}>👥 {record.audienceSize}</span>
                                {(record.tagFilters || []).length > 0 && (
                                  <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20, background: 'var(--teal-light)', color: 'var(--teal)', fontWeight: 600 }}>
                                    🏷 {record.tagFilters.map(t => TAG_LABELS[t] || t).join(', ')}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end', flexShrink: 0 }}>
                              <div style={{ fontSize: 11, color: 'var(--muted)' }}>Template: <code style={{ background: 'var(--bg)', padding: '1px 6px', borderRadius: 4 }}>{record.templateName}</code></div>
                              <div style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>Delivered/Read — webhook needed</div>
                            </div>
                          </div>
                          {(record.recipients?.length > 0) && (
                            <button type="button" onClick={() => setExpandedHistory(s => { const n = new Set(s); n.has(record.id) ? n.delete(record.id) : n.add(record.id); return n })}
                              style={{ marginTop: 12, background: 'none', border: '1.5px solid var(--border)', borderRadius: 8, padding: '6px 14px', fontSize: 12, cursor: 'pointer', color: 'var(--slate)', fontFamily: 'DM Sans, sans-serif', fontWeight: 500 }}>
                              {isExpanded ? '▲ Hide recipients' : `▼ ${record.recipients.length} recipients`}
                            </button>
                          )}
                          {isExpanded && (
                            <div style={{ marginTop: 12, border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                <thead>
                                  <tr style={{ background: 'var(--bg)' }}>
                                    {['Name','Phone','Status','Note'].map(h => (
                                      <th key={h} style={{ textAlign: 'left', padding: '8px 14px', fontWeight: 600, color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid var(--border)' }}>{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {record.recipients.map((r, i) => (
                                    <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: r.status === 'failed' ? '#FFF5F5' : 'transparent' }}>
                                      <td style={{ padding: '8px 14px', color: 'var(--navy)', fontWeight: 500 }}>{r.name}</td>
                                      <td style={{ padding: '8px 14px', color: 'var(--slate)' }}>{maskPhone(r.phone)}</td>
                                      <td style={{ padding: '8px 14px' }}>
                                        <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700, background: r.status === 'sent' ? '#D1FAE5' : '#FEE2E2', color: r.status === 'sent' ? '#065F46' : '#991B1B' }}>
                                          {r.status === 'sent' ? '✓ Sent' : '✗ Failed'}
                                        </span>
                                      </td>
                                      <td style={{ padding: '8px 14px', color: 'var(--muted)', fontStyle: r.error ? 'normal' : 'italic', fontSize: 11 }}>{r.error || (r.status === 'sent' ? 'Delivered/Read unknown' : '—')}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      </Card>
                    )
                  })}
                </div>
              )}
          </div>
        </>
      )}

      {/* ═══════════ WA SEND MODAL ═══════════ */}
      {showWAModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={e => { if (e.target === e.currentTarget) closeWAModal() }}
        >
          <div style={{ background: 'white', borderRadius: 16, padding: 28, maxWidth: 540, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', maxHeight: '90vh', overflowY: 'auto' }}>

            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--navy)', marginBottom: 2 }}>📱 Send WhatsApp Campaign</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20 }}>
              Sending to <strong>{selected.size} patient{selected.size !== 1 ? 's' : ''}</strong>
              {filterTags.length > 0 || filterDoctor ? ` · ${audienceSummary()}` : ''}
            </div>

            {/* Template picker */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 8 }}>Select Template</label>

              {allCampaigns.length === 0 && !showCampaignAdder && (
                <div style={{ background: '#FFF7ED', border: '1px solid #F97316', borderRadius: 10, padding: '12px 14px', fontSize: 13, color: '#9A3412', marginBottom: 10 }}>
                  ⚠ No campaigns yet. Add one below.
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {allCampaigns.map(t => {
                  const pCount     = getParamCount(t)
                  const isSelected = selectedTemplate?.name === t.name
                  const isEnabled  = t.enabled !== false
                  return (
                    <button key={t.name} type="button" onClick={() => isEnabled && selectTemplate(t)} style={{
                      padding: '10px 14px', borderRadius: 10, textAlign: 'left',
                      cursor: isEnabled ? 'pointer' : 'not-allowed',
                      border: `1.5px solid ${isSelected ? 'var(--teal)' : 'var(--border)'}`,
                      background: isSelected ? 'var(--teal-light)' : isEnabled ? 'var(--surface)' : 'var(--bg)',
                      fontFamily: 'DM Sans, sans-serif', transition: 'all 0.15s', opacity: isEnabled ? 1 : 0.5,
                    }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        {isSelected ? '● ' : '○ '}{t.name}
                        {!isEnabled && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, background: '#FEF2F2', color: '#DC2626', fontWeight: 600 }}>PAUSED</span>}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                        {t.purpose} · {pCount} param{pCount !== 1 ? 's' : ''} · {'{{1}}'} = patient name (auto)
                      </div>
                    </button>
                  )
                })}
              </div>

              {/* + Add Campaign inline */}
              {!showCampaignAdder ? (
                <button type="button" onClick={() => setShowCampaignAdder(true)} style={{
                  marginTop: 10, width: '100%', padding: '9px', borderRadius: 10,
                  border: '1.5px dashed var(--teal)', background: 'none', color: 'var(--teal)',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif'
                }}>+ Add Campaign</button>
              ) : (
                <InlineCampaignAdder
                  globalApiKey={profile?.aisynergyApiKey || ''}
                  onAdd={handleAddCampaignInline}
                  onCancel={() => setShowCampaignAdder(false)}
                />
              )}
            </div>

            {/* Auto-filled + manual params */}
            {selectedTemplate && !showCampaignAdder && (() => {
              const manualSlots = getManualSlots(selectedTemplate)
              const paramCount  = getParamCount(selectedTemplate)
              const autoSlots   = []
              for (let i = 2; i <= paramCount; i++) {
                const variable = selectedTemplate.paramMapping?.[i - 1]
                if (isAutoResolvable(variable) || variable === 'patientName')
                  autoSlots.push({ slot: i, variable, value: variable === 'patientName' ? 'patient name' : AUTO_RESOLVE[variable] })
              }
              return (
                <>
                  {autoSlots.length > 0 && (
                    <div style={{ marginBottom: 12, background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: 10, padding: '10px 14px' }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#166534', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 }}>Auto-filled</div>
                      {autoSlots.map(({ slot, variable, value }) => (
                        <div key={slot} style={{ fontSize: 12, color: '#166534', marginBottom: 2 }}>
                          <code style={{ background: '#DCFCE7', padding: '1px 5px', borderRadius: 4 }}>{`{{${slot}}}`}</code>
                          {' '}= <strong>{variable}</strong> → "{value}"
                        </div>
                      ))}
                    </div>
                  )}
                  {manualSlots.length > 0 && (
                    <div style={{ marginBottom: 16 }}>
                      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 8 }}>
                        Campaign Details — same for all patients
                      </label>
                      <style>{`
                        @keyframes softPulse {
                          0%, 100% { border-color: #FCA5A5; box-shadow: 0 0 0 0 rgba(239,68,68,0); }
                          50% { border-color: #EF4444; box-shadow: 0 0 0 3px rgba(239,68,68,0.15); }
                        }
                        .param-required { animation: softPulse 2s ease-in-out infinite; }
                      `}</style>
                      {manualSlots.map(({ slot, variable }) => {
                        const isEmpty = !customParams[slot]?.trim()
                        return (
                          <div key={slot} style={{ marginBottom: 10 }}>
                            <label style={{ fontSize: 12, color: isEmpty ? '#DC2626' : 'var(--slate)', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                              {`{{${slot}}}`}{variable && variable !== '__custom__' ? ` — ${variable}` : ''}
                              {isEmpty && <span style={{ marginLeft: 6, fontSize: 10, color: '#EF4444', fontWeight: 700 }}>fill this in</span>}
                            </label>
                            <input type="text" value={customParams[slot] || ''}
                              onChange={e => setCustomParams(cp => ({ ...cp, [slot]: e.target.value }))}
                              placeholder={`e.g. ${slot === 2 ? '18/3/2026 or Free Diabetes Camp' : `Value for param ${slot}`}`}
                              className={isEmpty ? 'param-required' : ''}
                              style={{ width: '100%', border: `1.5px solid ${isEmpty ? '#FCA5A5' : 'var(--border)'}`, borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none', fontFamily: 'DM Sans, sans-serif', color: 'var(--navy)', boxSizing: 'border-box', background: isEmpty ? '#FFF5F5' : '#fff' }}
                              onFocus={e => { e.target.style.borderColor = 'var(--teal)'; e.target.style.background = '#fff'; e.target.classList.remove('param-required') }}
                              onBlur={e => {
                                if (!e.target.value.trim()) { e.target.style.borderColor = '#FCA5A5'; e.target.style.background = '#FFF5F5'; e.target.classList.add('param-required') }
                                else { e.target.style.borderColor = 'var(--border)'; e.target.style.background = '#fff' }
                              }}
                            />
                          </div>
                        )
                      })}
                    </div>
                  )}
                </>
              )
            })()}

            {/* Preview */}
            {selectedTemplate && !showCampaignAdder && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 8 }}>Message Preview</label>
                <div style={{ background: '#ECF0F1', borderRadius: 12, padding: '12px 14px' }}>
                  <div style={{ fontSize: 11, color: '#8FA3AE', marginBottom: 8 }}>📱 {selectedTemplate.name}</div>
                  {selectedTemplate.templateBody
                    ? <WABubble body={selectedTemplate.templateBody} params={buildParams('Patient Name', getParamCount(selectedTemplate))} />
                    : <div style={{ background: '#fff', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}><em>No template body saved.</em> Go to Settings → WhatsApp → Campaigns to add preview.</div>
                  }
                </div>
              </div>
            )}

            {waError && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#B91C1C', marginBottom: 14 }}>⚠ {waError}</div>
            )}

            {!showCampaignAdder && (
              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button onClick={closeWAModal} style={{ flex: 1, padding: '11px', borderRadius: 10, border: '1.5px solid var(--border)', background: 'none', cursor: 'pointer', fontSize: 13, fontFamily: 'DM Sans, sans-serif', color: 'var(--slate)' }}>Cancel</button>
                <button onClick={handleBulkWA} disabled={!selectedTemplate || selectedTemplate?.enabled === false || waSending}
                  style={{ flex: 2, padding: '11px', borderRadius: 10, border: 'none', background: 'var(--teal)', color: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'DM Sans, sans-serif', opacity: (!selectedTemplate || selectedTemplate?.enabled === false || waSending) ? 0.5 : 1 }}>
                  {waSending ? 'Sending…' : `Send to ${selected.size} patient${selected.size !== 1 ? 's' : ''}`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </Layout>
  )
}
