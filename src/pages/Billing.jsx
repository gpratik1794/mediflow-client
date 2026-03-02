// src/pages/Billing.jsx
import React, { useState, useEffect } from 'react'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../utils/AuthContext'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import { Card, CardHeader, StatCard, Empty, Btn } from '../components/UI'
import { updateVisit } from '../firebase/db'
import { format } from 'date-fns'

export default function Billing() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [visits, setVisits]       = useState([])
  const [loading, setLoading]     = useState(true)
  const [filterPayment, setFilter] = useState('all')
  const today = format(new Date(), 'yyyy-MM-dd')

  useEffect(() => { loadData() }, [user])

  async function loadData() {
    setLoading(true)
    const ref = collection(db, 'centres', user.uid, 'visits')
    const q = query(ref, where('date', '==', today))
    const snap = await getDocs(q)
    setVisits(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    setLoading(false)
  }

  async function markPaid(visitId) {
    await updateVisit(user.uid, visitId, { paymentStatus: 'paid' })
    setVisits(vs => vs.map(v => v.id === visitId ? { ...v, paymentStatus: 'paid' } : v))
  }

  const paid    = visits.filter(v => v.paymentStatus === 'paid')
  const pending = visits.filter(v => v.paymentStatus !== 'paid')
  const paidAmt = paid.reduce((s, v) => s + (v.totalAmount || 0), 0)
  const pendingAmt = pending.reduce((s, v) => s + (v.totalAmount || 0), 0)

  const filtered = filterPayment === 'all' ? visits
    : filterPayment === 'paid' ? paid : pending

  return (
    <Layout title="Billing" action={<Btn variant="ghost" small onClick={loadData}>🔄 Refresh</Btn>}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 24 }}>
        <StatCard icon="₹" label="Total Billed Today"     value={`₹${(paidAmt + pendingAmt).toLocaleString('en-IN')}`} color="teal" />
        <StatCard icon="✅" label="Collected"              value={`₹${paidAmt.toLocaleString('en-IN')}`}               color="green" />
        <StatCard icon="⏳" label="Pending Collection"     value={`₹${pendingAmt.toLocaleString('en-IN')}`}             color="amber" />
      </div>

      <Card>
        <CardHeader title="Today's Bills" sub={`${visits.length} bills · ${paid.length} paid`} />
        <div style={{ display: 'flex', gap: 6, padding: '10px 22px', borderBottom: '1px solid var(--border)' }}>
          {['all', 'paid', 'pending'].map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: '6px 16px', borderRadius: 20, border: 'none', cursor: 'pointer',
              fontSize: 12, fontFamily: 'DM Sans, sans-serif', textTransform: 'capitalize',
              background: filterPayment === f ? 'var(--teal)' : 'var(--bg)',
              color: filterPayment === f ? '#fff' : 'var(--slate)',
              fontWeight: filterPayment === f ? 500 : 400
            }}>{f}</button>
          ))}
        </div>

        {loading ? <Empty icon="⏳" message="Loading…" /> :
         filtered.length === 0 ? <Empty icon="₹" message="No bills found" /> : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg)' }}>
                {['Bill No.', 'Patient', 'Tests', 'Subtotal', 'GST', 'Discount', 'Total', 'Payment', ''].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 18px', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--muted)', fontWeight: 500, borderBottom: '1px solid var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(v => (
                <tr key={v.id} style={{ borderBottom: '1px solid var(--border)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '12px 18px', fontSize: 12, color: 'var(--muted)', fontFamily: 'monospace' }}>{v.billNo}</td>
                  <td style={{ padding: '12px 18px' }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--navy)' }}>{v.patientName}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{v.phone}</div>
                  </td>
                  <td style={{ padding: '12px 18px', fontSize: 13, color: 'var(--slate)' }}>{(v.tests||[]).length}</td>
                  <td style={{ padding: '12px 18px', fontSize: 13, color: 'var(--slate)' }}>₹{v.subtotal||0}</td>
                  <td style={{ padding: '12px 18px', fontSize: 13, color: 'var(--muted)' }}>₹{v.gstAmount||0}</td>
                  <td style={{ padding: '12px 18px', fontSize: 13, color: 'var(--red)' }}>-₹{v.discount||0}</td>
                  <td style={{ padding: '12px 18px', fontSize: 14, fontWeight: 700, color: 'var(--navy)' }}>₹{v.totalAmount||0}</td>
                  <td style={{ padding: '12px 18px' }}>
                    {v.paymentStatus === 'paid' ? (
                      <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 500, background: 'var(--green-bg)', color: 'var(--green)' }}>✅ Paid</span>
                    ) : (
                      <button onClick={() => markPaid(v.id)} style={{
                        padding: '4px 12px', borderRadius: 20, border: 'none', cursor: 'pointer',
                        fontSize: 11, fontWeight: 500, background: 'var(--amber-bg)', color: 'var(--amber)',
                        fontFamily: 'DM Sans, sans-serif', transition: 'all 0.18s'
                      }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--amber)'; e.currentTarget.style.color = '#fff' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'var(--amber-bg)'; e.currentTarget.style.color = 'var(--amber)' }}
                      >Mark Paid</button>
                    )}
                  </td>
                  <td style={{ padding: '12px 18px' }}>
                    <Btn small variant="ghost" onClick={() => navigate(`/visits/${v.id}`)}>View</Btn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </Layout>
  )
}
