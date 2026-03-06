// src/pages/clinic/Vaccination.jsx
import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../utils/AuthContext'
import Layout from '../../components/Layout'
import { Card, CardHeader, Btn, Empty } from '../../components/UI'
import { getChildren, getDueDate, DEFAULT_VACCINE_SCHEDULE } from '../../firebase/vaccinationDb'

function getAgeStr(dobStr) {
  if (!dobStr) return '—'
  const diff = new Date() - new Date(dobStr)
  const months = Math.floor(diff / (30.44 * 24 * 60 * 60 * 1000))
  if (months < 1)  return `${Math.floor(diff / (24 * 60 * 60 * 1000))} days`
  if (months < 24) return `${months} months`
  return `${Math.floor(months / 12)}y ${months % 12}m`
}

function getNextDue(child) {
  if (!child.dob) return null
  const given = child.vaccines || {}
  const pending = DEFAULT_VACCINE_SCHEDULE
    .filter(v => !given[v.id])
    .map(v => ({ ...v, dueDate: getDueDate(child.dob, v.atMonths) }))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  return pending[0] || null
}

export default function Vaccination() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [children, setChildren] = useState([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')

  useEffect(() => { if (user) load() }, [user])

  async function load() {
    setLoading(true)
    try { setChildren(await getChildren(user.uid)) }
    catch (e) { console.error(e) }
    setLoading(false)
  }

  const filtered = children.filter(c => {
    const q = search.toLowerCase()
    return !q || c.childName?.toLowerCase().includes(q) ||
      c.motherPhone?.includes(q) || c.fatherPhone?.includes(q) ||
      c.guardianName?.toLowerCase().includes(q)
  })

  const today = new Date().toISOString().split('T')[0]

  return (
    <Layout title="Vaccination"
      action={<Btn onClick={() => navigate('/clinic/vaccination/new')}>+ Add Child</Btn>}
    >
      {/* Search */}
      <div style={{ marginBottom: 20 }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by child name, parent phone…"
          style={{ width: '100%', maxWidth: 400, padding: '10px 16px', borderRadius: 10, border: '1.5px solid var(--border)', fontSize: 13, fontFamily: 'DM Sans, sans-serif', outline: 'none', background: 'var(--surface)', boxSizing: 'border-box' }} />
      </div>

      <Card>
        <CardHeader title={`Children (${filtered.length})`} sub="Click to view vaccination schedule" />
        {loading ? <Empty icon="⏳" message="Loading…" /> :
         filtered.length === 0 ? (
           <Empty icon="👶" message={search ? 'No children match your search' : 'No children added yet. Click "+ Add Child" to start.'} />
         ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg)' }}>
                {['Child', 'Age', 'Guardian', 'Next Due Vaccine', 'Due Date', 'Progress', ''].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 16px', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--muted)', fontWeight: 500, borderBottom: '1px solid var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(child => {
                const given   = Object.keys(child.vaccines || {}).filter(k => child.vaccines[k])
                const total   = DEFAULT_VACCINE_SCHEDULE.length
                const pct     = Math.round((given.length / total) * 100)
                const nextDue = getNextDue(child)
                const isOverdue = nextDue && nextDue.dueDate < today
                return (
                  <tr key={child.id}
                    onClick={() => navigate(`/clinic/vaccination/${child.id}`)}
                    style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--teal-light)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '13px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--teal-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
                          {child.gender === 'Female' ? '👧' : '👦'}
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>{child.childName}</div>
                          <div style={{ fontSize: 11, color: 'var(--muted)' }}>{child.gender || '—'}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '13px 16px', fontSize: 13, color: 'var(--slate)' }}>{getAgeStr(child.dob)}</td>
                    <td style={{ padding: '13px 16px' }}>
                      <div style={{ fontSize: 13, color: 'var(--navy)' }}>{child.guardianName || '—'}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{child.motherPhone || child.fatherPhone || ''}</div>
                    </td>
                    <td style={{ padding: '13px 16px', fontSize: 13, color: isOverdue ? '#C0392B' : 'var(--navy)' }}>
                      {nextDue ? nextDue.name : <span style={{ color: '#16A34A' }}>✓ All done</span>}
                    </td>
                    <td style={{ padding: '13px 16px' }}>
                      {nextDue && (
                        <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 20, fontWeight: 600, background: isOverdue ? '#FEF2F2' : '#FEF9C3', color: isOverdue ? '#991B1B' : '#92400E' }}>
                          {isOverdue ? `⚠ Overdue · ${nextDue.dueDate}` : nextDue.dueDate}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '13px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, height: 6, background: 'var(--border)', borderRadius: 3, minWidth: 60 }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: pct === 100 ? '#16A34A' : 'var(--teal)', borderRadius: 3, transition: 'width 0.3s' }} />
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{given.length}/{total}</span>
                      </div>
                    </td>
                    <td style={{ padding: '13px 16px', color: 'var(--teal)', fontSize: 18 }}>›</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Card>
    </Layout>
  )
}
