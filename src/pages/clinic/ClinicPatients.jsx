// src/pages/clinic/ClinicPatients.jsx
import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../utils/AuthContext'
import Layout from '../../components/Layout'
import { Card, CardHeader, Btn, Empty } from '../../components/UI'
import { collection, query, orderBy, getDocs } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { sendCampaign } from '../../firebase/whatsapp'

const TAG_LABELS = { diabetes:'Diabetes', hypert:'Hypertension', thyroid:'Thyroid', asthma:'Asthma', cardiac:'Cardiac', ortho:'Ortho', peds:'Paeds', obesity:'Obesity' }
const TAG_COLORS = { diabetes:'#F59E0B', hypert:'#EF4444', thyroid:'#8B5CF6', asthma:'#3B82F6', cardiac:'#EC4899', ortho:'#10B981', peds:'#06B6D4', obesity:'#F97316' }
const ALL_TAGS = Object.keys(TAG_LABELS)

function maskPhone(phone) {
  if (!phone) return ''
  const p = String(phone).replace(/[^0-9]/g,'')
  if (p.length < 6) return '••••••'
  return p.slice(0, 2) + '••••••' + p.slice(-2)
}

export default function ClinicPatients() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [patients, setPatients] = useState([])
  const [search, setSearch]     = useState('')
  const [loading, setLoading]   = useState(true)
  const [activeTab, setActiveTab] = useState('marketing')

  // Marketing tab state
  const [filterTag, setFilterTag]   = useState('')
  const [selected, setSelected]     = useState(new Set())
  const [showWAModal, setShowWAModal] = useState(false)
  const [waSending, setWaSending]   = useState(false)
  const [waSentCount, setWaSentCount] = useState(null)

  // ── NEW: template selection state ──
  const [selectedTemplate, setSelectedTemplate] = useState(null)

  useEffect(() => { loadPatients() }, [user])

  async function loadPatients() {
    setLoading(true)
    try {
      const q = query(collection(db, 'centres', user.uid, 'patients'), orderBy('name', 'asc'))
      const snap = await getDocs(q)
      setPatients(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  const filtered = patients.filter(p =>
    p.name?.toLowerCase().includes(search.toLowerCase()) ||
    p.phone?.includes(search)
  )

  const tagFiltered = filterTag
    ? patients.filter(p => (p.tags || []).includes(filterTag))
    : patients

  // ── NEW: pull only marketing templates from profile campaigns ──
  // A campaign is a marketing template if its name includes 'marketing' (case-insensitive)
  const allCampaigns = profile?.whatsappCampaigns || []
  const marketingTemplates = allCampaigns.filter(c =>
    c.name?.toLowerCase().includes('marketing')
  )

  function toggleSelect(id) {
    setSelected(s => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  function toggleAll() {
    if (selected.size === tagFiltered.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(tagFiltered.map(p => p.id)))
    }
  }

  function openWAModal() {
    setSelectedTemplate(marketingTemplates.length > 0 ? marketingTemplates[0] : null)
    setShowWAModal(true)
  }

  async function handleBulkWA() {
    if (!selectedTemplate || selected.size === 0) return
    setWaSending(true)
    const campaigns = profile?.whatsappCampaigns || []
    let sent = 0
    const selectedPatients = tagFiltered.filter(p => selected.has(p.id))
    for (const p of selectedPatients) {
      if (!p.phone) continue
      try {
        const result = await sendCampaign(
          campaigns,
          selectedTemplate.name,
          p.phone,
          [p.name],
          null,
          { centreId: user.uid, patientName: p.name }
        )
        if (result.ok) sent++
      } catch (e) { console.warn('WA send failed for', p.phone) }
    }
    setWaSending(false)
    setWaSentCount(sent)
    setShowWAModal(false)
    setSelectedTemplate(null)
    setSelected(new Set())
  }

  // ── CSV Export ──
  function exportCSV() {
    const rows = [['Name','Phone','Age','Gender','Tags','Last Visit']]
    filtered.forEach(p => rows.push([p.name, p.phone, p.age, p.gender, (p.tags||[]).join(';'), p.lastClinicVisit||'']))
    const csv = rows.map(r => r.map(v => `"${v||''}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'patients.csv'; a.click()
  }

  return (
    <Layout title="Marketing"
      action={
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn variant="ghost" small onClick={exportCSV}>⬇ Export CSV</Btn>
          <Btn onClick={() => navigate('/clinic/appointments/new')}>+ New Appointment</Btn>
        </div>
      }
    >
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '1px solid var(--border)' }}>
        {[['marketing','📣 Campaigns'], ['patients','👥 Patients']].map(([tab, label]) => (
          <button key={tab} onClick={() => { setActiveTab(tab); setWaSentCount(null) }} style={{
            padding: '10px 20px', background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: activeTab === tab ? 700 : 400,
            color: activeTab === tab ? 'var(--teal)' : 'var(--slate)',
            borderBottom: `2.5px solid ${activeTab === tab ? 'var(--teal)' : 'transparent'}`,
            fontFamily: 'DM Sans, sans-serif', marginBottom: -1, transition: 'all 0.15s'
          }}>{label}</button>
        ))}
      </div>

      {/* ── PATIENTS TAB ── */}
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
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={{ padding: '13px 18px' }}><div style={{ fontWeight: 500, fontSize: 14, color: 'var(--navy)' }}>{p.name}</div></td>
                      <td style={{ padding: '13px 18px', fontSize: 13, color: 'var(--slate)' }}>{maskPhone(p.phone)}</td>
                      <td style={{ padding: '13px 18px', fontSize: 13, color: 'var(--slate)' }}>{p.age ? `${p.age}y` : '—'} {p.gender ? `· ${p.gender}` : ''}</td>
                      <td style={{ padding: '13px 18px' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {(p.tags || []).map(tag => (
                            <span key={tag} style={{ padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 600, background: (TAG_COLORS[tag]||'var(--teal)') + '20', color: TAG_COLORS[tag]||'var(--teal)' }}>
                              {TAG_LABELS[tag] || tag}
                            </span>
                          ))}
                        </div>
                      </td>
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

      {/* ── MARKETING TAB ── */}
      {activeTab === 'marketing' && (
        <>
          {waSentCount !== null && (
            <div style={{ marginBottom: 16, padding: '12px 18px', background: '#D1FAE5', borderRadius: 10, fontSize: 13, color: '#065F46', fontWeight: 500 }}>
              ✓ WhatsApp sent to {waSentCount} patient{waSentCount !== 1 ? 's' : ''}
            </div>
          )}

          {/* ── NEW: no templates warning ── */}
          {marketingTemplates.length === 0 && (
            <div style={{ marginBottom: 16, padding: '12px 18px', background: '#FFF7ED', border: '1px solid #F97316', borderRadius: 10, fontSize: 13, color: '#9A3412' }}>
              ⚠ No marketing templates found. Go to <strong>Settings → WhatsApp Campaigns</strong> and add a campaign with "marketing" in the name, approved by AiSynergy.
            </div>
          )}

          {/* Tag filter */}
          <Card>
            <CardHeader title="Filter by Tag" />
            <div style={{ padding: '14px 18px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button onClick={() => { setFilterTag(''); setSelected(new Set()) }} style={{
                padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                border: `1.5px solid ${!filterTag ? 'var(--teal)' : 'var(--border)'}`,
                background: !filterTag ? 'var(--teal-light)' : 'none',
                color: !filterTag ? 'var(--teal)' : 'var(--slate)', fontFamily: 'DM Sans, sans-serif'
              }}>All ({patients.length})</button>
              {ALL_TAGS.map(tag => {
                const count = patients.filter(p => (p.tags||[]).includes(tag)).length
                if (count === 0) return null
                const on = filterTag === tag
                return (
                  <button key={tag} onClick={() => { setFilterTag(on ? '' : tag); setSelected(new Set()) }} style={{
                    padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    border: `1.5px solid ${on ? TAG_COLORS[tag] : 'var(--border)'}`,
                    background: on ? TAG_COLORS[tag] + '20' : 'none',
                    color: on ? TAG_COLORS[tag] : 'var(--slate)', fontFamily: 'DM Sans, sans-serif'
                  }}>{TAG_LABELS[tag]} ({count})</button>
                )
              })}
            </div>
          </Card>

          {/* Patient list with checkboxes */}
          <Card>
            <CardHeader
              title={`${filterTag ? TAG_LABELS[filterTag] : 'All'} Patients (${tagFiltered.length})`}
              action={
                selected.size > 0 && (
                  <Btn small onClick={openWAModal} disabled={marketingTemplates.length === 0}>
                    📱 Send WhatsApp ({selected.size})
                  </Btn>
                )
              }
            />
            {tagFiltered.length === 0 ? (
              <Empty icon="🏷" message={`No patients tagged as ${TAG_LABELS[filterTag] || filterTag}`} />
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
                      <td style={{ padding: '12px 18px' }}><div style={{ fontWeight: 500, fontSize: 14, color: 'var(--navy)', cursor: 'pointer' }} onClick={() => navigate(`/patients/${p.id}`)}>{p.name}</div></td>
                      <td style={{ padding: '12px 18px', fontSize: 13, color: 'var(--slate)' }}>{maskPhone(p.phone)}</td>
                      <td style={{ padding: '12px 18px', fontSize: 13, color: 'var(--slate)' }}>{p.age ? `${p.age}y` : '—'} {p.gender ? `· ${p.gender}` : ''}</td>
                      <td style={{ padding: '12px 18px' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {(p.tags || []).map(tag => (
                            <span key={tag} style={{ padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 600, background: (TAG_COLORS[tag]||'var(--teal)') + '20', color: TAG_COLORS[tag]||'var(--teal)' }}>
                              {TAG_LABELS[tag] || tag}
                            </span>
                          ))}
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

      {/* ── WA SEND MODAL — template picker ── */}
      {showWAModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'white', borderRadius: 16, padding: 28, maxWidth: 480, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--navy)', marginBottom: 4 }}>📱 Send WhatsApp Campaign</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20 }}>
              Sending to <strong>{selected.size} patient{selected.size !== 1 ? 's' : ''}</strong>
              {filterTag ? ` tagged as ${TAG_LABELS[filterTag]}` : ''}
            </div>

            {marketingTemplates.length === 0 ? (
              <div style={{ background: '#FFF7ED', border: '1px solid #F97316', borderRadius: 10, padding: '14px 16px', fontSize: 13, color: '#9A3412', marginBottom: 20 }}>
                ⚠ No marketing templates configured. Go to <strong>Settings → WhatsApp Campaigns</strong> and add a campaign with "marketing" in the name.
              </div>
            ) : (
              <>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 8 }}>
                    Select Template
                  </label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {marketingTemplates.map(t => (
                      <button
                        key={t.name}
                        type="button"
                        onClick={() => setSelectedTemplate(t)}
                        style={{
                          padding: '12px 14px', borderRadius: 10, textAlign: 'left', cursor: 'pointer',
                          border: `1.5px solid ${selectedTemplate?.name === t.name ? 'var(--teal)' : 'var(--border)'}`,
                          background: selectedTemplate?.name === t.name ? 'var(--teal-light)' : 'var(--surface)',
                          fontFamily: 'DM Sans, sans-serif', transition: 'all 0.15s'
                        }}
                      >
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)', marginBottom: 2 }}>
                          {selectedTemplate?.name === t.name ? '● ' : '○ '}{t.name}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                          {t.paramCount ? `${t.paramCount} param${t.paramCount !== 1 ? 's' : ''}` : 'Template'} · Patient name auto-filled as param 1
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {selectedTemplate && (
                  <div style={{ background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#166534', marginBottom: 18 }}>
                    ✓ Template <strong>{selectedTemplate.name}</strong> selected. Patient name will be sent as param 1 automatically.
                  </div>
                )}
              </>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { setShowWAModal(false); setSelectedTemplate(null) }} style={{
                flex: 1, padding: '11px', borderRadius: 10, border: '1.5px solid var(--border)',
                background: 'none', cursor: 'pointer', fontSize: 13, fontFamily: 'DM Sans, sans-serif', color: 'var(--slate)'
              }}>Cancel</button>
              <button
                onClick={handleBulkWA}
                disabled={!selectedTemplate || waSending || marketingTemplates.length === 0}
                style={{
                  flex: 2, padding: '11px', borderRadius: 10, border: 'none',
                  background: 'var(--teal)', color: 'white', cursor: 'pointer',
                  fontSize: 13, fontWeight: 700, fontFamily: 'DM Sans, sans-serif',
                  opacity: (!selectedTemplate || waSending || marketingTemplates.length === 0) ? 0.5 : 1
                }}
              >
                {waSending ? 'Sending…' : `Send to ${selected.size} patients`}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
