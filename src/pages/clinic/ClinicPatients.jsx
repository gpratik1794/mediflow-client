// src/pages/clinic/ClinicPatients.jsx
import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../utils/AuthContext'
import Layout from '../../components/Layout'
import { Card, CardHeader, Btn, Empty } from '../../components/UI'
import { collection, query, orderBy, getDocs } from 'firebase/firestore'
import { db } from '../../firebase/config'

export default function ClinicPatients() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [patients, setPatients] = useState([])
  const [search, setSearch]     = useState('')
  const [loading, setLoading]   = useState(true)

  useEffect(() => { loadPatients() }, [user])

  async function loadPatients() {
    setLoading(true)
    try {
      const q = query(
        collection(db, 'centres', user.uid, 'patients'),
        orderBy('name', 'asc')
      )
      const snap = await getDocs(q)
      setPatients(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  const filtered = patients.filter(p =>
    p.name?.toLowerCase().includes(search.toLowerCase()) ||
    p.phone?.includes(search)
  )

  return (
    <Layout title="Patients"
      action={<Btn onClick={() => navigate('/clinic/appointments/new')}>+ New Appointment</Btn>}
    >
      {/* Search */}
      <div style={{ marginBottom: 20 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or phone…"
          style={{
            width: '100%', maxWidth: 400, padding: '10px 16px', borderRadius: 10,
            border: '1.5px solid var(--border)', fontSize: 13,
            fontFamily: 'DM Sans, sans-serif', outline: 'none', boxSizing: 'border-box',
            background: 'var(--surface)'
          }}
        />
      </div>

      <Card>
        <CardHeader title={`All Patients (${filtered.length})`} />
        {loading ? (
          <Empty icon="⏳" message="Loading patients…" />
        ) : filtered.length === 0 ? (
          <Empty icon="👥" message={search ? 'No patients match your search' : 'No patients yet. Book the first appointment!'} />
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg)' }}>
                {['Name', 'Phone', 'Age / Gender', 'Last Visit', ''].map(h => (
                  <th key={h} style={{
                    textAlign: 'left', padding: '10px 18px', fontSize: 11,
                    textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--muted)',
                    fontWeight: 500, borderBottom: '1px solid var(--border)'
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id}
                  style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                  onClick={() => navigate(`/patients/${p.id}`)}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--teal-light)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '13px 18px' }}>
                    <div style={{ fontWeight: 500, fontSize: 14, color: 'var(--navy)' }}>{p.name}</div>
                  </td>
                  <td style={{ padding: '13px 18px', fontSize: 13, color: 'var(--slate)' }}>{p.phone}</td>
                  <td style={{ padding: '13px 18px', fontSize: 13, color: 'var(--slate)' }}>
                    {p.age ? `${p.age}y` : '—'} {p.gender ? `· ${p.gender}` : ''}
                  </td>
                  <td style={{ padding: '13px 18px', fontSize: 12, color: 'var(--muted)' }}>
                    {p.lastVisit || '—'}
                  </td>
                  <td style={{ padding: '13px 18px', color: 'var(--teal)', fontSize: 18 }}>›</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </Layout>
  )
}
