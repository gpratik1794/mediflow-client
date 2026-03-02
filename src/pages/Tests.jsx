// src/pages/Tests.jsx
import React, { useState, useEffect } from 'react'
import { useAuth } from '../utils/AuthContext'
import Layout from '../components/Layout'
import { Card, CardHeader, Btn, Input, Select, Toast, Modal, Empty } from '../components/UI'
import { getTestCatalogue, saveTest, deleteTest } from '../firebase/db'

export default function Tests() {
  const { user } = useAuth()
  const [tests, setTests]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [toast, setToast]         = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [editingTest, setEditingTest] = useState(null)
  const [search, setSearch]       = useState('')
  const [activeCategory, setActiveCategory] = useState('All')

  const [form, setForm] = useState({ name: '', category: '', price: '', gst: '0' })
  const setF = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  useEffect(() => { loadTests() }, [user])

  async function loadTests() {
    setLoading(true)
    const data = await getTestCatalogue(user.uid)
    setTests(data.filter(t => !t.deleted))
    setLoading(false)
  }

  function openAdd() {
    setEditingTest(null)
    setForm({ name: '', category: '', price: '', gst: '0' })
    setShowModal(true)
  }

  function openEdit(t) {
    setEditingTest(t)
    setForm({ name: t.name, category: t.category, price: String(t.price), gst: String(t.gst || 0) })
    setShowModal(true)
  }

  async function handleSave() {
    if (!form.name || !form.price) return
    await saveTest(user.uid, { ...form, price: Number(form.price), gst: Number(form.gst), ...(editingTest ? { id: editingTest.id } : {}) })
    await loadTests()
    setShowModal(false)
    setToast({ message: editingTest ? 'Test updated' : 'Test added', type: 'success' })
  }

  async function handleDelete(t) {
    if (!confirm(`Delete "${t.name}"?`)) return
    await deleteTest(user.uid, t.id)
    await loadTests()
    setToast({ message: 'Test deleted', type: 'success' })
  }

  const categories = ['All', ...new Set(tests.map(t => t.category))].filter(Boolean)

  const filtered = tests.filter(t => {
    const matchCat = activeCategory === 'All' || t.category === activeCategory
    const matchSearch = !search || t.name.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchSearch
  })

  const gstOpts = [{ value:'0',label:'0% GST'},{ value:'5',label:'5%'},{ value:'12',label:'12%'},{ value:'18',label:'18%'}]

  return (
    <Layout title="Test Catalogue" action={<Btn onClick={openAdd}>+ Add Test</Btn>}>
      <Card>
        <CardHeader
          title={`${tests.length} tests in catalogue`}
          sub="Pre-loaded with common Indian diagnostic tests. Add or edit as needed."
          action={
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="🔍 Search tests…"
              style={{ border: '1.5px solid var(--border)', borderRadius: 8, padding: '7px 14px', fontSize: 13, outline: 'none', fontFamily: 'DM Sans, sans-serif', color: 'var(--navy)', width: 220 }} />
          }
        />

        {/* Category filters */}
        <div style={{ display: 'flex', gap: 6, padding: '12px 22px', flexWrap: 'wrap', borderBottom: '1px solid var(--border)' }}>
          {categories.map(c => (
            <button key={c} onClick={() => setActiveCategory(c)} style={{
              padding: '5px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
              fontSize: 12, fontFamily: 'DM Sans, sans-serif', transition: 'all 0.18s',
              background: activeCategory === c ? 'var(--navy)' : 'var(--bg)',
              color: activeCategory === c ? '#fff' : 'var(--slate)',
              fontWeight: activeCategory === c ? 500 : 400
            }}>{c}</button>
          ))}
        </div>

        {loading ? <Empty icon="⏳" message="Loading catalogue…" /> :
         filtered.length === 0 ? <Empty icon="🧪" message="No tests found" /> : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg)' }}>
                {['Test Name', 'Category', 'Price', 'GST', 'Total (w/ GST)', ''].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 20px', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--muted)', fontWeight: 500, borderBottom: '1px solid var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => {
                const gstAmt = Math.round(t.price * (t.gst || 0) / 100)
                return (
                  <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '12px 20px', fontSize: 14, fontWeight: 500, color: 'var(--navy)' }}>{t.name}</td>
                    <td style={{ padding: '12px 20px', fontSize: 13, color: 'var(--muted)' }}>{t.category}</td>
                    <td style={{ padding: '12px 20px', fontSize: 13, color: 'var(--slate)' }}>₹{t.price}</td>
                    <td style={{ padding: '12px 20px', fontSize: 13, color: 'var(--muted)' }}>{t.gst || 0}%</td>
                    <td style={{ padding: '12px 20px', fontSize: 14, fontWeight: 600, color: 'var(--navy)' }}>₹{t.price + gstAmt}</td>
                    <td style={{ padding: '12px 20px', display: 'flex', gap: 8 }}>
                      <Btn small variant="ghost" onClick={() => openEdit(t)}>Edit</Btn>
                      <Btn small variant="danger" onClick={() => handleDelete(t)}>Delete</Btn>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Card>

      <Modal open={showModal} onClose={() => setShowModal(false)}
        title={editingTest ? 'Edit Test' : 'Add New Test'}
        sub="This test will be available when creating visits">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Input label="Test Name *" value={form.name} onChange={setF('name')} placeholder="e.g. Complete Blood Count" />
          <Input label="Category" value={form.category} onChange={setF('category')} placeholder="e.g. Haematology" />
          <div style={{ display: 'flex', gap: 12 }}>
            <Input label="Price (₹) *" type="number" value={form.price} onChange={setF('price')} placeholder="0" />
            <Select label="GST Rate" value={form.gst} onChange={setF('gst')} options={gstOpts} />
          </div>
          {form.price && (
            <div style={{ background: 'var(--teal-light)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--teal)' }}>
              Patient pays: ₹{Number(form.price) + Math.round(Number(form.price) * Number(form.gst) / 100)} (incl. GST)
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
            <Btn variant="ghost" onClick={() => setShowModal(false)}>Cancel</Btn>
            <Btn onClick={handleSave}>{editingTest ? 'Update Test' : 'Add Test'}</Btn>
          </div>
        </div>
      </Modal>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </Layout>
  )
}
