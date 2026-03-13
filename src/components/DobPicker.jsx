// src/components/DobPicker.jsx
// Reusable Day/Month/Year dropdown — replaces native date picker everywhere
// Usage: <DobPicker value={form.dob} onChange={(dob, age) => setForm(f => ({...f, dob, age}))} />

import React, { useState, useEffect } from 'react'

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
]

function daysInMonth(month, year) {
  if (!month) return 31
  return new Date(year || 2000, parseInt(month), 0).getDate()
}

function calcAge(day, month, year) {
  if (!day || !month || !year || String(year).length < 4) return ''
  const dob = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
  const today = new Date()
  if (dob > today) return ''
  let age = today.getFullYear() - dob.getFullYear()
  const m = today.getMonth() - dob.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--
  return age >= 0 ? String(age) : ''
}

function parseDob(isoStr) {
  if (!isoStr) return { day: '', month: '', year: '' }
  const parts = isoStr.split('-')
  if (parts.length !== 3) return { day: '', month: '', year: '' }
  return {
    year:  parts[0],
    month: String(parseInt(parts[1])),
    day:   String(parseInt(parts[2]))
  }
}

function toIso(day, month, year) {
  if (!day || !month || !year || String(year).length < 4) return ''
  return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`
}

const selectStyle = {
  padding: '9px 28px 9px 12px', borderRadius: 10,
  border: '1.5px solid var(--border)', fontFamily: 'DM Sans, sans-serif',
  fontSize: 13, color: 'var(--navy)', background: 'white', outline: 'none',
  cursor: 'pointer', appearance: 'none', width: '100%',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10'%3E%3Cpath fill='%238FA3B0' d='M5 7L0 2h10z'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center',
}

const labelStyle = {
  fontSize: 11, fontWeight: 600, color: 'var(--muted)',
  textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 5, display: 'block'
}

export default function DobPicker({ value, onChange, required = false }) {
  const parsed = parseDob(value)
  const [day,   setDay]   = useState(parsed.day)
  const [month, setMonth] = useState(parsed.month)
  const [year,  setYear]  = useState(parsed.year)

  // Sync inward only when value changes from outside (e.g. pre-fill from patient lookup)
  useEffect(() => {
    const p = parseDob(value)
    setDay(p.day)
    setMonth(p.month)
    setYear(p.year)
  }, [value])

  function handle(field, val) {
    const next = {
      day:   field === 'day'   ? val : day,
      month: field === 'month' ? val : month,
      year:  field === 'year'  ? val : year,
    }
    if (field === 'day')   setDay(val)
    if (field === 'month') setMonth(val)
    if (field === 'year')  setYear(val)

    const iso = toIso(next.day, next.month, next.year)
    const age = calcAge(next.day, next.month, next.year)
    onChange(iso, age)
  }

  const maxDay = daysInMonth(month, year)
  const days   = Array.from({ length: maxDay }, (_, i) => i + 1)
  const currentYear = new Date().getFullYear()
  const years  = Array.from({ length: 120 }, (_, i) => currentYear - i)
  const age    = calcAge(day, month, year)

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
      <div style={{ flex: '0 0 80px' }}>
        <label style={labelStyle}>Day</label>
        <select value={day} onChange={e => handle('day', e.target.value)} style={selectStyle}>
          <option value="">DD</option>
          {days.map(d => <option key={d} value={String(d)}>{d}</option>)}
        </select>
      </div>

      <div style={{ flex: '1 1 120px' }}>
        <label style={labelStyle}>Month</label>
        <select value={month} onChange={e => handle('month', e.target.value)} style={selectStyle}>
          <option value="">Month</option>
          {MONTHS.map((m, i) => <option key={i+1} value={String(i+1)}>{m}</option>)}
        </select>
      </div>

      <div style={{ flex: '0 0 90px' }}>
        <label style={labelStyle}>Year</label>
        <select value={year} onChange={e => handle('year', e.target.value)} style={selectStyle}>
          <option value="">YYYY</option>
          {years.map(y => <option key={y} value={String(y)}>{y}</option>)}
        </select>
      </div>

      {age && (
        <div style={{
          padding: '9px 14px', borderRadius: 10, background: 'var(--teal-light)',
          color: 'var(--teal)', fontSize: 13, fontWeight: 700,
          border: '1.5px solid var(--teal-light)', whiteSpace: 'nowrap', flexShrink: 0
        }}>
          {age} yrs
        </div>
      )}
    </div>
  )
}
