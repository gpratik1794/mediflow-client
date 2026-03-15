// src/pages/clinic/ClinicPatients.jsx
import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../utils/AuthContext'
import Layout from '../../components/Layout'
import { Card, CardHeader, Btn, Empty } from '../../components/UI'
import { collection, query, orderBy, getDocs } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { parseCurl } from '../../firebase/whatsapp'
import { saveBroadcastHistory, getBroadcastHistory } from '../../firebase/clinicDb'

// ── Fallback hardcoded tags (used only if clinic has no custom tags configured) ─
const FALLBACK_TAG_LABELS = { diabetes:'Diabetes', hypert:'Hypertension', thyroid:'Thyroid', asthma:'Asthma', cardiac:'Cardiac', ortho:'Ortho', peds:'Paeds', obesity:'Obesity' }
const FALLBACK_TAG_COLORS = { diabetes:'#F59E0B', hypert:'#EF4444', thyroid:'#8B5CF6', asthma:'#3B82F6', cardiac:'#EC4899', ortho:'#10B981', peds:'#06B6D4', obesity:'#F97316' }

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
    <div style={{
      background: '#E9FBE5', borderRadius: '12px 12px 12px 2px',
      padding: '10px 14px', fontSize: 13, color: '#111', lineHeight: 1.65,
      whiteSpace: 'pre-wrap', maxWidth: '100%', wordBreak: 'break-word',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
    }}>
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

