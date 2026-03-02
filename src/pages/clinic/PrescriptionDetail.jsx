// src/pages/clinic/PrescriptionDetail.jsx
import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../utils/AuthContext'
import Layout from '../../components/Layout'
import { Card, CardHeader, Btn, Empty } from '../../components/UI'
import { getPrescription } from '../../firebase/clinicDb'
import { printPrescription } from '../../utils/printPrescription'
import { format, addDays } from 'date-fns'

export default function PrescriptionDetail() {
  const { id } = useParams()
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [presc, setPresc] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (user && id) load() }, [id, user])

  async function load() {
    setLoading(true)
    const data = await getPrescription(user.uid, id)
    setPresc(data)
    setLoading(false)
  }

  function handlePrint() {
    if (!presc) return
    printPrescription({
      patient: { name: presc.patientName, phone: presc.patientPhone, age: presc.patientAge, gender: presc.patientGender },
      diagnosis: presc.diagnosis,
      complaints: presc.complaints,
      medicines: presc.medicines || [],
      advice: presc.advice,
      labTests: presc.labTests,
      followUpDays: null, // already saved, show follow-up date directly if needed
      profile: { ownerName: presc.doctorName, centreName: presc.centreName, address: presc.centreAddress, phone: presc.centrePhone },
      date: presc.date
    })
  }

  if (loading) return <Layout title="Prescription"><Empty icon="⏳" message="Loading…" /></Layout>
  if (!presc)  return <Layout title="Not found"><div style={{ padding: 40 }}>Prescription not found</div></Layout>

  return (
    <Layout
      title="Prescription"
      action={
        <div style={{ display: 'flex', gap: 10 }}>
          <Btn variant="ghost" small onClick={() => navigate(-1)}>← Back</Btn>
          <Btn small onClick={handlePrint}>🖨 Print</Btn>
        </div>
      }
    >
      {/* Prescription card preview */}
      <div style={{ maxWidth: 700, margin: '0 auto' }}>
        <Card>
          {/* Header */}
          <div style={{ padding: '24px 28px', borderBottom: '3px solid var(--teal)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--navy)' }}>Dr. {presc.doctorName}</div>
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>{presc.centreName}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{presc.centreAddress}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1 }}>Prescription</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)', marginTop: 4 }}>{presc.date}</div>
              </div>
            </div>
          </div>

          {/* Patient */}
          <div style={{ padding: '14px 28px', background: 'var(--bg)', borderBottom: '1px solid var(--border)', display: 'flex', gap: 32 }}>
            {[['Name', presc.patientName], ['Age', presc.patientAge + ' yrs'], ['Gender', presc.patientGender], ['Phone', presc.patientPhone]].map(([l, v]) => (
              v && <div key={l}>
                <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.6 }}>{l}</div>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)' }}>{v}</div>
              </div>
            ))}
          </div>

          <div style={{ padding: '24px 28px' }}>
            {presc.complaints && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>Complaints</div>
                <div style={{ fontSize: 14, color: 'var(--slate)' }}>{presc.complaints}</div>
              </div>
            )}

            {presc.diagnosis && (
              <div style={{ padding: '10px 14px', background: 'var(--teal-light)', borderRadius: 8, borderLeft: '3px solid var(--teal)', marginBottom: 20 }}>
                <span style={{ fontSize: 11, color: 'var(--teal)', fontWeight: 600, textTransform: 'uppercase' }}>Diagnosis: </span>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--navy)' }}>{presc.diagnosis}</span>
              </div>
            )}

            {/* Medicines */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 28, fontFamily: 'serif', color: 'var(--teal)', marginBottom: 12 }}>℞</div>
              {(presc.medicines || []).map((m, i) => (
                <div key={i} style={{ marginBottom: 14, paddingLeft: 16, borderLeft: '3px solid var(--border)' }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--navy)' }}>{i + 1}. {m.name}
                    <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--muted)', marginLeft: 8 }}>({m.type})</span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--slate)', marginTop: 3 }}>
                    {m.frequency} · {m.duration} · {m.timing}
                    {m.notes && <span style={{ color: 'var(--muted)' }}> · {m.notes}</span>}
                  </div>
                </div>
              ))}
            </div>

            {presc.labTests && (
              <div style={{ padding: '10px 14px', background: 'var(--amber-bg)', borderRadius: 8, marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: 'var(--amber)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Investigations</div>
                <div style={{ fontSize: 13, color: 'var(--slate)' }}>{presc.labTests}</div>
              </div>
            )}

            {presc.advice && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>Advice</div>
                <div style={{ fontSize: 13, color: 'var(--slate)' }}>{presc.advice}</div>
              </div>
            )}

            <div style={{ marginTop: 32, display: 'flex', justifyContent: 'flex-end' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ width: 120, borderTop: '1.5px solid var(--navy)', paddingTop: 6 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>Dr. {presc.doctorName}</div>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </Layout>
  )
}
