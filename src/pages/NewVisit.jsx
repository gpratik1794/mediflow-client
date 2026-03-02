// src/pages/NewVisit.jsx
// Full flow: Register Patient → Select Tests → Generate Bill
import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../utils/AuthContext'
import Layout from '../components/Layout'
import { Card, CardHeader, Input, Select, Btn, Toast } from '../components/UI'
import { createPatient, createVisit, getTestCatalogue, generateBillNumber, searchPatients, saveTest } from '../firebase/db'
import { sendCampaign } from '../firebase/whatsapp'
import { format } from 'date-fns'

const STEPS = ['Patient', 'Tests', 'Review & Bill']

export default function NewVisit() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [step, setStep]         = useState(0)
  const [loading, setLoading]   = useState(false)
  const [toast, setToast]       = useState(null)
  const [tests, setTests]       = useState([])
  const [searchResults, setSearchResults] = useState([])
  const [testSearch, setTestSearch]       = useState('')
  const [showAddTest, setShowAddTest]     = useState(false)
  const [newTest, setNewTest]             = useState({ name: '', category: 'Other', price: '', gst: '0' })

  // Patient form
  const [patient, setPatient] = useState({
    name: '', phone: '', age: '', gender: '', refDoctor: '', sampleType: 'Walk-in'
  })

  // Selected tests
  const [selected, setSelected] = useState([])

  // Discount
  const [discount, setDiscount] = useState(0)

  const setP = k => e => setPatient(p => ({ ...p, [k]: e.target.value }))

  useEffect(() => { loadTests() }, [user])

  async function loadTests() {
    if (!user) return
    const data = await getTestCatalogue(user.uid)
    setTests(data.filter(t => !t.deleted))
  }

  // Search existing patient by phone
  async function handlePhoneSearch(phone) {
    setP('phone')({ target: { value: phone } })
    if (phone.length === 10) {
      const results = await searchPatients(user.uid, phone)
      setSearchResults(results)
    } else {
      setSearchResults([])
    }
  }

  function fillPatient(p) {
    setPatient({ name: p.name, phone: p.phone, age: p.age, gender: p.gender, refDoctor: p.refDoctor || '', sampleType: 'Walk-in' })
    setSearchResults([])
  }

  // Test selection
  const categories = [...new Set(tests.map(t => t.category))].sort()
  const [activeCategory, setActiveCategory] = useState('All')

  const filteredTests = tests.filter(t => {
    const matchCat = activeCategory === 'All' || t.category === activeCategory
    const matchSearch = !testSearch || t.name.toLowerCase().includes(testSearch.toLowerCase())
    return matchCat && matchSearch
  })

  function toggleTest(test) {
    setSelected(s => s.find(t => t.id === test.id)
      ? s.filter(t => t.id !== test.id)
      : [...s, test])
  }

  // Bill calculations
  const subtotal = selected.reduce((s, t) => s + (t.price || 0), 0)
  const gstAmount = selected.reduce((s, t) => {
    const gstPct = t.gst || 0
    return s + Math.round(t.price * gstPct / 100)
  }, 0)
  const discountAmt = Math.round(subtotal * (discount / 100))
  const totalAmount = subtotal + gstAmount - discountAmt

  async function handleAddNewTest() {
    if (!newTest.name || !newTest.price) return
    const id = await saveTest(user.uid, { ...newTest, price: Number(newTest.price), gst: Number(newTest.gst) })
    await loadTests()
    setShowAddTest(false)
    setNewTest({ name: '', category: 'Other', price: '', gst: '0' })
    setToast({ message: 'Test added to catalogue', type: 'success' })
  }

  async function handleSubmit() {
    if (!patient.name || !patient.phone || !selected.length) return
    setLoading(true)
    try {
      const today = format(new Date(), 'yyyy-MM-dd')
      const billNo = generateBillNumber()

      // Save patient
      const patientId = await createPatient(user.uid, {
        name: patient.name, phone: patient.phone,
        age: patient.age, gender: patient.gender
      })

      // Save visit
      const visitId = await createVisit(user.uid, {
        patientId, patientName: patient.name,
        phone: patient.phone, age: patient.age, gender: patient.gender,
        refDoctor: patient.refDoctor, sampleType: patient.sampleType,
        tests: selected.map(t => ({ id: t.id, name: t.name, price: t.price, gst: t.gst || 0 })),
        subtotal, gstAmount, discount: discountAmt, totalAmount,
        billNo, date: today, status: 'registered', paymentStatus: 'pending',
        visitId: billNo,
        centreName: profile?.centreName || ''
      })

      setToast({ message: `Visit registered — Bill No. ${billNo}`, type: 'success' })

      // Send bill WhatsApp
      if (profile?.whatsappCampaigns?.length) {
        sendCampaign(
          profile.whatsappCampaigns, 'bill_generated', patient.phone,
          [patient.name, profile.centreName || 'the centre', String(totalAmount)]
        )
      }

      setTimeout(() => navigate(`/visits/${visitId}`), 1200)
    } catch (err) {
      setToast({ message: 'Failed to register visit', type: 'error' })
    }
    setLoading(false)
  }

  const gstOpts = [{ value:'0',label:'0% GST'},{ value:'5',label:'5%'},{ value:'12',label:'12%'},{ value:'18',label:'18%'}]

  return (
    <Layout title="New Visit">
      {/* Steps */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 28 }}>
        {STEPS.map((s, i) => (
          <React.Fragment key={s}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: i < step ? 'pointer' : 'default' }}
              onClick={() => i < step && setStep(i)}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 600,
                background: i <= step ? 'var(--teal)' : 'var(--border)',
                color: i <= step ? '#fff' : 'var(--muted)'
              }}>{i < step ? '✓' : i + 1}</div>
              <span style={{ fontSize: 14, fontWeight: i === step ? 600 : 400, color: i === step ? 'var(--navy)' : 'var(--muted)' }}>{s}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div style={{ flex: 1, height: 2, background: i < step ? 'var(--teal)' : 'var(--border)', margin: '0 12px', transition: 'background 0.3s' }} />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* STEP 0 — PATIENT */}
      {step === 0 && (
        <Card style={{ maxWidth: 600 }}>
          <CardHeader title="Patient Registration" sub="Search by phone or register new patient" />
          <div style={{ padding: '24px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Phone search */}
            <div style={{ position: 'relative' }}>
              <Input label="Mobile Number *" type="tel" value={patient.phone}
                onChange={e => handlePhoneSearch(e.target.value)} placeholder="10-digit number" />
              {searchResults.length > 0 && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
                  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
                  boxShadow: 'var(--shadow-lg)', overflow: 'hidden', marginTop: 4
                }}>
                  {searchResults.map(p => (
                    <div key={p.id} onClick={() => fillPatient(p)} style={{
                      padding: '12px 16px', cursor: 'pointer', fontSize: 13,
                      borderBottom: '1px solid var(--border)'
                    }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--teal-light)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <strong>{p.name}</strong> · {p.age}y · {p.gender}
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>Returning patient</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Input label="Full Name *" value={patient.name} onChange={setP('name')} placeholder="Patient full name" />
            <div style={{ display: 'flex', gap: 12 }}>
              <Input label="Age *" type="number" value={patient.age} onChange={setP('age')} placeholder="Years" />
              <Select label="Gender *" value={patient.gender} onChange={setP('gender')}
                options={[{ value:'',label:'Select'},{ value:'Male',label:'Male'},{ value:'Female',label:'Female'},{ value:'Other',label:'Other'}]} />
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <Input label="Referring Doctor" value={patient.refDoctor} onChange={setP('refDoctor')} placeholder="Dr. Name (optional)" />
              <Select label="Sample Type" value={patient.sampleType} onChange={setP('sampleType')}
                options={['Walk-in','Home Collection']} />
            </div>
            <Btn onClick={() => { if (patient.name && patient.phone && patient.age && patient.gender) setStep(1) }}
              style={{ alignSelf: 'flex-end' }}>
              Next: Select Tests →
            </Btn>
          </div>
        </Card>
      )}

      {/* STEP 1 — TESTS */}
      {step === 1 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20 }}>
          <Card>
            <CardHeader title="Select Tests"
              sub={`${selected.length} test${selected.length !== 1 ? 's' : ''} selected`}
              action={
                <Btn variant="ghost" small onClick={() => setShowAddTest(!showAddTest)}>
                  + Add New Test
                </Btn>
              }
            />

            {/* Inline add test form */}
            {showAddTest && (
              <div style={{ padding: '16px 22px', background: 'var(--teal-light)', borderBottom: '1px solid var(--teal-mid)' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)', marginBottom: 12 }}>Add to catalogue</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 100px 100px', gap: 10, alignItems: 'end' }}>
                  <Input label="Test Name" value={newTest.name} onChange={e => setNewTest(t => ({ ...t, name: e.target.value }))} placeholder="e.g. CBC" />
                  <Input label="Category" value={newTest.category} onChange={e => setNewTest(t => ({ ...t, category: e.target.value }))} placeholder="e.g. Haematology" />
                  <Input label="Price (₹)" type="number" value={newTest.price} onChange={e => setNewTest(t => ({ ...t, price: e.target.value }))} placeholder="0" />
                  <Select label="GST" value={newTest.gst} onChange={e => setNewTest(t => ({ ...t, gst: e.target.value }))} options={gstOpts} />
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <Btn small onClick={handleAddNewTest}>Save Test</Btn>
                  <Btn small variant="ghost" onClick={() => setShowAddTest(false)}>Cancel</Btn>
                </div>
              </div>
            )}

            {/* Search + Categories */}
            <div style={{ padding: '14px 22px', borderBottom: '1px solid var(--border)' }}>
              <input value={testSearch} onChange={e => setTestSearch(e.target.value)}
                placeholder="🔍 Search tests…" style={{
                  width: '100%', border: '1.5px solid var(--border)', borderRadius: 8,
                  padding: '8px 12px', fontSize: 13, outline: 'none', fontFamily: 'DM Sans, sans-serif',
                  color: 'var(--navy)'
                }} />
            </div>
            <div style={{ display: 'flex', gap: 4, padding: '10px 22px', flexWrap: 'wrap', borderBottom: '1px solid var(--border)' }}>
              {['All', ...categories].map(c => (
                <button key={c} onClick={() => setActiveCategory(c)} style={{
                  padding: '5px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
                  fontSize: 12, fontFamily: 'DM Sans, sans-serif', transition: 'all 0.18s',
                  background: activeCategory === c ? 'var(--teal)' : 'var(--bg)',
                  color: activeCategory === c ? '#fff' : 'var(--slate)',
                  fontWeight: activeCategory === c ? 500 : 400
                }}>{c}</button>
              ))}
            </div>

            {/* Tests grid */}
            <div style={{ padding: 22, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10, maxHeight: 400, overflowY: 'auto' }}>
              {filteredTests.map(test => {
                const isSelected = selected.find(t => t.id === test.id)
                return (
                  <div key={test.id} onClick={() => toggleTest(test)} style={{
                    padding: '12px 16px', borderRadius: 10, cursor: 'pointer',
                    border: `2px solid ${isSelected ? 'var(--teal)' : 'var(--border)'}`,
                    background: isSelected ? 'var(--teal-light)' : 'var(--surface)',
                    transition: 'all 0.18s'
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--navy)', marginBottom: 2 }}>{test.name}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>{test.category}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: isSelected ? 'var(--teal)' : 'var(--navy)' }}>₹{test.price}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>

          {/* Selected panel */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Card>
              <CardHeader title="Selected Tests" sub={`${selected.length} test(s)`} />
              <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                {selected.length === 0 ? (
                  <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No tests selected</div>
                ) : selected.map(t => (
                  <div key={t.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 18px', borderBottom: '1px solid var(--border)', fontSize: 13
                  }}>
                    <span style={{ color: 'var(--navy)', fontWeight: 500 }}>{t.name}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ color: 'var(--slate)' }}>₹{t.price}</span>
                      <button onClick={() => toggleTest(t)} style={{
                        background: 'var(--red-bg)', color: 'var(--red)', border: 'none',
                        borderRadius: 6, width: 22, height: 22, cursor: 'pointer', fontSize: 14
                      }}>×</button>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ padding: '14px 18px', borderTop: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>
                  <span>Subtotal</span><span>₹{subtotal}</span>
                </div>
                {gstAmount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>
                    <span>GST</span><span>₹{gstAmount}</span>
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>Discount %</span>
                  <input type="number" min="0" max="100" value={discount} onChange={e => setDiscount(Number(e.target.value))}
                    style={{ width: 60, border: '1.5px solid var(--border)', borderRadius: 6, padding: '4px 8px', fontSize: 13, outline: 'none', fontFamily: 'DM Sans, sans-serif' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 700, color: 'var(--navy)', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                  <span>Total</span><span>₹{totalAmount}</span>
                </div>
              </div>
            </Card>
            <div style={{ display: 'flex', gap: 10 }}>
              <Btn variant="ghost" onClick={() => setStep(0)} style={{ flex: 1, justifyContent: 'center' }}>← Back</Btn>
              <Btn onClick={() => selected.length > 0 && setStep(2)} style={{ flex: 2, justifyContent: 'center' }}
                disabled={selected.length === 0}>
                Review →
              </Btn>
            </div>
          </div>
        </div>
      )}

      {/* STEP 2 — REVIEW & BILL */}
      {step === 2 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20 }}>
          <Card>
            <CardHeader title="Review Visit" sub="Confirm details before registering" />
            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Patient */}
              <div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.8 }}>Patient</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {[['Name', patient.name], ['Phone', patient.phone], ['Age', patient.age + ' years'], ['Gender', patient.gender], ['Sample Type', patient.sampleType], ['Ref. Doctor', patient.refDoctor || '—']].map(([l, v]) => (
                    <div key={l}>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{l}</div>
                      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)' }}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
              {/* Tests */}
              <div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.8 }}>Tests ({selected.length})</div>
                {selected.map(t => (
                  <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                    <span style={{ color: 'var(--slate)' }}>{t.name}</span>
                    <div>
                      {t.gst > 0 && <span style={{ fontSize: 11, color: 'var(--muted)', marginRight: 8 }}>+{t.gst}% GST</span>}
                      <span style={{ fontWeight: 600, color: 'var(--navy)' }}>₹{t.price}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {/* Bill summary */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Card>
              <CardHeader title="Bill Summary" />
              <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  ['Subtotal', `₹${subtotal}`],
                  ['GST', `₹${gstAmount}`],
                  ['Discount', `-₹${discountAmt}`],
                ].map(([l, v]) => (
                  <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--slate)' }}>
                    <span>{l}</span><span>{v}</span>
                  </div>
                ))}
                <div style={{ borderTop: '2px solid var(--border)', paddingTop: 10, display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 700, color: 'var(--navy)' }}>
                  <span>Total</span><span>₹{totalAmount}</span>
                </div>
                <div style={{ background: 'var(--teal-light)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--teal)', marginTop: 4 }}>
                  📱 WhatsApp confirmation will be sent to {patient.phone}
                </div>
              </div>
            </Card>
            <div style={{ display: 'flex', gap: 10 }}>
              <Btn variant="ghost" onClick={() => setStep(1)} style={{ flex: 1, justifyContent: 'center' }}>← Back</Btn>
              <Btn onClick={handleSubmit} disabled={loading} style={{ flex: 2, justifyContent: 'center' }}>
                {loading ? 'Registering…' : '✓ Confirm & Register'}
              </Btn>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </Layout>
  )
}
