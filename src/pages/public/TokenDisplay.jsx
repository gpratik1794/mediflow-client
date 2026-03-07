// src/pages/public/TokenDisplay.jsx
// TV/wall display — shows current token being served, real-time via onSnapshot
// URL: /display/:centreId
// No auth required

import React, { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { doc, collection, query, where, orderBy, onSnapshot, getDoc } from 'firebase/firestore'
import { db } from '../../firebase/config'

// ── Helpers ──────────────────────────────────────────────────────────────────
function getSession(morningEnd) {
  const now = new Date()
  const currentMins = now.getHours() * 60 + now.getMinutes()
  const [endH, endM] = (morningEnd || '13:00').split(':').map(Number)
  const morningEndMins = endH * 60 + endM
  return currentMins < morningEndMins ? 'morning' : 'evening'
}

function getTodayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatTime(str) {
  // "10:30 AM" → "10:30 AM"
  return str || ''
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function TokenDisplay() {
  const { centreId } = useParams()

  const [centre, setCentre]           = useState(null)
  const [session, setSession]         = useState(getSession(null))
  const [currentToken, setCurrentToken] = useState(null)
  const [nextTokens, setNextTokens]   = useState([])
  const [waitingCount, setWaitingCount] = useState(0)
  const [doneCount, setDoneCount]     = useState(0)
  const [allDone, setAllDone]         = useState(false)
  const [notFound, setNotFound]       = useState(false)
  const [time, setTime]               = useState(new Date())
  const prevTokenRef                  = useRef(null)
  const [flash, setFlash]             = useState(false)

  // Clock tick — re-evaluate session every 30s using clinic's actual morningEnd
  useEffect(() => {
    const t = setInterval(() => {
      setTime(new Date())
      setSession(getSession(centre?.morningEnd))
    }, 30000)
    return () => clearInterval(t)
  }, [centre])

  // Set session immediately once centre loads
  useEffect(() => {
    if (centre?.morningEnd) setSession(getSession(centre.morningEnd))
  }, [centre?.morningEnd])

  // Load centre profile
  useEffect(() => {
    if (!centreId) return
    getDoc(doc(db, 'centres', centreId, 'profile', 'main')).then(snap => {
      if (!snap.exists()) { setNotFound(true); return }
      setCentre(snap.data())
    })
    getDoc(doc(db, 'clients', centreId)).then(snap => {
      if (snap.exists()) setCentre(prev => ({ ...prev, ...snap.data() }))
    })
  }, [centreId])

  // Real-time appointments listener
  useEffect(() => {
    if (!centreId) return
    const today = getTodayStr()
    const q = query(
      collection(db, 'centres', centreId, 'appointments'),
      where('date', '==', today),
      where('status', 'in', ['scheduled', 'waiting', 'in-consultation', 'done', 'cancelled'])
    )
    const unsub = onSnapshot(q, snap => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }))

      // Filter to current session
      const sessionAppts = all.filter(a => {
        if (!a.appointmentTime || a.appointmentTime === 'Walk-in (no slot)') return true
        const parts = a.appointmentTime.trim().split(' ')
        const hm = parts[0].split(':')
        let h = Number(hm[0])
        if (parts[1] === 'PM' && h !== 12) h += 12
        if (parts[1] === 'AM' && h === 12) h = 0
        return session === 'morning' ? h < 14 : h >= 14
      }).filter(a => a.status !== 'cancelled')

      // Sort by token
      sessionAppts.sort((a, b) => (a.tokenNumber || 0) - (b.tokenNumber || 0))

      // Current = in-consultation, else last done
      const inConsult = sessionAppts.find(a => a.status === 'in-consultation')
      const done = sessionAppts.filter(a => a.status === 'done')
      const waiting = sessionAppts.filter(a => a.status === 'waiting' || a.status === 'scheduled')

      const current = inConsult || (done.length > 0 ? done[done.length - 1] : null)

      // Flash on token change
      if (current && current.tokenNumber !== prevTokenRef.current) {
        prevTokenRef.current = current.tokenNumber
        setFlash(true)
        setTimeout(() => setFlash(false), 1500)
      }

      setCurrentToken(current)
      setNextTokens(waiting.slice(0, 3))
      setWaitingCount(waiting.length)
      setDoneCount(done.length)
      setAllDone(waiting.length === 0 && done.length > 0 && !inConsult)
    })
    return () => unsub()
  }, [centreId, session])

  // ── Format clock ──
  const hours = time.getHours()
  const mins  = String(time.getMinutes()).padStart(2, '0')
  const ampm  = hours >= 12 ? 'PM' : 'AM'
  const h12   = hours % 12 || 12
  const clockStr = `${h12}:${mins} ${ampm}`
  const dayStr = time.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  if (notFound) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#0D1B2A', color: '#8FA3B0', fontFamily: 'DM Sans, sans-serif', fontSize: 18 }}>
      Clinic not found
    </div>
  )

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0D1B2A 0%, #0B2D3E 50%, #0D1B2A 100%)',
      fontFamily: "'DM Sans', sans-serif",
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      position: 'relative'
    }}>
      {/* Background grid pattern */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: 'linear-gradient(rgba(11,158,138,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(11,158,138,0.04) 1px, transparent 1px)',
        backgroundSize: '60px 60px'
      }} />

      {/* Top bar */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '20px 40px', borderBottom: '1px solid rgba(11,158,138,0.15)',
        position: 'relative', zIndex: 1
      }}>
        {/* Clinic name */}
        <div>
          <div style={{ fontSize: 13, color: '#0B9E8A', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 2 }}>
            MediFlow
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'white', letterSpacing: -0.5 }}>
            {centre?.centreName || 'Loading…'}
          </div>
        </div>

        {/* Session badge */}
        <div style={{
          background: 'rgba(11,158,138,0.12)', border: '1px solid rgba(11,158,138,0.3)',
          borderRadius: 12, padding: '8px 20px', textAlign: 'center'
        }}>
          <div style={{ fontSize: 11, color: '#0B9E8A', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5 }}>
            {session === 'morning' ? '🌅 Morning Session' : '🌆 Evening Session'}
          </div>
        </div>

        {/* Clock */}
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 32, fontWeight: 800, color: 'white', letterSpacing: -1, lineHeight: 1 }}>
            {clockStr}
          </div>
          <div style={{ fontSize: 12, color: '#8FA3B0', marginTop: 4 }}>{dayStr}</div>
        </div>
      </div>

      {/* Main content */}
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '40px', gap: 40, position: 'relative', zIndex: 1
      }}>

        {/* Current token — BIG */}
        <div style={{
          flex: 1.4, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(11,158,138,0.06)', border: `2px solid ${flash ? '#0B9E8A' : 'rgba(11,158,138,0.2)'}`,
          borderRadius: 28, padding: '60px 40px', textAlign: 'center',
          transition: 'border-color 0.3s, box-shadow 0.3s',
          boxShadow: flash ? '0 0 60px rgba(11,158,138,0.3)' : 'none',
          position: 'relative', overflow: 'hidden'
        }}>
          {/* Glow circle behind number */}
          <div style={{
            position: 'absolute', width: 300, height: 300, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(11,158,138,0.12) 0%, transparent 70%)',
            top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            pointerEvents: 'none'
          }} />

          <div style={{ fontSize: 14, fontWeight: 700, color: '#0B9E8A', textTransform: 'uppercase', letterSpacing: 3, marginBottom: 16 }}>
            Now Serving
          </div>

          {allDone ? (
            <>
              <div style={{ fontSize: 72, fontWeight: 900, color: 'white', lineHeight: 1 }}>✓</div>
              <div style={{ fontSize: 20, color: '#8FA3B0', marginTop: 16, fontWeight: 500 }}>Session Complete</div>
              <div style={{ fontSize: 14, color: '#4A6572', marginTop: 8 }}>All {doneCount} patients seen</div>
            </>
          ) : currentToken ? (
            <>
              <div style={{
                fontSize: 160, fontWeight: 900, color: 'white', lineHeight: 0.9,
                letterSpacing: -8, fontVariantNumeric: 'tabular-nums',
                textShadow: '0 0 80px rgba(11,158,138,0.4)',
                animation: flash ? 'tokenPulse 0.4s ease-out' : 'none'
              }}>
                {currentToken.tokenNumber}
              </div>
              <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  fontSize: 12, padding: '4px 14px', borderRadius: 20, fontWeight: 700,
                  background: currentToken.status === 'in-consultation' ? 'rgba(11,158,138,0.2)' : 'rgba(255,255,255,0.08)',
                  color: currentToken.status === 'in-consultation' ? '#0B9E8A' : '#8FA3B0',
                  textTransform: 'uppercase', letterSpacing: 1
                }}>
                  {currentToken.status === 'in-consultation' ? '● In Consultation' : '● Last Called'}
                </div>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 72, fontWeight: 900, color: '#2A4A5A', lineHeight: 1 }}>—</div>
              <div style={{ fontSize: 18, color: '#4A6572', marginTop: 16 }}>Waiting to start</div>
            </>
          )}
        </div>

        {/* Right panel */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Up Next */}
          <div style={{
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 20, padding: '28px 32px'
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#4A6572', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 20 }}>
              Up Next
            </div>
            {nextTokens.length === 0 ? (
              <div style={{ fontSize: 16, color: '#4A6572', fontStyle: 'italic' }}>No more tokens waiting</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {nextTokens.map((a, i) => (
                  <div key={a.id} style={{
                    display: 'flex', alignItems: 'center', gap: 16,
                    padding: '14px 18px', borderRadius: 14,
                    background: i === 0 ? 'rgba(11,158,138,0.1)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${i === 0 ? 'rgba(11,158,138,0.25)' : 'rgba(255,255,255,0.06)'}`
                  }}>
                    <div style={{
                      width: 48, height: 48, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: i === 0 ? 'rgba(11,158,138,0.2)' : 'rgba(255,255,255,0.06)',
                      fontSize: 22, fontWeight: 900,
                      color: i === 0 ? '#0B9E8A' : '#4A6572',
                      flexShrink: 0
                    }}>
                      {a.tokenNumber}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, color: i === 0 ? '#8FA3B0' : '#4A6572', fontWeight: 500 }}>
                        {a.appointmentTime !== 'Walk-in (no slot)' ? a.appointmentTime : 'Walk-in'}
                      </div>
                      {i === 0 && (
                        <div style={{ fontSize: 11, color: '#0B9E8A', marginTop: 2, fontWeight: 600 }}>Next up</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div style={{
              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 16, padding: '22px 24px', textAlign: 'center'
            }}>
              <div style={{ fontSize: 42, fontWeight: 900, color: 'white', lineHeight: 1 }}>{doneCount}</div>
              <div style={{ fontSize: 11, color: '#4A6572', marginTop: 6, textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 600 }}>Seen</div>
            </div>
            <div style={{
              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 16, padding: '22px 24px', textAlign: 'center'
            }}>
              <div style={{ fontSize: 42, fontWeight: 900, color: waitingCount > 0 ? '#F59E0B' : '#4A6572', lineHeight: 1 }}>{waitingCount}</div>
              <div style={{ fontSize: 11, color: '#4A6572', marginTop: 6, textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 600 }}>Waiting</div>
            </div>
          </div>

          {/* Powered by */}
          <div style={{ textAlign: 'center', paddingTop: 4 }}>
            <div style={{ fontSize: 11, color: '#2A4A5A', fontWeight: 600, letterSpacing: 1 }}>POWERED BY MEDIFLOW</div>
          </div>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700;800;900&display=swap');
        @keyframes tokenPulse {
          0% { transform: scale(1.08); }
          100% { transform: scale(1); }
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0D1B2A; }
      `}</style>
    </div>
  )
}
