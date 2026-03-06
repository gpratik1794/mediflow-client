// src/pages/Patients.jsx
import React, { useState, useEffect } from 'react'
import { collection, getDocs, orderBy, query } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../utils/AuthContext'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import { Card, CardHeader, Empty } from '../components/UI'

export default function Patients() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [patients, setPatients] = useState([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')

  useEffect(() => {
    if (!user) return
    loadPatients()
  }, [user])

  async function loadPatients() {
    setLoading(true)
    const ref = collection(db, 'centres', user.uid, 'patients')
    const snap = await getDocs(ref)
    setPatients(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    setLoading(false)
  }

  const filtered = patients.filter(p =>
    !search || p.name?.toLowerCase().includes(search.toLowerCase()) || p.phone?.includes(search)
  )

  return (
    <Layout title="Patients">
      <Card>
        <CardHeader
          title={`${patients.length} patients registered`}
          sub="All-time patient records"
          action={
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="🔍 Search by name or phone…"
              style={{ border: '1.5px solid var(--border)', borderRadius: 8, padding: '7px 14px', fontSize: 13, outline: 'none', fontFamily: 'DM Sans, sans-serif', color: 'var(--navy)', width: 240 }} />
          }
        />
        {loading ? <Empty icon="⏳" message="Loading patients…" /> :
         filtered.length === 0 ? <Empty icon="👥" message="No patients found" /> : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg)' }}>
                {['Patient', 'Age / Gender', 'Phone', 'Registered', ''].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 20px', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--muted)', fontWeight: 500, borderBottom: '1px solid var(--border)' }}>{h}</th>
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
                  <td style={{ padding: '13px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: 10, background: 'var(--teal-light)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 14, fontWeight: 700, color: 'var(--teal)'
                      }}>{p.name?.charAt(0)}</div>
                      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)' }}>{p.name}</div>
                    </div>
                  </td>
                  <td style={{ padding: '13px 20px', fontSize: 13, color: 'var(--slate)' }}>{p.age} yrs · {p.gender}</td>
                  <td style={{ padding: '13px 20px', fontSize: 13, color: 'var(--slate)' }}>{p.phone}</td>
                  <td style={{ padding: '13px 20px', fontSize: 12, color: 'var(--muted)' }}>
                    {p.createdAt?.seconds ? new Date(p.createdAt.seconds * 1000).toLocaleDateString('en-IN') : '—'}
                  </td>
                  <td style={{ padding: '13px 20px', color: 'var(--teal)', fontSize: 18 }}>›</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </Layout>
  )
}
