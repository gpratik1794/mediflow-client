// src/pages/admin/AdminClients.jsx
import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import AdminLayout from '../../components/AdminLayout'
import { getClients, getSubscriptionStatus, PLANS } from '../../firebase/adminDb'

const STATUS_STYLE = {
  active:      { bg: '#E6F7F0', color: '#27AE7A', label: 'Active' },
  trial:       { bg: '#FEF6E7', color: '#F5A623', label: 'Free Trial' },
  expired:     { bg: '#FDEAEA', color: '#E05252', label: 'Expired' },
  deactivated: { bg: '#F4F7F9', color: '#8FA3AE', label: 'Deactivated' },
  unknown:     { bg: '#F4F7F9', color: '#8FA3AE', label: 'Unknown' },
}

function StatusBadge({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.unknown
  return (
    <span style={{
      padding: '3px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600,
      background: s.bg, color: s.color, display: 'inline-flex', alignItems: 'center', gap: 5
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.color }} />
      {s.label}
    </span>
  )
}

export default function AdminClients() {
  const navigate = useNavigate()
  const [clients, setClients]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [filter, setFilter]     = useState('all')
  const [search, setSearch]     = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const data = await getClients()
    setClients(data)
    setLoading(false)
  }

  const filtered = clients.filter(c => {
    const status = getSubscriptionStatus(c)
    const matchFilter = filter === 'all' || status === filter
    const matchSearch = !search ||
      c.centreName?.toLowerCase().includes(search.toLowerCase()) ||
      c.ownerName?.toLowerCase().includes(search.toLowerCase()) ||
      c.email?.toLowerCase().includes(search.toLowerCase())
    return matchFilter && matchSearch
  })

  const counts = {
    all: clients.length,
    active: clients.filter(c => getSubscriptionStatus(c) === 'active').length,
    trial: clients.filter(c => getSubscriptionStatus(c) === 'trial').length,
    expired: clients.filter(c => getSubscriptionStatus(c) === 'expired').length,
    deactivated: clients.filter(c => getSubscriptionStatus(c) === 'deactivated').length,
  }

  return (
    <AdminLayout
      title="Clients"
      action={
        <button onClick={() => navigate('/admin/clients/new')} style={{
          padding: '10px 20px', background: 'var(--teal)', color: '#fff',
          border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 14,
          fontWeight: 600, fontFamily: 'DM Sans, sans-serif'
        }}>
          + Add Client
        </button>
      }
    >
      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Total Clients', value: counts.all, color: '#0B9E8A', bg: '#E6F7F5' },
          { label: 'Active (Paid)', value: counts.active, color: '#27AE7A', bg: '#E6F7F0' },
          { label: 'Free Trial', value: counts.trial, color: '#F5A623', bg: '#FEF6E7' },
          { label: 'Expired / Inactive', value: counts.expired + counts.deactivated, color: '#E05252', bg: '#FDEAEA' },
        ].map(s => (
          <div key={s.label} style={{
            background: s.bg, borderRadius: 14, padding: '20px 22px',
          }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 12, color: '#4A5E6D', marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)', overflow: 'hidden' }}>
        {/* Toolbar */}
        <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          {/* Filter tabs */}
          <div style={{ display: 'flex', gap: 6 }}>
            {[
              { key: 'all', label: `All (${counts.all})` },
              { key: 'active', label: `Active (${counts.active})` },
              { key: 'trial', label: `Trial (${counts.trial})` },
              { key: 'expired', label: `Expired (${counts.expired})` },
              { key: 'deactivated', label: `Deactivated (${counts.deactivated})` },
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
          {/* Search */}
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="🔍 Search name, email…"
            style={{
              border: '1.5px solid var(--border)', borderRadius: 8,
              padding: '7px 14px', fontSize: 13, outline: 'none',
              fontFamily: 'DM Sans, sans-serif', color: 'var(--navy)', width: 220
            }}
          />
        </div>

        {loading ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--muted)' }}>Loading clients…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--muted)' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🏢</div>
            No clients found. <button onClick={() => navigate('/admin/clients/new')} style={{ color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, fontFamily: 'DM Sans, sans-serif' }}>Add the first one →</button>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg)' }}>
                {['Centre Name', 'Owner / Email', 'Plan', 'Subscription', 'Payment', 'Status', ''].map(h => (
                  <th key={h} style={{
                    textAlign: 'left', padding: '11px 18px', fontSize: 11,
                    textTransform: 'uppercase', letterSpacing: 0.8,
                    color: 'var(--muted)', fontWeight: 500,
                    borderBottom: '1px solid var(--border)'
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(client => {
                const status = getSubscriptionStatus(client)
                const plan = PLANS[client.plan]
                return (
                  <tr key={client.id}
                    style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                    onClick={() => navigate(`/admin/clients/${client.id}`)}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--teal-light)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '14px 18px' }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--navy)' }}>{client.centreName}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                        {client.centreType === 'both' ? '🧪 Lab + 🩺 Clinic'
                         : client.centreType === 'diagnostic' ? '🧪 Diagnostic'
                         : '🩺 Clinic'}
                      </div>
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      <div style={{ fontSize: 13, color: 'var(--navy)' }}>{client.ownerName}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{client.email}</div>
                    </td>
                    <td style={{ padding: '14px 18px', fontSize: 13, color: 'var(--slate)' }}>
                      {plan ? plan.label : client.plan || '—'}
                      {plan && <div style={{ fontSize: 11, color: 'var(--teal)' }}>₹{plan.price}/mo</div>}
                    </td>
                    <td style={{ padding: '14px 18px', fontSize: 12, color: 'var(--slate)' }}>
                      <div>{client.subscriptionStartDate || '—'}</div>
                      <div style={{ color: 'var(--muted)' }}>→ {client.subscriptionEndDate || 'No end date'}</div>
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      <span style={{
                        padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                        background: client.paid ? '#E6F7F0' : '#FEF6E7',
                        color: client.paid ? '#27AE7A' : '#F5A623'
                      }}>
                        {client.paid ? '✓ Paid' : 'Unpaid'}
                      </span>
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      <StatusBadge status={status} />
                    </td>
                    <td style={{ padding: '14px 18px', color: 'var(--teal)', fontSize: 18 }}>›</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </AdminLayout>
  )
}