export default function ClinicPatients() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [patients, setPatients]   = useState([])
  const [search, setSearch]       = useState('')
  const [loading, setLoading]     = useState(true)
  const [activeTab, setActiveTab] = useState('campaigns')

  // ── Derive tag maps from profile.customPatientTags (fallback to hardcoded) ──
  const customTags    = profile?.customPatientTags || []
  const hasCustomTags = customTags.length > 0
  const TAG_LABELS = hasCustomTags
    ? Object.fromEntries(customTags.map(t => [t.name, t.name]))
    : FALLBACK_TAG_LABELS
  const TAG_COLORS = hasCustomTags
    ? Object.fromEntries(customTags.map(t => [t.name, t.color]))
    : FALLBACK_TAG_COLORS
  const ALL_TAGS = hasCustomTags
    ? customTags.map(t => t.name)
    : Object.keys(FALLBACK_TAG_LABELS)

  // ── Campaigns sub-tab ──
  const [campaignSubTab, setCampaignSubTab] = useState('send')

  // ── Send sub-tab state ──
  const [filterTag, setFilterTag]     = useState('')
  const [selected, setSelected]       = useState(new Set())
  const [showWAModal, setShowWAModal] = useState(false)
  const [waSending, setWaSending]     = useState(false)
  const [waError, setWaError]         = useState(null)
  const [lastSendResult, setLastSendResult] = useState(null)

  // ── History sub-tab state ──
  const [history, setHistory]               = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [expandedHistory, setExpandedHistory] = useState(new Set())

  // ── Template / param state ──
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [customParams, setCustomParams]         = useState({})

  useEffect(() => { loadPatients() }, [user])

  useEffect(() => {
    if (activeTab === 'campaigns' && campaignSubTab === 'history') loadHistory()
  }, [activeTab, campaignSubTab])

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
      const records  = await getBroadcastHistory(centreId)
      setHistory(records)
    } catch (e) { console.error(e) }
    setHistoryLoading(false)
  }

  const filtered = patients.filter(p =>
    p.name?.toLowerCase().includes(search.toLowerCase()) ||
    p.phone?.includes(search)
  )

  const tagFiltered = filterTag
    ? patients.filter(p => (p.tags || []).includes(filterTag))
    : patients

  const allCampaigns = profile?.whatsappCampaigns || []

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
    setSelected(selected.size === tagFiltered.length
      ? new Set()
      : new Set(tagFiltered.map(p => p.id))
    )
  }

  // ── WA Modal helpers ───────────────────────────────────────────────────────

  function openWAModal() {
    const first = allCampaigns.find(c => c.enabled !== false) || allCampaigns[0] || null
    setSelectedTemplate(first)
    setCustomParams({})
    setWaError(null)
    setShowWAModal(true)
  }

  function closeWAModal() {
    setShowWAModal(false)
    setSelectedTemplate(null)
    setCustomParams({})
    setWaError(null)
  }

  function selectTemplate(t) {
    setSelectedTemplate(t)
    setCustomParams({})
    setWaError(null)
  }

  // ── Bulk send ──────────────────────────────────────────────────────────────

  async function handleBulkWA() {
    if (!selectedTemplate || selected.size === 0) return
    setWaError(null)

    // Validate manual params filled
    for (const { slot } of getManualSlots(selectedTemplate)) {
      if (!customParams[slot]?.trim()) {
        setWaError(`Please fill in {{${slot}}} before sending.`)
        return
      }
    }

    const parsed = parseCurl(selectedTemplate.curl)
    if (!parsed?.apiKey) {
      setWaError('Could not read API key from this campaign. Check the cURL in Settings → WhatsApp → Campaigns.')
      return
    }

    setWaSending(true)
    const paramCount       = getParamCount(selectedTemplate)
    const selectedPatients = tagFiltered.filter(p => selected.has(p.id))
    let sent = 0
    const recipients = []

    for (const p of selectedPatients) {
      if (!p.phone) {
        recipients.push({ phone: '—', name: p.name, status: 'failed', error: 'No phone number' })
        continue
      }
      const digits      = p.phone.replace(/\D/g, '')
      const destination = digits.startsWith('91') && digits.length === 12
        ? digits : '91' + digits.slice(-10)

      const payload = {
        apiKey: parsed.apiKey,
        campaignName: parsed.campaignName,
        destination,
        userName: 'AISYNERGY',
        templateParams: buildParams(p.name, paramCount),
        source: 'mediflow',
        media: {},
        attributes: {},
        paramsFallbackValue: { FirstName: p.name || 'user' }
      }

      try {
        const res  = await fetch('https://backend.api-wa.co/campaign/aisynergy/api/v2', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
        const text = await res.text()
        if (res.ok) {
          sent++
          recipients.push({ phone: p.phone, name: p.name, status: 'sent' })
        } else {
          recipients.push({ phone: p.phone, name: p.name, status: 'failed', error: `API ${res.status}: ${text}` })
        }
      } catch (e) {
        recipients.push({ phone: p.phone, name: p.name, status: 'failed', error: e.message })
      }
    }

    // ── Save broadcast history record ──
    const centreId = profile?._centreId || user?.uid
    await saveBroadcastHistory(centreId, {
      name:          selectedTemplate.name,
      templateName:  parsed.campaignName,
      tagFilters:    filterTag ? [filterTag] : [],
      audienceSize:  selectedPatients.length,
      sentCount:     sent,
      failedCount:   selectedPatients.length - sent,
      mediaAttached: null,
      sentBy:        profile?.ownerName || user?.email || '',
      recipients,
    })

    setLastSendResult({ sent, failed: recipients.filter(r => r.status === 'failed'), total: selectedPatients.length })
    setWaSending(false)
    closeWAModal()
    setSelected(new Set())
  }

  function exportCSV() {
    const rows = [['Name','Phone','Age','Gender','Tags','Last Visit']]
    filtered.forEach(p => rows.push([p.name, p.phone, p.age, p.gender, (p.tags||[]).join(';'), p.lastClinicVisit||'']))
    const csv  = rows.map(r => r.map(v => `"${v||''}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a'); a.href = url; a.download = 'patients.csv'; a.click()
  }

  // ── Tag pill ───────────────────────────────────────────────────────────────
  function TagPill({ tag }) {
    const color = TAG_COLORS[tag] || 'var(--teal)'
    const label = TAG_LABELS[tag] || tag
    return (
      <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 600, background: color + '20', color }}>
        {label}
      </span>
    )
  }

  // ── Shared style ───────────────────────────────────────────────────────────
  const subTabBtn = (active) => ({
    padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer',
    fontSize: 13, fontWeight: active ? 700 : 400,
    background: active ? '#fff' : 'transparent',
    color: active ? 'var(--teal)' : 'var(--slate)',
    boxShadow: active ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
    fontFamily: 'DM Sans, sans-serif', transition: 'all 0.15s',
  })

  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <Layout title="Marketing"
      action={
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn variant="ghost" small onClick={exportCSV}>⬇ Export CSV</Btn>
          <Btn onClick={() => navigate('/clinic/appointments/new')}>+ New Appointment</Btn>
        </div>
      }
    >

      {/* ── Top-level Tabs ── */}
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

      {/* ═══════════════ PATIENTS TAB ═══════════════ */}
      {activeTab === 'patients' && (
        <>
          <div style={{ marginBottom: 20 }}>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or phone…"
              style={{ width: '100%', maxWidth: 400, padding: '10px 16px', borderRadius: 10, border: '1.5px solid var(--border)', fontSize: 13, fontFamily: 'DM Sans, sans-serif', outline: 'none', boxSizing: 'border-box', background: 'var(--surface)' }}
            />
          </div>
          <Card>
            <CardHeader title={`All Patients (${filtered.length})`} />
            {loading
              ? <Empty icon="⏳" message="Loading patients…" />
              : filtered.length === 0
                ? <Empty icon="👥" message={search ? 'No patients match your search' : 'No patients yet.'} />
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
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <td style={{ padding: '13px 18px' }}><div style={{ fontWeight: 500, fontSize: 14, color: 'var(--navy)' }}>{p.name}</div></td>
                          <td style={{ padding: '13px 18px', fontSize: 13, color: 'var(--slate)' }}>{maskPhone(p.phone)}</td>
                          <td style={{ padding: '13px 18px', fontSize: 13, color: 'var(--slate)' }}>{p.age ? `${p.age}y` : '—'} {p.gender ? `· ${p.gender}` : ''}</td>
                          <td style={{ padding: '13px 18px' }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                              {(p.tags || []).map(tag => <TagPill key={tag} tag={tag} />)}
                            </div>
                          </td>
                          <td style={{ padding: '13px 18px', fontSize: 12, color: 'var(--muted)' }}>{p.lastClinicVisit || '—'}</td>
                          <td style={{ padding: '13px 18px', color: 'var(--teal)', fontSize: 18 }}>›</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
            }
          </Card>
        </>
      )}

      {/* ═══════════════ CAMPAIGNS TAB ═══════════════ */}
      {activeTab === 'campaigns' && (
        <>
          {/* Sub-tab bar */}
          <div style={{ display: 'flex', gap: 0, marginBottom: 20, background: 'var(--bg)', borderRadius: 10, padding: 4, width: 'fit-content' }}>
            {[['send','📤 Send Campaign'], ['history','📋 History']].map(([sub, label]) => (
              <button key={sub} onClick={() => setCampaignSubTab(sub)} style={subTabBtn(campaignSubTab === sub)}>
                {label}
              </button>
            ))}
          </div>

          {/* ─── SEND SUB-TAB ─── */}
          {campaignSubTab === 'send' && (
            <>
              {/* Post-send result banner */}
              {lastSendResult && (
                <div style={{
                  marginBottom: 16, padding: '14px 18px',
                  background: lastSendResult.sent === 0 ? '#FEF2F2' : '#D1FAE5',
                  border: `1px solid ${lastSendResult.sent === 0 ? '#FCA5A5' : '#6EE7B7'}`,
                  borderRadius: 10
                }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: lastSendResult.sent === 0 ? '#991B1B' : '#065F46', marginBottom: 6 }}>
                    {lastSendResult.sent === 0
                      ? '⚠ All sends failed'
                      : `✓ Sent to ${lastSendResult.sent} of ${lastSendResult.total} patient${lastSendResult.total !== 1 ? 's' : ''}`}
                  </div>
                  {lastSendResult.failed.length > 0 && (
                    <div style={{ fontSize: 12, color: '#B91C1C', marginBottom: 6 }}>
                      <strong>Failed ({lastSendResult.failed.length}):</strong>
                      {lastSendResult.failed.map((r, i) => (
                        <div key={i} style={{ paddingLeft: 10, marginTop: 2 }}>• {r.name} — {r.error}</div>
                      ))}
                    </div>
                  )}
                  {lastSendResult.sent > 0 && (
                    <div style={{ fontSize: 11, color: '#065F46' }}>
                      📋 Saved to <strong style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => setCampaignSubTab('history')}>History</strong> · Delivered/Read status requires webhook setup
                    </div>
                  )}
                </div>
              )}

              {allCampaigns.length === 0 && (
                <div style={{ marginBottom: 16, padding: '12px 18px', background: '#FFF7ED', border: '1px solid #F97316', borderRadius: 10, fontSize: 13, color: '#9A3412' }}>
                  ⚠ No campaigns configured yet. Go to <strong>Settings → WhatsApp → Campaigns</strong> to add one.
                </div>
              )}

              {/* Audience filter by tag */}
              <Card>
                <CardHeader title="Filter Audience by Tag" />
                <div style={{ padding: '14px 18px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <button onClick={() => { setFilterTag(''); setSelected(new Set()) }} style={{
                    padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    border: `1.5px solid ${!filterTag ? 'var(--teal)' : 'var(--border)'}`,
                    background: !filterTag ? 'var(--teal-light)' : 'none',
                    color: !filterTag ? 'var(--teal)' : 'var(--slate)', fontFamily: 'DM Sans, sans-serif'
                  }}>All ({patients.length})</button>

                  {ALL_TAGS.map(tag => {
                    const count = patients.filter(p => (p.tags || []).includes(tag)).length
                    if (count === 0) return null
                    const on    = filterTag === tag
                    const color = TAG_COLORS[tag] || 'var(--teal)'
                    return (
                      <button key={tag} onClick={() => { setFilterTag(on ? '' : tag); setSelected(new Set()) }} style={{
                        padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        border: `1.5px solid ${on ? color : 'var(--border)'}`,
                        background: on ? color + '20' : 'none',
                        color: on ? color : 'var(--slate)', fontFamily: 'DM Sans, sans-serif'
                      }}>{TAG_LABELS[tag] || tag} ({count})</button>
                    )
                  })}

                  {ALL_TAGS.length === 0 && (
                    <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>
                      No tags configured. Add tags in <strong>Settings → Clinic → Patient Tags</strong>.
                    </div>
                  )}
                </div>
              </Card>

              {/* Patient list with checkboxes */}
              <Card>
                <CardHeader
                  title={`${filterTag ? (TAG_LABELS[filterTag] || filterTag) : 'All'} Patients (${tagFiltered.length})`}
                  action={
                    selected.size > 0 && (
                      <Btn small onClick={openWAModal} disabled={allCampaigns.length === 0}>
                        📱 Send WhatsApp ({selected.size})
                      </Btn>
                    )
                  }
                />
                {tagFiltered.length === 0 ? (
                  <Empty icon="🏷" message={filterTag ? `No patients tagged as ${TAG_LABELS[filterTag] || filterTag}` : 'No patients yet.'} />
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg)' }}>
                        <th style={{ padding: '10px 18px', width: 40 }}>
                          <input type="checkbox"
                            checked={selected.size === tagFiltered.length && tagFiltered.length > 0}
                            onChange={toggleAll}
                            style={{ cursor: 'pointer', width: 15, height: 15 }}
                          />
                        </th>
                        {['Name','Phone','Age / Gender','Tags'].map(h => (
                          <th key={h} style={{ textAlign: 'left', padding: '10px 18px', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--muted)', fontWeight: 500, borderBottom: '1px solid var(--border)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {tagFiltered.map(p => (
                        <tr key={p.id} style={{ borderBottom: '1px solid var(--border)', background: selected.has(p.id) ? 'var(--teal-light)' : 'transparent', transition: 'background 0.1s' }}>
                          <td style={{ padding: '12px 18px' }}>
                            <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSelect(p.id)}
                              style={{ cursor: 'pointer', width: 15, height: 15 }} />
                          </td>
                          <td style={{ padding: '12px 18px' }}>
                            <div style={{ fontWeight: 500, fontSize: 14, color: 'var(--navy)', cursor: 'pointer' }}
                              onClick={() => navigate(`/patients/${p.id}`)}>
                              {p.name}
                            </div>
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
            </>
          )}

          {/* ─── HISTORY SUB-TAB ─── */}
          {campaignSubTab === 'history' && (
            <>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                <Btn variant="ghost" small onClick={loadHistory} disabled={historyLoading}>
                  {historyLoading ? 'Refreshing…' : '↻ Refresh'}
                </Btn>
              </div>

              {historyLoading ? (
                <Empty icon="⏳" message="Loading campaign history…" />
              ) : history.length === 0 ? (
                <Empty icon="📋" message="No campaigns sent yet. Use the Send tab to reach your patients." />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {history.map(record => {
                    const isExpanded  = expandedHistory.has(record.id)
                    const sentRecips  = (record.recipients || []).filter(r => r.status === 'sent')
                    const failRecips  = (record.recipients || []).filter(r => r.status === 'failed')
                    const sentCount   = record.sentCount   ?? sentRecips.length
                    const failedCount = record.failedCount ?? failRecips.length

                    return (
                      <Card key={record.id}>
                        <div style={{ padding: '16px 20px' }}>
                          {/* Top row */}
                          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)', marginBottom: 3 }}>
                                {record.name || record.templateName || 'Campaign'}
                              </div>
                              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
                                {formatSentAt(record.sentAt)} · by {record.sentBy || '—'}
                              </div>
                              {/* Stat pills */}
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20, background: '#D1FAE5', color: '#065F46', fontWeight: 600 }}>
                                  ✓ {sentCount} sent
                                </span>
                                {failedCount > 0 && (
                                  <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20, background: '#FEE2E2', color: '#991B1B', fontWeight: 600 }}>
                                    ✗ {failedCount} failed
                                  </span>
                                )}
                                <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20, background: 'var(--bg)', color: 'var(--slate)', fontWeight: 600 }}>
                                  👥 {record.audienceSize} audience
                                </span>
                                {(record.tagFilters || []).length > 0 && (
                                  <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20, background: 'var(--teal-light)', color: 'var(--teal)', fontWeight: 600 }}>
                                    🏷 {record.tagFilters.map(t => TAG_LABELS[t] || t).join(', ')}
                                  </span>
                                )}
                              </div>
                            </div>
                            {/* Right side meta */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'flex-end', flexShrink: 0 }}>
                              <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                                Template: <code style={{ background: 'var(--bg)', padding: '1px 6px', borderRadius: 4 }}>{record.templateName}</code>
                              </div>
                              {record.mediaAttached && (
                                <div style={{ fontSize: 11, color: '#6366F1' }}>📎 {record.mediaAttached.filename || 'Media attached'}</div>
                              )}
                              <div style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>
                                Delivered/Read — webhook needed
                              </div>
                            </div>
                          </div>

                          {/* Expand/collapse recipients */}
                          {(record.recipients?.length > 0) && (
                            <button type="button" onClick={() => {
                              setExpandedHistory(s => {
                                const n = new Set(s)
                                n.has(record.id) ? n.delete(record.id) : n.add(record.id)
                                return n
                              })
                            }} style={{
                              marginTop: 12, background: 'none', border: '1.5px solid var(--border)',
                              borderRadius: 8, padding: '6px 14px', fontSize: 12, cursor: 'pointer',
                              color: 'var(--slate)', fontFamily: 'DM Sans, sans-serif', fontWeight: 500
                            }}>
                              {isExpanded ? '▲ Hide recipients' : `▼ ${record.recipients.length} recipients`}
                            </button>
                          )}

                          {/* Recipient table */}
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
                                        <span style={{
                                          padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700,
                                          background: r.status === 'sent' ? '#D1FAE5' : '#FEE2E2',
                                          color:      r.status === 'sent' ? '#065F46' : '#991B1B',
                                        }}>
                                          {r.status === 'sent' ? '✓ Sent' : '✗ Failed'}
                                        </span>
                                      </td>
                                      <td style={{ padding: '8px 14px', color: 'var(--muted)', fontStyle: r.error ? 'normal' : 'italic', fontSize: 11 }}>
                                        {r.error || (r.status === 'sent' ? 'Delivered/Read unknown' : '—')}
                                      </td>
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
            </>
          )}
        </>
      )}

      {/* ═══════════════ WA SEND MODAL ═══════════════ */}
      {showWAModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'white', borderRadius: 16, padding: 28, maxWidth: 520, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', maxHeight: '90vh', overflowY: 'auto' }}>

            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--navy)', marginBottom: 4 }}>📱 Send WhatsApp Campaign</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20 }}>
              Sending to <strong>{selected.size} patient{selected.size !== 1 ? 's' : ''}</strong>
              {filterTag ? ` tagged as ${TAG_LABELS[filterTag] || filterTag}` : ''}
            </div>

            {allCampaigns.length === 0 ? (
              <div style={{ background: '#FFF7ED', border: '1px solid #F97316', borderRadius: 10, padding: '14px 16px', fontSize: 13, color: '#9A3412' }}>
                ⚠ No campaigns configured. Go to <strong>Settings → WhatsApp → Campaigns</strong>.
              </div>
            ) : (
              <>
                {/* Template picker */}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 8 }}>Select Template</label>
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
                          fontFamily: 'DM Sans, sans-serif', transition: 'all 0.15s',
                          opacity: isEnabled ? 1 : 0.5,
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
                </div>

                {/* Auto-filled + manual params */}
                {selectedTemplate && (() => {
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
                          {manualSlots.map(({ slot, variable }) => (
                            <div key={slot} style={{ marginBottom: 10 }}>
                              <label style={{ fontSize: 12, color: 'var(--slate)', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                                {`{{${slot}}}`}{variable && variable !== '__custom__' ? ` — ${variable}` : ''}
                              </label>
                              <input
                                type="text"
                                value={customParams[slot] || ''}
                                onChange={e => setCustomParams(cp => ({ ...cp, [slot]: e.target.value }))}
                                placeholder={`e.g. ${slot === 2 ? '18/3/2026 or Free Diabetes Camp' : `Value for param ${slot}`}`}
                                style={{ width: '100%', border: '1.5px solid var(--border)', borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none', fontFamily: 'DM Sans, sans-serif', color: 'var(--navy)', boxSizing: 'border-box' }}
                                onFocus={e => e.target.style.borderColor = 'var(--teal)'}
                                onBlur={e => e.target.style.borderColor = 'var(--border)'}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )
                })()}

                {/* Message preview bubble */}
                {selectedTemplate && (
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 8 }}>
                      Message Preview
                    </label>
                    <div style={{ background: '#ECF0F1', borderRadius: 12, padding: '12px 14px' }}>
                      <div style={{ fontSize: 11, color: '#8FA3AE', marginBottom: 8 }}>📱 {selectedTemplate.name}</div>
                      {selectedTemplate.templateBody ? (
                        <WABubble body={selectedTemplate.templateBody} params={buildParams('Patient Name', getParamCount(selectedTemplate))} />
                      ) : (
                        <div style={{ background: '#fff', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
                          <em>No template body saved.</em> Go to Settings → WhatsApp → Campaigns to add a preview body.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {waError && (
                  <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#B91C1C', marginBottom: 14 }}>
                    ⚠ {waError}
                  </div>
                )}
              </>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button onClick={closeWAModal} style={{
                flex: 1, padding: '11px', borderRadius: 10, border: '1.5px solid var(--border)',
                background: 'none', cursor: 'pointer', fontSize: 13, fontFamily: 'DM Sans, sans-serif', color: 'var(--slate)'
              }}>Cancel</button>
              <button
                onClick={handleBulkWA}
                disabled={!selectedTemplate || selectedTemplate?.enabled === false || waSending}
                style={{
                  flex: 2, padding: '11px', borderRadius: 10, border: 'none',
                  background: 'var(--teal)', color: 'white', cursor: 'pointer',
                  fontSize: 13, fontWeight: 700, fontFamily: 'DM Sans, sans-serif',
                  opacity: (!selectedTemplate || selectedTemplate?.enabled === false || waSending) ? 0.5 : 1
                }}
              >
                {waSending ? 'Sending…' : `Send to ${selected.size} patient${selected.size !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
