// src/pages/AdminOverview.jsx
import React, { useState, useEffect } from 'react'
import AdminLayout from '../components/AdminLayout'
import { getClients, PLANS, getSubscriptionStatus } from '../firebase/adminDb'

function StatCard({ icon, label, value, color }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 14, padding: '20px 24px',
      display: 'flex', alignItems: 'center', gap: 16
    }}>
      <div style={{ fontSize: 28 }}>{icon}</div>
      <div>
        <div style={{ fontSize: 26, fontWeight: 700, color: color || 'var(--navy)', lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{label}</div>
      </div>
    </div>
  )
}

export default function AdminOverview() {
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getClients().then(data => { setClients(data); setLoading(false) })
  }, [])

  const active      = clients.filter(c => getSubscriptionStatus(c) === 'active').length
  const trial       = clients.filter(c => getSubscriptionStatus(c) === 'trial').length
  const expired     = clients.filter(c => getSubscriptionStatus(c) === 'expired').length
  const deactivated = clients.filter(c => getSubscriptionStatus(c) === 'deactivated').length
  const paid        = clients.filter(c => c.paid).length
  const withVaccine = clients.filter(c => c.modules?.vaccination).length

  const clinicCount     = clients.filter(c => c.centreType === 'clinic').length
  const diagnosticCount = clients.filter(c => c.centreType === 'diagnostic').length
  const bothCount       = clients.filter(c => c.centreType === 'both').length

  const mrr = clients
    .filter(c => c.paid && getSubscriptionStatus(c) === 'active')
    .reduce((sum, c) => sum + (PLANS[c.plan]?.price || 0), 0)

  return (
    <AdminLayout title="Overview">
      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--muted)' }}>Loading…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* MRR highlight */}
          <div style={{ background: 'var(--navy)', borderRadius: 16, padding: '24px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 6 }}>MONTHLY RECURRING REVENUE</div>
              <div style={{ fontSize: 36, fontWeight: 700, color: '#fff' }}>₹{mrr.toLocaleString('en-IN')}</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>{paid} paid clients</div>
            </div>
            <div style={{ fontSize: 48 }}>💰</div>
          </div>

          {/* Stat grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            <StatCard icon="🏢" label="Total Clients"    value={clients.length} />
            <StatCard icon="✅" label="Active"           value={active}      color="#16A34A" />
            <StatCard icon="🔄" label="Trial"            value={trial}       color="#D97706" />
            <StatCard icon="⚠️" label="Expired"          value={expired}     color="#DC2626" />
            <StatCard icon="🔒" label="Deactivated"      value={deactivated} color="#6B7280" />
            <StatCard icon="💉" label="With Vaccination" value={withVaccine} color="var(--teal)" />
          </div>

          {/* Centre type breakdown */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px 24px' }}>
            <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--muted)', marginBottom: 16 }}>Centre Type Breakdown</div>
            <div style={{ display: 'flex', gap: 24 }}>
              {[
                { label: 'Clinic Only',        value: clinicCount,     color: '#0EA5E9' },
                { label: 'Diagnostic Only',    value: diagnosticCount, color: '#8B5CF6' },
                { label: 'Clinic + Diagnostic',value: bothCount,       color: '#10B981' },
              ].map(item => (
                <div key={item.label} style={{ flex: 1, textAlign: 'center', padding: '16px', background: 'var(--bg)', borderRadius: 10 }}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: item.color }}>{item.value}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{item.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent clients */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>
              Recent Clients
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg)' }}>
                  {['Centre', 'Type', 'Plan', 'Status', 'Expires'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--muted)', fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {clients.slice(0, 10).map(c => {
                  const status = getSubscriptionStatus(c)
                  const statusColor = { active: '#16A34A', trial: '#D97706', expired: '#DC2626', deactivated: '#6B7280' }[status] || '#6B7280'
                  return (
                    <tr key={c.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>{c.centreName}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>{c.city || '—'}</div>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--slate)' }}>
                        {c.centreType === 'both' ? 'Clinic + Diag' : c.centreType === 'clinic' ? 'Clinic' : 'Diagnostic'}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--slate)' }}>
                        {PLANS[c.plan]?.label || c.plan || '—'}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: statusColor, background: statusColor + '18', padding: '2px 8px', borderRadius: 20 }}>
                          {status}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--muted)' }}>
                        {c.subscriptionEndDate || '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

        </div>
      )}
    </AdminLayout>
  )
}
