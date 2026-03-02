// src/pages/clinic/FollowUps.jsx
import React, { useState, useEffect } from 'react'
import { useAuth } from '../../utils/AuthContext'
import Layout from '../../components/Layout'
import { Card, CardHeader, Btn, Empty, Toast } from '../../components/UI'
import { getUpcomingFollowUps, updateFollowUp, sendClinicWhatsApp } from '../../firebase/clinicDb'
import { format } from 'date-fns'

export default function FollowUps() {
  const { user, profile } = useAuth()
  const [followUps, setFollowUps] = useState([])
  const [loading, setLoading]     = useState(true)
  const [toast, setToast]         = useState(null)
  const today = format(new Date(), 'yyyy-MM-dd')

  useEffect(() => { load() }, [user])

  async function load() {
    setLoading(true)
    const data = await getUpcomingFollowUps(user.uid)
    setFollowUps(data)
    setLoading(false)
  }

  async function sendReminder(f) {
    if (!profile?.aisynergyKey) {
      setToast({ message: 'Add Aisynergy key in Settings first', type: 'error' }); return
    }
    const ok = await sendClinicWhatsApp(
      profile.aisynergyKey, f.patientPhone,
      'mediflow_followup_reminder',
      [f.patientName, profile?.ownerName || 'Doctor', f.followUpDate]
    )
    if (ok) {
      await updateFollowUp(user.uid, f.id, { reminded: true, remindedAt: new Date().toISOString() })
      setFollowUps(fu => fu.map(x => x.id === f.id ? { ...x, reminded: true } : x))
    }
    setToast({ message: ok ? `Reminder sent to ${f.patientName}` : 'Send failed', type: ok ? 'success' : 'error' })
  }

  async function sendAll() {
    if (!profile?.aisynergyKey) {
      setToast({ message: 'Add Aisynergy key in Settings first', type: 'error' }); return
    }
    let sent = 0
    for (const f of followUps.filter(x => !x.reminded)) {
      const ok = await sendClinicWhatsApp(profile.aisynergyKey, f.patientPhone, 'mediflow_followup_reminder', [f.patientName, profile?.ownerName || 'Doctor', f.followUpDate])
      if (ok) {
        await updateFollowUp(user.uid, f.id, { reminded: true })
        sent++
      }
    }
    await load()
    setToast({ message: `Sent ${sent} reminders`, type: 'success' })
  }

  const dueToday = followUps.filter(f => f.followUpDate === today)
  const upcoming = followUps.filter(f => f.followUpDate > today)
  const notReminded = followUps.filter(f => !f.reminded).length

  const FollowUpRow = ({ f }) => {
    const isToday = f.followUpDate === today
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '14px 22px', borderBottom: '1px solid var(--border)',
      }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12, flexShrink: 0,
          background: isToday ? 'var(--red-bg)' : 'var(--teal-light)',
          color: isToday ? 'var(--red)' : 'var(--teal)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16, fontWeight: 700
        }}>
          {f.patientName?.charAt(0)}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)' }}>{f.patientName}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>{f.patientPhone}</div>
        </div>
        <div style={{ textAlign: 'center', minWidth: 90 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: isToday ? 'var(--red)' : 'var(--navy)' }}>
            {f.followUpDate}
          </div>
          {isToday && (
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--red)', background: 'var(--red-bg)', padding: '2px 8px', borderRadius: 20, display: 'inline-block', marginTop: 3 }}>
              TODAY
            </div>
          )}
        </div>
        {f.reminded ? (
          <span style={{ fontSize: 11, color: 'var(--green)', fontWeight: 500, background: 'var(--green-bg)', padding: '4px 12px', borderRadius: 20 }}>
            ✓ Reminded
          </span>
        ) : (
          <button onClick={() => sendReminder(f)} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
            background: '#25D366', color: '#fff', border: 'none', borderRadius: 8,
            fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontWeight: 500
          }}>
            💬 Send Reminder
          </button>
        )}
      </div>
    )
  }

  return (
    <Layout
      title="Follow-ups"
      action={
        notReminded > 0 && (
          <Btn onClick={sendAll}>💬 Send All {notReminded} Reminders</Btn>
        )
      }
    >
      {/* Due today */}
      {dueToday.length > 0 && (
        <Card style={{ marginBottom: 20, border: '2px solid var(--red-bg)' }}>
          <CardHeader
            title={`🔴 Due Today (${dueToday.length})`}
            sub="These patients are due for follow-up today"
          />
          {dueToday.map(f => <FollowUpRow key={f.id} f={f} />)}
        </Card>
      )}

      {/* Upcoming */}
      <Card>
        <CardHeader
          title={`Upcoming (${upcoming.length})`}
          sub="Next 7 days"
          action={<Btn variant="ghost" small onClick={load}>🔄 Refresh</Btn>}
        />
        {loading ? <Empty icon="⏳" message="Loading…" /> :
         upcoming.length === 0 && dueToday.length === 0 ? (
          <Empty icon="📆" message="No follow-ups in the next 7 days. Great job!" />
        ) : upcoming.length === 0 ? (
          <Empty icon="✅" message="No upcoming follow-ups beyond today" />
        ) : (
          upcoming.map(f => <FollowUpRow key={f.id} f={f} />)
        )}
      </Card>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </Layout>
  )
}
