// src/pages/Reports.jsx
import React, { useState, useEffect } from 'react'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../utils/AuthContext'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import { Card, CardHeader, Btn, Empty, Toast } from '../components/UI'
import { sendCampaign } from '../firebase/whatsapp'
import { format } from 'date-fns'

export default function Reports() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [visits, setVisits]   = useState([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast]     = useState(null)
  const today = format(new Date(), 'yyyy-MM-dd')

  useEffect(() => { loadReports() }, [user])

  async function loadReports() {
    setLoading(true)
    const ref = collection(db, 'centres', user.uid, 'visits')
    const q = query(ref, where('date', '==', today), where('status', '==', 'ready'))
    const snap = await getDocs(q)
    setVisits(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    setLoading(false)
  }

  async function handleSendWA(v) {
    if (!profile?.whatsappCampaigns?.length) {
      setToast({ message: 'No campaigns configured. Go to Settings → WhatsApp Campaigns.', type: 'error' }); return
    }
    const result = await sendCampaign(
      profile.whatsappCampaigns, 'report_ready', v.phone,
      [v.patientName, profile.centreName]
    )
    setToast({ message: result.ok ? `Report sent to ${v.patientName}` : `WhatsApp failed: ${result.error}`, type: result.ok ? 'success' : 'error' })
  }

  async function handleSendAll() {
    if (!profile?.whatsappCampaigns?.length) {
      setToast({ message: 'No campaigns configured. Go to Settings → WhatsApp Campaigns.', type: 'error' }); return
    }
    let sent = 0
    for (const v of visits) {
      const result = await sendCampaign(profile.whatsappCampaigns, 'report_ready', v.phone, [v.patientName, profile.centreName])
      if (result.ok) sent++
    }
    setToast({ message: `Sent ${sent} of ${visits.length} reports`, type: 'success' })
  }

  return (
    <Layout
      title="Reports Ready"
      action={
        <div style={{ display: 'flex', gap: 10 }}>
          <Btn variant="ghost" small onClick={loadReports}>🔄 Refresh</Btn>
          {visits.length > 0 && <Btn onClick={handleSendAll}>💬 Send All on WhatsApp</Btn>}
        </div>
      }
    >
      <Card>
        <CardHeader
          title={`${visits.length} reports ready today`}
          sub="Reports marked as ready, awaiting WhatsApp delivery"
        />

        {loading ? <Empty icon="⏳" message="Loading…" /> :
         visits.length === 0 ? (
          <Empty icon="📄" message="No reports ready yet today. Update visit status to 'Ready' to see reports here." />
        ) : (
          <div style={{ padding: '12px 0' }}>
            {visits.map(v => (
              <div key={v.id} style={{
                display: 'flex', alignItems: 'center', gap: 16,
                padding: '14px 22px', borderBottom: '1px solid var(--border)',
                cursor: 'pointer', transition: 'background 0.15s'
              }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--teal-light)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                {/* Avatar */}
                <div style={{
                  width: 44, height: 44, borderRadius: 12, background: 'var(--teal-light)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16, fontWeight: 700, color: 'var(--teal)', flexShrink: 0
                }}>
                  {v.patientName?.charAt(0)}
                </div>

                {/* Info */}
                <div style={{ flex: 1 }} onClick={() => navigate(`/visits/${v.id}`)}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--navy)' }}>{v.patientName}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                    {v.phone} · {(v.tests||[]).map(t => t.name).join(', ')}
                  </div>
                </div>

                {/* Amount */}
                <div style={{ textAlign: 'right', marginRight: 16 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--navy)' }}>₹{v.totalAmount||0}</div>
                  <div style={{ fontSize: 11, color: v.paymentStatus === 'paid' ? 'var(--green)' : 'var(--amber)' }}>
                    {v.paymentStatus === 'paid' ? '✅ Paid' : '⏳ Pending'}
                  </div>
                </div>

                {/* Time */}
                <div style={{ fontSize: 12, color: 'var(--muted)', width: 60, textAlign: 'center' }}>
                  {v.createdAt?.seconds ? format(new Date(v.createdAt.seconds * 1000), 'hh:mm a') : '—'}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <Btn small variant="ghost" onClick={() => navigate(`/visits/${v.id}`)}>View</Btn>
                  <button onClick={() => handleSendWA(v)} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    background: '#25D366', color: '#fff', border: 'none',
                    borderRadius: 8, padding: '6px 14px', fontSize: 12,
                    cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontWeight: 500
                  }}>
                    💬 Send Report
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </Layout>
  )
}
