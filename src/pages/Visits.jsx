// src/pages/Visits.jsx
import React, { useState, useEffect } from 'react'
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../utils/AuthContext'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import { Card, CardHeader, Badge, Btn, Empty } from '../components/UI'
import { format } from 'date-fns'

export default function Visits() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [visits, setVisits]     = useState([])
  const [loading, setLoading]   = useState(true)
  const [filterStatus, setFilterStatus] = useState('all')
  const [search, setSearch]     = useState('')
  const today = format(new Date(), 'yyyy-MM-dd')

  useEffect(() => { loadVisits() }, [user])

  async function loadVisits() {
    setLoading(true)
    const ref = collection(db, 'centres', user.uid, 'visits')
    const q = query(ref, where('date', '==', today))
    const snap = await getDocs(q)
    const data = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    setVisits(data.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)))
    setLoading(false)
  }

  const filtered = visits.filter(v => {
    const matchStatus = filterStatus === 'all' || v.status === filterStatus
    const matchSearch = !search || v.patientName?.toLowerCase().includes(search.toLowerCase()) || v.phone?.includes(search) || v.billNo?.includes(search)
    return matchStatus && matchSearch
  })

  const statuses = ['all', 'registered', 'sampled', 'processing', 'ready']

  return (
    <Layout
      title="Today's Visits"
      action={<Btn onClick={() => navigate('/visits/new')}>+ New Visit</Btn>}
    >
      <Card>
        <CardHeader
          title={`${visits.length} visits today`}
          sub={format(new Date(), 'EEEE, dd MMMM yyyy')}
          action={
            <div style={{ display: 'flex', gap: 10 }}>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="🔍 Search name, phone, bill no…"
                style={{ border: '1.5px solid var(--border)', borderRadius: 8, padding: '7px 14px', fontSize: 13, outline: 'none', fontFamily: 'DM Sans, sans-serif', color: 'var(--navy)', width: 240 }} />
              <Btn variant="ghost" small onClick={loadVisits}>🔄</Btn>
            </div>
          }
        />
        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 4, padding: '10px 22px', borderBottom: '1px solid var(--border)' }}>
          {statuses.map(s => (
            <button key={s} onClick={() => setFilterStatus(s)} style={{
              padding: '6px 16px', borderRadius: 20, border: 'none', cursor: 'pointer',
              fontSize: 12, fontFamily: 'DM Sans, sans-serif', transition: 'all 0.18s', textTransform: 'capitalize',
              background: filterStatus === s ? 'var(--teal)' : 'var(--bg)',
              color: filterStatus === s ? '#fff' : 'var(--slate)',
              fontWeight: filterStatus === s ? 500 : 400
            }}>
              {s} {s !== 'all' && `(${visits.filter(v => v.status === s).length})`}
            </button>
          ))}
        </div>

        {loading ? <Empty icon="⏳" message="Loading…" /> :
         filtered.length === 0 ? <Empty icon="📋" message="No visits found" /> : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg)' }}>
                {['Bill No.', 'Patient', 'Tests', 'Amount', 'Payment', 'Status', 'Time', ''].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 20px', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--muted)', fontWeight: 500, borderBottom: '1px solid var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(v => (
                <tr key={v.id} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                  onClick={() => navigate(`/visits/${v.id}`)}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--teal-light)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '12px 20px', fontSize: 12, color: 'var(--muted)', fontFamily: 'monospace' }}>{v.billNo}</td>
                  <td style={{ padding: '12px 20px' }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)' }}>{v.patientName}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{v.phone} · {v.age}y {v.gender}</div>
                  </td>
                  <td style={{ padding: '12px 20px', fontSize: 13, color: 'var(--slate)' }}>
                    {(v.tests || []).length} test{(v.tests || []).length !== 1 ? 's' : ''}
                  </td>
                  <td style={{ padding: '12px 20px', fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>₹{(v.totalAmount || 0).toLocaleString('en-IN')}</td>
                  <td style={{ padding: '12px 20px' }}>
                    <span style={{
                      padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 500,
                      background: v.paymentStatus === 'paid' ? 'var(--green-bg)' : 'var(--amber-bg)',
                      color: v.paymentStatus === 'paid' ? 'var(--green)' : 'var(--amber)'
                    }}>
                      {v.paymentStatus === 'paid' ? 'Paid' : 'Pending'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 20px' }}><Badge status={v.status} /></td>
                  <td style={{ padding: '12px 20px', fontSize: 12, color: 'var(--muted)' }}>
                    {v.createdAt?.seconds ? format(new Date(v.createdAt.seconds * 1000), 'hh:mm a') : '—'}
                  </td>
                  <td style={{ padding: '12px 20px', color: 'var(--teal)', fontSize: 18 }}>›</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </Layout>
  )
}
