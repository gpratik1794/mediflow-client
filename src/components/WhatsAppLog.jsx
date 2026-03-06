// src/components/WhatsAppLog.jsx
// Reusable component — shows outbound sends + inbound replies for a visit or appointment

import React, { useState, useEffect } from 'react'
import { getWhatsAppLogs, getInboundMessages } from '../firebase/whatsapp'

export default function WhatsAppLog({ centreId, visitId, apptId }) {
  const [outbound, setOutbound] = useState([])
  const [inbound,  setInbound]  = useState([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    if (!centreId) return
    load()
  }, [centreId, visitId, apptId])

  async function load() {
    setLoading(true)
    const context = visitId ? { visitId } : { apptId }
    const [out, inn] = await Promise.all([
      getWhatsAppLogs(centreId, context),
      getInboundMessages(centreId, context)
    ])
    setOutbound(out)
    setInbound(inn)
    setLoading(false)
  }

  // Merge and sort by time
  const all = [
    ...outbound.map(m => ({ ...m, _type: 'out' })),
    ...inbound.map(m  => ({ ...m, _type: 'in'  }))
  ].sort((a, b) => {
    const ta = a.sentAt?.seconds || a.receivedAt?.seconds || 0
    const tb = b.sentAt?.seconds || b.receivedAt?.seconds || 0
    return ta - tb
  })

  const fmt = ts => {
    if (!ts?.seconds) return '—'
    return new Date(ts.seconds * 1000).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
  }

  if (loading) return (
    <div style={{ padding: '16px 20px', color: 'var(--muted)', fontSize: 13 }}>Loading messages…</div>
  )

  if (all.length === 0) return (
    <div style={{ padding: '20px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
      No WhatsApp activity yet for this {visitId ? 'visit' : 'appointment'}.
    </div>
  )

  return (
    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {all.map((m, i) => {
        const isOut = m._type === 'out'
        return (
          <div key={m.id || i} style={{
            display: 'flex',
            justifyContent: isOut ? 'flex-end' : 'flex-start'
          }}>
            <div style={{
              maxWidth: '80%',
              background: isOut ? 'var(--teal-light)' : '#fff',
              border: `1px solid ${isOut ? 'var(--teal)' : 'var(--border)'}`,
              borderRadius: isOut ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
              padding: '8px 12px',
            }}>
              {/* Direction label */}
              <div style={{ fontSize: 10, fontWeight: 600, color: isOut ? 'var(--teal)' : 'var(--slate)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {isOut ? `↑ Sent · ${m.purpose || ''}` : `↓ Reply from patient`}
              </div>

              {isOut ? (
                <>
                  <div style={{ fontSize: 12, color: 'var(--navy)', marginBottom: 3 }}>
                    <strong>{m.campaignName}</strong>
                  </div>
                  {m.params?.length > 0 && (
                    <div style={{ fontSize: 11, color: 'var(--slate)' }}>
                      Params: {m.params.join(', ')}
                    </div>
                  )}
                  <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                      fontSize: 10, padding: '1px 7px', borderRadius: 20, fontWeight: 600,
                      background: m.status === 'sent' ? '#D1FAE5' : '#FEE2E2',
                      color: m.status === 'sent' ? '#065F46' : '#991B1B'
                    }}>
                      {m.status === 'sent' ? '✓ Sent' : '✕ Failed'}
                    </span>
                    {m.status === 'failed' && m.error && (
                      <span style={{ fontSize: 10, color: 'var(--red)' }}>{m.error}</span>
                    )}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--navy)' }}>
                  {m.message}
                </div>
              )}

              <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4, textAlign: 'right' }}>
                {fmt(m.sentAt || m.receivedAt)}
              </div>
            </div>
          </div>
        )
      })}

      <button onClick={load} style={{
        marginTop: 4, background: 'none', border: 'none', color: 'var(--teal)',
        fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', textAlign: 'center'
      }}>↻ Refresh</button>
    </div>
  )
}
