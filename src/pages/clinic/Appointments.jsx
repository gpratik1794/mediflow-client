// src/pages/clinic/Appointments.jsx
import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../utils/AuthContext'
import Layout from '../../components/Layout'
import { Card, CardHeader, Btn, Empty } from '../../components/UI'
import { getAppointments, updateAppointment } from '../../firebase/clinicDb'
import { format } from 'date-fns'

const STATUS_COLOR = {
  scheduled: { bg: 'var(--border)', color: 'var(--slate)', label: 'Scheduled' },
  waiting:   { bg: 'var(--amber-bg)', color: 'var(--amber)', label: 'Waiting' },
  'in-consultation': { bg: 'var(--teal-light)', color: 'var(--teal)', label: 'In Consultation' },
  done:      { bg: 'var(--green-bg)', color: 'var(--green)', label: 'Done' },
  cancelled: { bg: 'var(--red-bg)', color: 'var(--red)', label: 'Cancelled' },
}

export default function Appointments() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [appointments, setAppointments] = useState([])
  const [loading, setLoading]           = useState(true)
  const [filter, setFilter]             = useState('all')
  const [search, setSearch]             = useState('')
  const today = format(new Date(), 'yyyy-MM-dd')

  useEffect(() => { if (user) load() }, [user])

  async function load() {
    setLoading(true)
    const data = await getAppointments(user.uid, today)
    setAppointments(data)
    setLoading(false)
  }

  async function quickStatus(e, apptId, status) {
    e.stopPropagation()
    await updateAppointment(user.uid, apptId, { status })
    setAppointments(a => a.map(x => x.id === apptId ? { ...x, status } : x))
  }

  const filtered = appointments.filter(a => {
    const matchFilter = filter === 'all' || a.status === filter
    const matchSearch = !search || a.patientName?.toLowerCase().includes(search.toLowerCase()) || a.phone?.includes(search)
    return matchFilter && matchSearch
  })

  return (
    <Layout
      title="Appointments"
      action={<Btn onClick={() => navigate('/clinic/appointments/new')}>+ Book Appointment</Btn>}
    >
      <Card>
        <CardHeader
          title={`${appointments.length} appointments today`}
          sub={format(new Date(), 'EEEE, dd MMMM yyyy')}
          action={
            <div style={{ display: 'flex', gap: 10 }}>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="🔍 Search name or phone…"
                style={{ border: '1.5px solid var(--border)', borderRadius: 8, padding: '7px 14px', fontSize: 13, outline: 'none', fontFamily: 'DM Sans, sans-serif', color: 'var(--navy)', width: 220 }} />
              <Btn variant="ghost" small onClick={load}>🔄</Btn>
            </div>
          }
        />

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 4, padding: '10px 22px', borderBottom: '1px solid var(--border)' }}>
          {['all', 'scheduled', 'waiting', 'in-consultation', 'done', 'cancelled'].map(s => (
            <button key={s} onClick={() => setFilter(s)} style={{
              padding: '5px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
              fontSize: 11, fontFamily: 'DM Sans, sans-serif', textTransform: 'capitalize',
              background: filter === s ? 'var(--navy)' : 'var(--bg)',
              color: filter === s ? '#fff' : 'var(--slate)',
              fontWeight: filter === s ? 500 : 400
            }}>
              {s === 'all' ? `All (${appointments.length})` : `${STATUS_COLOR[s]?.label} (${appointments.filter(a => a.status === s).length})`}
            </button>
          ))}
        </div>

        {loading ? <Empty icon="⏳" message="Loading…" /> :
         filtered.length === 0 ? <Empty icon="📅" message="No appointments found" /> : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg)' }}>
                {['Token', 'Patient', 'Time', 'Type', 'Status', 'Quick Action', ''].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 18px', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--muted)', fontWeight: 500, borderBottom: '1px solid var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(a => {
                const sc = STATUS_COLOR[a.status] || STATUS_COLOR.scheduled
                return (
                  <tr key={a.id} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                    onClick={() => navigate(`/clinic/appointments/${a.id}`)}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--teal-light)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '12px 18px' }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: 10, fontSize: 14, fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: a.status === 'in-consultation' ? 'var(--teal)' : 'var(--bg)',
                        color: a.status === 'in-consultation' ? '#fff' : 'var(--navy)'
                      }}>
                        {a.tokenNumber}
                      </div>
                    </td>
                    <td style={{ padding: '12px 18px' }}>
                      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)' }}>{a.patientName}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{a.phone} · {a.age}y · {a.gender}</div>
                    </td>
                    <td style={{ padding: '12px 18px', fontSize: 13, color: 'var(--slate)' }}>{a.appointmentTime}</td>
                    <td style={{ padding: '12px 18px', fontSize: 12, color: 'var(--muted)' }}>{a.visitType}</td>
                    <td style={{ padding: '12px 18px' }}>
                      <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 500, background: sc.bg, color: sc.color }}>
                        {sc.label}
                      </span>
                    </td>
                    <td style={{ padding: '12px 18px' }}>
                      {a.status === 'scheduled' && (
                        <button onClick={e => quickStatus(e, a.id, 'waiting')} style={{ padding: '5px 12px', borderRadius: 8, border: 'none', background: 'var(--amber-bg)', color: 'var(--amber)', fontSize: 11, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontWeight: 500 }}>
                          → Check In
                        </button>
                      )}
                      {a.status === 'waiting' && (
                        <button onClick={e => quickStatus(e, a.id, 'in-consultation')} style={{ padding: '5px 12px', borderRadius: 8, border: 'none', background: 'var(--teal-light)', color: 'var(--teal)', fontSize: 11, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontWeight: 500 }}>
                          → Call In
                        </button>
                      )}
                      {a.status === 'in-consultation' && (
                        <button onClick={e => { e.stopPropagation(); navigate(`/clinic/prescription/new?apptId=${a.id}&phone=${a.phone}&name=${encodeURIComponent(a.patientName)}&age=${a.age}&gender=${a.gender}`) }}
                          style={{ padding: '5px 12px', borderRadius: 8, border: 'none', background: 'var(--teal)', color: '#fff', fontSize: 11, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontWeight: 500 }}>
                          ✍ Prescribe
                        </button>
                      )}
                    </td>
                    <td style={{ padding: '12px 18px', color: 'var(--teal)', fontSize: 18 }}>›</td>
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
