// src/pages/PatientDetail.jsx
// Full patient history — visits (diagnostic), appointments (clinic), prescriptions, bills
import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../utils/AuthContext'
import Layout from '../components/Layout'
import { Card, CardHeader, Badge, Btn, Empty } from '../components/UI'
import { db } from '../firebase/config'
import { collection, doc, getDoc, getDocs, query, where, orderBy, limit } from 'firebase/firestore'
import { getAllPrescriptions, getPatientAppointments } from '../firebase/clinicDb'

export default function PatientDetail() {
  const { id } = useParams()
  const { user, profile } = useAuth()
  const navigate = useNavigate()

  const [patient,       setPatient]       = useState(null)
  const [visits,        setVisits]        = useState([])
  const [appointments,  setAppointments]  = useState([])
  const [prescriptions, setPrescriptions] = useState([])
  const [tab,           setTab]           = useState('overview')
  const [loading,       setLoading]       = useState(true)

  const isClinic     = profile?.centreType === 'clinic'
  const isDiagnostic = profile?.centreType === 'diagnostic'
  const isBoth       = profile?.centreType === 'both'

  useEffect(() => { if (user && id) load() }, [user, id])

  async function load() {
    setLoading(true)
    try {
      // Load patient record
      const patSnap = await getDoc(doc(db, 'centres', user.uid, 'patients', id))
      if (!patSnap.exists()) { navigate(-1); return }
      const pat = { id: patSnap.id, ...patSnap.data() }
      setPatient(pat)

      // Load diagnostic visits
      if (!isClinic) {
        const vSnap = await getDocs(query(
          collection(db, 'centres', user.uid, 'visits'),
          where('phone', '==', pat.phone),
          orderBy('date', 'desc'), limit(50)
        ))
        setVisits(vSnap.docs.map(d => ({ id: d.id, ...d.data() })))
      }

      // Load clinic appointments
      if (!isDiagnostic) {
        const appts = await getPatientAppointments(user.uid, pat.phone)
        setAppointments(appts)
      }

      // Load prescriptions
      if (!isDiagnostic) {
        const presc = await getAllPrescriptions(user.uid, pat.phone)
        setPrescriptions(presc)
      }
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  if (loading) return <Layout title="Patient"><div style={{ padding: 60, textAlign: 'center', color: 'var(--muted)' }}>Loading…</div></Layout>
  if (!patient) return null

  // Stats
  const totalBilled   = visits.reduce((s, v) => s + (v.totalAmount || 0), 0)
  const totalPaid     = visits.filter(v => v.paid).reduce((s, v) => s + (v.totalAmount || 0), 0)
  const totalPending  = totalBilled - totalPaid

  const tabs = [
    { key: 'overview',      label: 'Overview' },
    ...(!isClinic    ? [{ key: 'visits',       label: `Visits (${visits.length})` }] : []),
    ...(!isDiagnostic ? [{ key: 'appts',        label: `Appointments (${appointments.length})` }] : []),
    ...(!isDiagnostic ? [{ key: 'prescriptions', label: `Prescriptions (${prescriptions.length})` }] : []),
  ]

  const statusColor = s => ({
    registered: { bg: '#EFF6FF', color: '#1D4ED8' },
    sampled:    { bg: '#FEF9C3', color: '#92400E' },
    processing: { bg: '#FFF7ED', color: '#C2410C' },
    ready:      { bg: '#ECFDF5', color: '#065F46' },
    scheduled:  { bg: '#EFF6FF', color: '#1D4ED8' },
    waiting:    { bg: '#FEF9C3', color: '#92400E' },
    'in-consultation': { bg: '#FFF7ED', color: '#C2410C' },
    done:       { bg: '#ECFDF5', color: '#065F46' },
    cancelled:  { bg: '#FEF2F2', color: '#991B1B' },
  }[s] || { bg: 'var(--bg)', color: 'var(--muted)' })

  return (
    <Layout title={patient.name}
      action={
        <div style={{ display: 'flex', gap: 10 }}>
          <Btn variant="ghost" small onClick={() => navigate(-1)}>← Back</Btn>
          {!isDiagnostic && (
            <Btn small onClick={() => navigate(`/clinic/appointments/new?phone=${patient.phone}`)}>
              + New Appointment
            </Btn>
          )}
        </div>
      }
    >
      {/* Patient header card */}
      <Card style={{ marginBottom: 20 }}>
        <div style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: 'var(--teal-light)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 22, fontWeight: 700, color: 'var(--teal)', flexShrink: 0
          }}>
            {patient.name?.[0]?.toUpperCase() || '?'}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--navy)' }}>{patient.name}</div>
            <div style={{ fontSize: 13, color: 'var(--slate)', marginTop: 3, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <span>📱 {patient.phone}</span>
              {patient.age    && <span>🎂 {patient.age}y</span>}
              {patient.gender && <span>⚧ {patient.gender}</span>}
              {patient.city   && <span>📍 {patient.city}</span>}
            </div>
          </div>
          {!isClinic && (
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              {[
                { label: 'Total Billed', value: `₹${totalBilled.toLocaleString()}`, color: 'var(--navy)' },
                { label: 'Paid',         value: `₹${totalPaid.toLocaleString()}`,   color: '#065F46'      },
                { label: 'Pending',      value: `₹${totalPending.toLocaleString()}`,color: totalPending > 0 ? '#C0392B' : 'var(--muted)' },
              ].map(s => (
                <div key={s.label} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.label}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '9px 18px', border: 'none', borderRadius: '8px 8px 0 0',
            background: tab === t.key ? 'var(--teal)' : 'none',
            color: tab === t.key ? '#fff' : 'var(--slate)',
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
            fontFamily: 'DM Sans, sans-serif',
            borderBottom: tab === t.key ? '2px solid var(--teal)' : '2px solid transparent',
          }}>{t.label}</button>
        ))}
      </div>

      {/* Overview tab */}
      {tab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          {!isClinic && visits.length > 0 && (
            <Card>
              <CardHeader title="Recent Visits" sub="Last 5 diagnostic visits" />
              <div style={{ padding: '0 0 8px' }}>
                {visits.slice(0, 5).map(v => (
                  <div key={v.id} onClick={() => navigate(`/visits/${v.id}`)}
                    style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--teal-light)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>{v.date}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{v.tests?.length || 0} test(s) · Bill #{v.billNo}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>₹{v.totalAmount || 0}</div>
                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, fontWeight: 600, background: v.paid ? '#D1FAE5' : '#FEF2F2', color: v.paid ? '#065F46' : '#991B1B' }}>
                        {v.paid ? 'Paid' : 'Pending'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
          {!isDiagnostic && appointments.length > 0 && (
            <Card>
              <CardHeader title="Recent Appointments" sub="Last 5 clinic visits" />
              <div style={{ padding: '0 0 8px' }}>
                {appointments.slice(0, 5).map(a => {
                  const sc = statusColor(a.status)
                  return (
                    <div key={a.id} onClick={() => navigate(`/clinic/appointments/${a.id}`)}
                      style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--teal-light)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>{a.date}</div>
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>{a.appointmentTime} · Token #{a.tokenNumber}</div>
                      </div>
                      <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, fontWeight: 600, background: sc.bg, color: sc.color }}>
                        {a.status}
                      </span>
                    </div>
                  )
                })}
              </div>
            </Card>
          )}
          {!isDiagnostic && prescriptions.length > 0 && (
            <Card>
              <CardHeader title="Recent Prescriptions" sub="Last 5 prescriptions" />
              <div style={{ padding: '0 0 8px' }}>
                {prescriptions.slice(0, 5).map(p => (
                  <div key={p.id} onClick={() => navigate(`/clinic/prescription/${p.id}`)}
                    style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--teal-light)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>{p.date}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{p.diagnosis || 'No diagnosis noted'}</div>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{p.medicines?.length || 0} med(s)</div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Visits tab */}
      {tab === 'visits' && (
        <Card>
          <CardHeader title="All Diagnostic Visits" sub={`${visits.length} total`} />
          {visits.length === 0 ? <Empty icon="🧪" message="No diagnostic visits yet" /> : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg)' }}>
                  {['Date', 'Bill No', 'Tests', 'Amount', 'Payment', 'Status', ''].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '10px 16px', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--muted)', fontWeight: 500, borderBottom: '1px solid var(--border)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visits.map(v => {
                  const sc = statusColor(v.status)
                  return (
                    <tr key={v.id} onClick={() => navigate(`/visits/${v.id}`)}
                      style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--teal-light)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 500, color: 'var(--navy)' }}>{v.date}</td>
                      <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--muted)' }}>#{v.billNo}</td>
                      <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--slate)' }}>{(v.tests || []).map(t => t.name).join(', ') || '—'}</td>
                      <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>₹{v.totalAmount || 0}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 600, background: v.paid ? '#D1FAE5' : '#FEF2F2', color: v.paid ? '#065F46' : '#991B1B' }}>
                          {v.paid ? 'Paid' : 'Pending'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 600, background: sc.bg, color: sc.color }}>{v.status}</span>
                      </td>
                      <td style={{ padding: '12px 16px', color: 'var(--teal)', fontSize: 18 }}>›</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {/* Appointments tab */}
      {tab === 'appts' && (
        <Card>
          <CardHeader title="All Appointments" sub={`${appointments.length} total`} />
          {appointments.length === 0 ? <Empty icon="📅" message="No appointments yet" /> : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg)' }}>
                  {['Date', 'Time', 'Token', 'Visit Type', 'Status', ''].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '10px 16px', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--muted)', fontWeight: 500, borderBottom: '1px solid var(--border)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {appointments.map(a => {
                  const sc = statusColor(a.status)
                  return (
                    <tr key={a.id} onClick={() => navigate(`/clinic/appointments/${a.id}`)}
                      style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--teal-light)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 500, color: 'var(--navy)' }}>{a.date}</td>
                      <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--slate)' }}>{a.appointmentTime || '—'}</td>
                      <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: 'var(--teal)' }}>#{a.tokenNumber}</td>
                      <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--slate)' }}>{a.visitType || '—'}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 600, background: sc.bg, color: sc.color }}>{a.status}</span>
                      </td>
                      <td style={{ padding: '12px 16px', color: 'var(--teal)', fontSize: 18 }}>›</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {/* Prescriptions tab */}
      {tab === 'prescriptions' && (
        <Card>
          <CardHeader title="All Prescriptions" sub={`${prescriptions.length} total`} />
          {prescriptions.length === 0 ? <Empty icon="💊" message="No prescriptions yet" /> : (
            <div>
              {prescriptions.map(p => (
                <div key={p.id} onClick={() => navigate(`/clinic/prescription/${p.id}`)}
                  style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--teal-light)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>{p.date}</span>
                      {p.diagnosis && (
                        <span style={{ fontSize: 12, color: 'var(--teal)', background: 'var(--teal-light)', padding: '2px 8px', borderRadius: 20 }}>
                          {p.diagnosis}
                        </span>
                      )}
                    </div>
                    {p.complaints && <div style={{ fontSize: 12, color: 'var(--slate)', marginBottom: 4 }}>Complaints: {p.complaints}</div>}
                    {p.medicines?.length > 0 && (
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                        💊 {p.medicines.slice(0, 3).map(m => m.name).join(', ')}
                        {p.medicines.length > 3 && ` +${p.medicines.length - 3} more`}
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                    {p.medicines?.length || 0} med(s) ›
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </Layout>
  )
}
