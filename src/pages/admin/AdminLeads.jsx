// src/pages/admin/AdminLeads.jsx
import React, { useState, useEffect } from 'react'
import AdminLayout from '../../components/AdminLayout'
import { getLeads, updateLead, deleteLead } from '../../firebase/adminDb'
import { useNavigate } from 'react-router-dom'

const INTENT_COLORS = {
  appointment: { bg: '#E6F7F5', color: '#0B9E8A', label: 'Appointment' },
  report:      { bg: '#FEF6E7', color: '#F5A623', label: 'Report Query' },
  price:       { bg: '#F5EEF8', color: '#9B59B6', label: 'Price Enquiry' },
  general:     { bg: '#F4F7F9', color: '#8FA3AE', label: 'General' },
  new:         { bg: '#E6F7F0', color: '#27AE7A', label: 'New Lead' },
}

const STATUS_COLORS = {
  new:         { bg: '#E6F7F0', color: '#27AE7A', label: 'New' },
  contacted:   { bg: '#FEF6E7', color: '#F5A623', label: 'Contacted' },
  converted:   { bg: '#E6F7F5', color: '#0B9E8A', label: 'Converted' },
  closed:      { bg: '#F4F7F9', color: '#8FA3AE', label: 'Closed' },
}

export default function AdminLeads() {
  const navigate = useNavigate()
  const [leads, setLeads]     = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter]   = useState('all')
  const [selected, setSelected] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const data = await getLeads()
    setLeads(data)
    setLoading(false)
  }

  async function updateStatus(phone, status) {
    await updateLead(phone, { status })
    setLeads(l => l.map(x => x.id === phone.replace(/\D/g, '') ? { ...x, status } : x))
    if (selected?.id === phone.replace(/\D/g, '')) setSelected(s => ({ ...s, status }))
  }

  async function handleDelete(phone) {
    if (!window.confirm('Remove this lead?')) return
    await deleteLead(phone)
    setLeads(l => l.filter(x => x.id !== phone.replace(/\D/g, '')))
    setSelected(null)
  }

  const filtered = leads.filter(l => filter === 'all' || l.status === filter)

  const counts = {
    new: leads.filter(l => l.status === 'new' || !l.status).length,
    contacted: leads.filter(l => l.status === 'contacted').length,
    converted: leads.filter(l => l.status === 'converted').length,
    closed: leads.filter(l => l.status === 'closed').length,
  }

  return (
    <AdminLayout title="Leads Inbox" action={
      <button onClick={load} style={{
        padding: '8px 16px', background: 'var(--bg)', border: '1.5px solid var(--border)',
        borderRadius: 8, cursor: 'pointer', fontSize: 13, fontFamily: 'DM Sans, sans-serif', color: 'var(--slate)'
      }}>↻ Refresh</button>
    }>
      {/* Info banner */}
      <div style={{ background: '#E6F7F5', borderRadius: 12, padding: '14px 20px', marginBottom: 24, fontSize: 13, color: '#0B9E8A', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <span style={{ fontSize: 18 }}>ℹ</span>
        <div>
          <strong>How leads are captured:</strong> When someone messages your WhatsApp number for the first time, AiSynergy sends a webhook to your Cloudflare Worker. The Worker checks if they're an existing patient — if not, they appear here as a new lead.
          <br />Keyword detection automatically tags intent: "appointment", "book", "test", "report", "price/fee".
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 20 }}>

        {/* Leads List */}
        <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)', overflow: 'hidden' }}>
          {/* Filters */}
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8 }}>
            {[
              { key: 'all', label: `All (${leads.length})` },
              { key: 'new', label: `New (${counts.new})` },
              { key: 'contacted', label: `Contacted (${counts.contacted})` },
              { key: 'converted', label: `Converted (${counts.converted})` },
              { key: 'closed', label: `Closed (${counts.closed})` },
            ].map(f => (
              <button key={f.key} onClick={() => setFilter(f.key)} style={{
                padding: '5px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
                fontSize: 11, fontFamily: 'DM Sans, sans-serif',
                background: filter === f.key ? 'var(--navy)' : 'var(--bg)',
                color: filter === f.key ? '#fff' : 'var(--slate)',
                fontWeight: filter === f.key ? 600 : 400
              }}>{f.label}</button>
            ))}
          </div>

          {loading ? (
            <div style={{ padding: 60, textAlign: 'center', color: 'var(--muted)' }}>Loading leads…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 60, textAlign: 'center', color: 'var(--muted)' }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>📥</div>
              <div>No leads yet. Set up the AiSynergy webhook to start capturing inbound messages.</div>
            </div>
          ) : (
            filtered.map(lead => {
              const intent = lead.intent || 'general'
              const ic = INTENT_COLORS[intent] || INTENT_COLORS.general
              const sc = STATUS_COLORS[lead.status || 'new'] || STATUS_COLORS.new
              const isSelected = selected?.id === lead.id
              return (
                <div key={lead.id}
                  onClick={() => setSelected(lead)}
                  style={{
                    padding: '14px 20px', borderBottom: '1px solid var(--border)',
                    cursor: 'pointer', display: 'flex', gap: 14, alignItems: 'flex-start',
                    background: isSelected ? 'var(--teal-light)' : 'transparent',
                    borderLeft: isSelected ? '3px solid var(--teal)' : '3px solid transparent'
                  }}
                >
                  <div style={{
                    width: 42, height: 42, borderRadius: 12, flexShrink: 0,
                    background: ic.bg, color: ic.color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 16, fontWeight: 700
                  }}>
                    {(lead.profileName || lead.phone || '?').charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--navy)' }}>
                        {lead.profileName || 'Unknown'}
                      </div>
                      <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 600, background: sc.bg, color: sc.color, flexShrink: 0 }}>
                        {sc.label}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>
                      +{lead.id} · {lead.messageCount || 1} message{lead.messageCount > 1 ? 's' : ''}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--slate)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {lead.lastMessage || '(no message text)'}
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 10, background: ic.bg, color: ic.color, fontWeight: 600 }}>
                        {ic.label}
                      </span>
                      {lead.repliedToCampaign && (
                        <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 10, background: '#E6F7F5', color: '#0B9E8A', fontWeight: 600 }}>
                          Campaign: {lead.repliedToCampaign}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Lead Detail Panel */}
        <div>
          {selected ? (
            <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)', overflow: 'hidden', position: 'sticky', top: 20 }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)' }}>Lead Details</div>
                <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--muted)' }}>×</button>
              </div>

              <div style={{ padding: '20px' }}>
                {/* Avatar */}
                <div style={{ textAlign: 'center', marginBottom: 20 }}>
                  <div style={{
                    width: 56, height: 56, borderRadius: 16, margin: '0 auto 12px',
                    background: 'var(--teal-light)', color: 'var(--teal)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 24, fontWeight: 700
                  }}>
                    {(selected.profileName || '?').charAt(0).toUpperCase()}
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--navy)' }}>{selected.profileName || 'Unknown'}</div>
                  <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>+{selected.id}</div>
                </div>

                {/* Info */}
                {[
                  ['WhatsApp Number', `+${selected.id}`],
                  ['Display Name', selected.profileName || '—'],
                  ['Messages', selected.messageCount || 1],
                  ['Intent', selected.intent || 'general'],
                  ['Replied to Campaign', selected.repliedToCampaign || '—'],
                  ['First Contact', selected.createdAt?.toDate?.()?.toLocaleDateString() || '—'],
                  ['Last Message', selected.lastMessageAt?.toDate?.()?.toLocaleDateString() || '—'],
                ].map(([l, v]) => (
                  <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ color: 'var(--muted)' }}>{l}</span>
                    <span style={{ fontWeight: 500, color: 'var(--navy)', textAlign: 'right', maxWidth: 180 }}>{v}</span>
                  </div>
                ))}

                {selected.lastMessage && (
                  <div style={{ margin: '16px 0', padding: '12px 14px', background: 'var(--bg)', borderRadius: 10, fontSize: 13, color: 'var(--slate)', fontStyle: 'italic' }}>
                    "{selected.lastMessage}"
                  </div>
                )}

                {/* Status update */}
                <div style={{ marginTop: 16, marginBottom: 12 }}>
                  <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 500, display: 'block', marginBottom: 8 }}>UPDATE STATUS</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {Object.entries(STATUS_COLORS).map(([key, s]) => (
                      <button key={key} onClick={() => updateStatus(selected.id, key)} style={{
                        padding: '6px 14px', borderRadius: 20, border: '1.5px solid',
                        borderColor: selected.status === key ? s.color : 'var(--border)',
                        background: selected.status === key ? s.bg : 'none',
                        color: selected.status === key ? s.color : 'var(--slate)',
                        fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
                        fontWeight: selected.status === key ? 600 : 400
                      }}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <a href={`https://wa.me/${selected.id}`} target="_blank" rel="noreferrer" style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  padding: '11px', background: '#25D366', color: '#fff',
                  borderRadius: 10, fontSize: 13, fontWeight: 600, textDecoration: 'none',
                  marginBottom: 10
                }}>
                  💬 Open in WhatsApp
                </a>

                <button onClick={() => navigate(`/admin/clients/new`)} style={{
                  width: '100%', padding: '11px', background: 'var(--teal)', color: '#fff',
                  border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                  fontFamily: 'DM Sans, sans-serif', marginBottom: 10
                }}>
                  → Convert to Client
                </button>

                <button onClick={() => handleDelete(selected.id)} style={{
                  width: '100%', padding: '11px', background: '#FDEAEA', color: '#E05252',
                  border: '1.5px solid #E05252', borderRadius: 10, cursor: 'pointer', fontSize: 13,
                  fontFamily: 'DM Sans, sans-serif'
                }}>
                  🗑 Remove Lead
                </button>
              </div>
            </div>
          ) : (
            <div style={{
              background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)',
              padding: 40, textAlign: 'center', color: 'var(--muted)'
            }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>👈</div>
              <div>Select a lead to view details</div>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  )
}
