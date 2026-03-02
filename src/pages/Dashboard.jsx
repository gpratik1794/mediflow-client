// src/pages/Dashboard.jsx
import React, { useState, useEffect } from 'react'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../utils/AuthContext'
import Layout from '../components/Layout'
import { StatCard, Card, CardHeader, Badge, Btn, Empty } from '../components/UI'
import { format } from 'date-fns'
import { useNavigate } from 'react-router-dom'

export default function Dashboard() {
  const { user, profile } = useAuth()
  const [visits, setVisits]   = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  const today = format(new Date(), 'yyyy-MM-dd')
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  useEffect(() => {
    if (!user) return
    loadTodayVisits()
  }, [user])

  async function loadTodayVisits() {
    setLoading(true)
    const ref = collection(db, 'centres', user.uid, 'visits')
    const q = query(ref, where('date', '==', today))
    const snap = await getDocs(q)
    const data = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    setVisits(data.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)))
    setLoading(false)
  }

  // Compute stats
  const totalPatients = visits.length
  const pending       = visits.filter(v => ['registered','sampled','processing'].includes(v.status)).length
  const ready         = visits.filter(v => v.status === 'ready').length
  const revenue       = visits.filter(v => v.paymentStatus === 'paid').reduce((s, v) => s + (v.totalAmount || 0), 0)
  const unpaid        = visits.filter(v => v.paymentStatus === 'pending').reduce((s, v) => s + (v.totalAmount || 0), 0)

  // Progress bar helper
  const Bar = ({ val, max, color = 'var(--teal)' }) => (
    <div style={{ height: 6, background: 'var(--border)', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{
        height: '100%', borderRadius: 10, background: color,
        width: max ? `${Math.min(100, (val / max) * 100)}%` : '0%',
        transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)'
      }} />
    </div>
  )

  return (
    <Layout
      title={`${greeting}, ${profile?.ownerName?.split(' ')[0] || 'there'} 👋`}
      action={
        <Btn onClick={() => navigate('/visits')}>
          + New Visit
        </Btn>
      }
    >
      {/* STATS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 24 }}>
        <StatCard icon="👥" label="Patients Today"   value={totalPatients} color="teal"  />
        <StatCard icon="⏳" label="Reports Pending"  value={pending}       color="amber" />
        <StatCard icon="✅" label="Reports Ready"    value={ready}         color="green" />
        <StatCard icon="₹"  label="Revenue Collected" value={`₹${revenue.toLocaleString('en-IN')}`} color="teal" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>

        {/* TODAY'S VISITS TABLE */}
        <Card>
          <CardHeader title="Today's Visits" sub={`${totalPatients} registered · ${ready} ready`}
            action={<Btn variant="ghost" small onClick={loadTodayVisits}>🔄 Refresh</Btn>} />
          {loading ? (
            <Empty icon="⏳" message="Loading visits…" />
          ) : visits.length === 0 ? (
            <Empty icon="📋" message="No visits today. Register the first patient!" />
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg)' }}>
                  {['Patient','Tests','Amount','Status','Time',''].map(h => (
                    <th key={h} style={{
                      textAlign: 'left', padding: '10px 20px',
                      fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8,
                      color: 'var(--muted)', fontWeight: 500, borderBottom: '1px solid var(--border)'
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visits.slice(0, 15).map(v => (
                  <tr key={v.id} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                    onClick={() => navigate(`/visits/${v.id}`)}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--teal-light)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '13px 20px' }}>
                      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)' }}>{v.patientName}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{v.visitId}</div>
                    </td>
                    <td style={{ padding: '13px 20px', fontSize: 13, color: 'var(--slate)' }}>
                      {(v.tests || []).slice(0, 2).map(t => t.name).join(', ')}
                      {(v.tests || []).length > 2 && ` +${v.tests.length - 2}`}
                    </td>
                    <td style={{ padding: '13px 20px', fontSize: 13, color: 'var(--navy)', fontWeight: 500 }}>
                      ₹{(v.totalAmount || 0).toLocaleString('en-IN')}
                    </td>
                    <td style={{ padding: '13px 20px' }}><Badge status={v.status} /></td>
                    <td style={{ padding: '13px 20px', fontSize: 12, color: 'var(--muted)' }}>
                      {v.createdAt?.seconds
                        ? format(new Date(v.createdAt.seconds * 1000), 'hh:mm a')
                        : '—'}
                    </td>
                    <td style={{ padding: '13px 20px' }}>
                      <span style={{ color: 'var(--teal)', fontSize: 18 }}>›</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        {/* RIGHT COLUMN */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* TODAY SUMMARY */}
          <Card>
            <CardHeader title="Today's Summary" sub="Lab throughput" />
            <div style={{ padding: '16px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[
                { label: 'Patients Registered', val: totalPatients, max: Math.max(totalPatients, 1), color: 'var(--teal)' },
                { label: 'Reports Ready',        val: ready,         max: Math.max(totalPatients, 1), color: 'var(--green)' },
                { label: 'Revenue Collected',    val: revenue,       max: Math.max(revenue + unpaid, 1), color: 'var(--amber)', fmt: `₹${revenue.toLocaleString('en-IN')}` },
                { label: 'Pending Payment',      val: unpaid,        max: Math.max(revenue + unpaid, 1), color: 'var(--red)', fmt: `₹${unpaid.toLocaleString('en-IN')}` },
              ].map(({ label, val, max, color, fmt }) => (
                <div key={label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
                    <span style={{ color: 'var(--slate)' }}>{label}</span>
                    <span style={{ color: 'var(--navy)', fontWeight: 600 }}>{fmt || val}</span>
                  </div>
                  <Bar val={val} max={max} color={color} />
                </div>
              ))}
            </div>
          </Card>

          {/* QUICK ACTIONS */}
          <Card>
            <CardHeader title="Quick Actions" />
            <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { label: '+ Register New Patient', to: '/visits', icon: '👤' },
                { label: '📋 View All Visits',     to: '/visits', icon: '' },
                { label: '₹ Open Billing',          to: '/billing', icon: '' },
                { label: '🧪 Manage Test Catalogue',to: '/tests',   icon: '' },
              ].map(a => (
                <button key={a.label} onClick={() => navigate(a.to)} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 14px', borderRadius: 10, border: '1.5px solid var(--border)',
                  background: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--slate)',
                  fontFamily: 'DM Sans, sans-serif', textAlign: 'left', transition: 'all 0.18s'
                }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--teal)'; e.currentTarget.style.color = 'var(--teal)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--slate)' }}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </Layout>
  )
}
