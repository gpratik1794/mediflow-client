// src/pages/VisitDetail.jsx
import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useReactToPrint } from 'react-to-print'
import { useAuth } from '../utils/AuthContext'
import Layout from '../components/Layout'
import { Card, CardHeader, Badge, Btn, Toast } from '../components/UI'
import { getVisit, updateVisit } from '../firebase/db'
import { getPrescriptions } from '../firebase/clinicDb'
import WhatsAppLog from '../components/WhatsAppLog'
import { format } from 'date-fns'

const STATUS_FLOW = ['registered', 'sampled', 'processing', 'ready']

export default function VisitDetail() {
  const { id }  = useParams()
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [visit, setVisit]           = useState(null)
  const [loading, setLoading]       = useState(true)
  const [toast, setToast]           = useState(null)
  const [sending, setSending]       = useState(false)
  const [uploading, setUploading]   = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [prescriptions, setPrescriptions]   = useState([])
  const [waLogKey, setWaLogKey]             = useState(0)
  const fileInputRef = useRef()
  const printRef = useRef()

  useEffect(() => { loadVisit() }, [id])

  async function loadVisit() {
    setLoading(true)
    const v = await getVisit(user.uid, id)
    setVisit(v)
    setLoading(false)
    // Load prescriptions for this patient phone
    if (v?.phone) {
      try {
        const presc = await getPrescriptions(user.uid, v.phone)
        setPrescriptions(presc)
      } catch { /* clinic module may not have prescriptions yet */ }
    }
  }

  async function handleStatusUpdate(newStatus) {
    await updateVisit(user.uid, id, { status: newStatus })
    setVisit(v => ({ ...v, status: newStatus }))
    setToast({ message: `Status updated to ${newStatus}`, type: 'success' })
  }

  async function handlePaymentUpdate(paid) {
    const newStatus = paid ? 'paid' : 'pending'
    await updateVisit(user.uid, id, { paymentStatus: newStatus })
    setVisit(v => ({ ...v, paymentStatus: newStatus }))
    setToast({ message: paid ? 'Payment marked as paid' : 'Payment marked as pending', type: 'success' })
  }

  async function handleSendWhatsApp() {
    if (!profile?.whatsappCampaigns?.length) {
      setToast({ message: 'No campaigns configured. Go to Settings → WhatsApp Campaigns and add your campaigns.', type: 'error' }); return
    }
    setSending(true)
    const result = await sendCampaign(
      profile.whatsappCampaigns, 'report_ready', visit.phone,
      [visit.patientName, profile.centreName],
      null,
      { centreId: user.uid, patientName: visit.patientName, visitId: id }
    )
    setToast({ message: result.ok ? '✓ WhatsApp sent successfully' : `WhatsApp failed: ${result.error}`, type: result.ok ? 'success' : 'error' })
    setSending(false)
    if (result.ok) setWaLogKey(k => k + 1)
  }

  const handlePrint = useReactToPrint({ content: () => printRef.current })

  async function handleReportUpload(file) {
    if (!file || file.type !== 'application/pdf') {
      setToast({ message: 'Please select a PDF file', type: 'error' }); return
    }
    if (file.size > 2 * 1024 * 1024) {
      setToast({ message: 'PDF too large. Please keep under 2MB.', type: 'error' }); return
    }
    setUploading(true)
    setUploadProgress(10)
    try {
      // Convert PDF to base64 data URL — stored in Firestore (no Firebase Storage needed)
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      setUploadProgress(60)
      await updateVisit(user.uid, id, {
        reportPdfUrl: base64,
        reportPdfName: file.name,
        reportPdfSize: file.size
      })
      setUploadProgress(100)
      setVisit(v => ({ ...v, reportPdfUrl: base64, reportPdfName: file.name }))
      setToast({ message: `✓ Report "${file.name}" uploaded!`, type: 'success' })
    } catch (e) {
      setToast({ message: 'Upload failed. Try again.', type: 'error' })
    }
    setUploading(false)
    setTimeout(() => setUploadProgress(0), 1000)
  }

  async function handleSendWhatsAppWithPdf() {
    if (!profile?.whatsappCampaigns?.length) {
      setToast({ message: 'No campaigns configured. Go to Settings → WhatsApp Campaigns.', type: 'error' }); return
    }
    setSending(true)

    let mediaOverride = null
    if (visit.reportPdfUrl?.startsWith('data:')) {
      // PDF is stored as base64 — upload to tmpfiles.org first to get a public URL
      setToast({ message: 'Uploading PDF for sharing…', type: 'info' })
      const publicUrl = await uploadPdfForWhatsApp(visit.reportPdfUrl, visit.reportPdfName)
      if (publicUrl) {
        mediaOverride = { url: publicUrl, filename: visit.reportPdfName || 'Report.pdf' }
      } else {
        setToast({ message: 'Could not host PDF for WhatsApp. Sending notification without PDF.', type: 'error' })
      }
    } else if (visit.reportPdfUrl) {
      mediaOverride = { url: visit.reportPdfUrl, filename: visit.reportPdfName || 'Report.pdf' }
    }

    const result = await sendCampaign(
      profile.whatsappCampaigns, 'report_ready', visit.phone,
      [visit.patientName, profile.centreName],
      mediaOverride,
      { centreId: user.uid, patientName: visit.patientName, visitId: id }
    )
    setToast({
      message: result.ok
        ? (mediaOverride ? '✓ WhatsApp sent with report PDF!' : '✓ WhatsApp notification sent!')
        : `WhatsApp failed: ${result.error}`,
      type: result.ok ? 'success' : 'error'
    })
    setSending(false)
    if (result.ok) setWaLogKey(k => k + 1)
  }

  if (loading) return <Layout title="Visit Detail"><div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)' }}>Loading…</div></Layout>
  if (!visit)  return <Layout title="Visit not found"><div style={{ padding: 40, color: 'var(--muted)' }}>Visit not found</div></Layout>

  const currentIdx = STATUS_FLOW.indexOf(visit.status)

  return (
    <Layout
      title={`Visit — ${visit.patientName}`}
      action={
        <div style={{ display: 'flex', gap: 10 }}>
          <Btn variant="ghost" small onClick={() => navigate(-1)}>← Back</Btn>
          <Btn variant="ghost" small onClick={handlePrint}>🖨 Print Bill</Btn>
          {visit.status === 'ready' && (
            <Btn small onClick={handleSendWhatsAppWithPdf} disabled={sending}>
              {sending ? 'Sending…' : visit.reportPdfUrl ? '💬 Send PDF' : '💬 Send WhatsApp'}
            </Btn>
          )}
        </div>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>
        {/* LEFT */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Status tracker */}
          <Card>
            <CardHeader title="Status Tracker" sub="Update as sample progresses through the lab" />
            <div style={{ padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
                {STATUS_FLOW.map((s, i) => (
                  <React.Fragment key={s}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 14, fontWeight: 600, cursor: i > currentIdx ? 'pointer' : 'default',
                        background: i <= currentIdx ? 'var(--teal)' : 'var(--border)',
                        color: i <= currentIdx ? '#fff' : 'var(--muted)',
                        transition: 'all 0.2s'
                      }}
                        onClick={() => i === currentIdx + 1 && handleStatusUpdate(s)}
                      >
                        {i < currentIdx ? '✓' : i + 1}
                      </div>
                      <span style={{ fontSize: 11, color: i <= currentIdx ? 'var(--teal)' : 'var(--muted)', textTransform: 'capitalize', textAlign: 'center' }}>
                        {s}
                      </span>
                    </div>
                    {i < STATUS_FLOW.length - 1 && (
                      <div style={{ flex: 1, height: 3, background: i < currentIdx ? 'var(--teal)' : 'var(--border)', margin: '0 8px', marginBottom: 18, transition: 'background 0.3s' }} />
                    )}
                  </React.Fragment>
                ))}
              </div>
              {currentIdx < STATUS_FLOW.length - 1 && (
                <Btn onClick={() => handleStatusUpdate(STATUS_FLOW[currentIdx + 1])} style={{ width: '100%', justifyContent: 'center' }}>
                  → Mark as {STATUS_FLOW[currentIdx + 1].charAt(0).toUpperCase() + STATUS_FLOW[currentIdx + 1].slice(1)}
                </Btn>
              )}
              {visit.status === 'ready' && (
                <div style={{ background: 'var(--green-bg)', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: 'var(--green)', textAlign: 'center' }}>
                  ✅ Report is ready. Share with patient via WhatsApp.
                </div>
              )}
            </div>
          </Card>

          {/* PDF Report Upload */}
          <Card>
            <CardHeader
              title="Report PDF"
              sub="Upload the PDF report to send on WhatsApp"
              action={
                visit.reportPdfUrl && (
                  <a href={visit.reportPdfUrl} target="_blank" rel="noreferrer" style={{
                    fontSize: 12, color: 'var(--teal)', fontWeight: 500, textDecoration: 'none'
                  }}>📄 View Uploaded PDF</a>
                )
              }
            />
            <div style={{ padding: '20px 24px' }}>
              {visit.reportPdfUrl ? (
                <div>
                  <div style={{ background: 'var(--green-bg)', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                    <span style={{ fontSize: 20 }}>📄</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--green)' }}>Report uploaded</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{visit.reportPdfName}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <Btn small onClick={handleSendWhatsAppWithPdf} disabled={sending} style={{ flex: 1, justifyContent: 'center' }}>
                      {sending ? 'Sending…' : '💬 Send PDF on WhatsApp'}
                    </Btn>
                    <Btn variant="ghost" small onClick={() => fileInputRef.current?.click()}>Replace PDF</Btn>
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{
                    border: '2px dashed var(--border)', borderRadius: 12, padding: '32px',
                    textAlign: 'center', cursor: 'pointer',
                    transition: 'border-color 0.2s'
                  }}
                    onClick={() => fileInputRef.current?.click()}
                    onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--teal)'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                  >
                    <div style={{ fontSize: 32, marginBottom: 8 }}>📤</div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)', marginBottom: 4 }}>Upload Report PDF</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>Click to select · PDF files only · Max 2MB</div>
                  </div>
                  {uploading && (
                    <div style={{ marginTop: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--slate)', marginBottom: 6 }}>
                        <span>Uploading…</span><span>{uploadProgress}%</span>
                      </div>
                      <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: uploadProgress + '%', background: 'var(--teal)', borderRadius: 3, transition: 'width 0.2s' }} />
                      </div>
                    </div>
                  )}
                </div>
              )}
              <input
                ref={fileInputRef} type="file" accept="application/pdf"
                style={{ display: 'none' }}
                onChange={e => handleReportUpload(e.target.files[0])}
              />
            </div>
          </Card>

          {/* Tests */}
          <Card>
            <CardHeader title="Tests Ordered" sub={`${(visit.tests || []).length} test(s)`} />
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg)' }}>
                  {['Test Name', 'Category', 'Price', 'GST'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '10px 20px', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--muted)', fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(visit.tests || []).map((t, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 20px', fontWeight: 500, color: 'var(--navy)', fontSize: 13 }}>{t.name}</td>
                    <td style={{ padding: '12px 20px', fontSize: 13, color: 'var(--muted)' }}>{t.category || '—'}</td>
                    <td style={{ padding: '12px 20px', fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>₹{t.price}</td>
                    <td style={{ padding: '12px 20px', fontSize: 13, color: 'var(--muted)' }}>{t.gst || 0}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>

        {/* RIGHT */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Patient info */}
          <Card>
            <CardHeader title="Patient Info" />
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{
                width: 52, height: 52, borderRadius: 14, background: 'var(--teal-light)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22, fontWeight: 700, color: 'var(--teal)', margin: '4px auto 8px'
              }}>
                {visit.patientName?.charAt(0)}
              </div>
              {[['Name', visit.patientName], ['Phone', visit.phone], ['Age', visit.age + ' yrs'], ['Gender', visit.gender], ['Sample Type', visit.sampleType], ['Ref. Doctor', visit.refDoctor || '—'], ['Bill No.', visit.billNo], ['Date', visit.date]].map(([l, v]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'var(--muted)' }}>{l}</span>
                  <span style={{ fontWeight: 500, color: 'var(--navy)' }}>{v}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Bill */}
          <Card>
            <CardHeader title="Bill" />
            <div style={{ padding: '16px 20px' }}>
              {[['Subtotal', `₹${visit.subtotal || 0}`], ['GST', `₹${visit.gstAmount || 0}`], ['Discount', `-₹${visit.discount || 0}`]].map(([l, v]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--muted)', marginBottom: 6 }}>
                  <span>{l}</span><span>{v}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 700, color: 'var(--navy)', paddingTop: 10, borderTop: '2px solid var(--border)' }}>
                <span>Total</span><span>₹{visit.totalAmount || 0}</span>
              </div>
              <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
                {visit.paymentStatus !== 'paid' ? (
                  <Btn onClick={() => handlePaymentUpdate(true)} style={{ flex: 1, justifyContent: 'center' }} variant="success">
                    ✓ Mark Paid
                  </Btn>
                ) : (
                  <div style={{ flex: 1, background: 'var(--green-bg)', color: 'var(--green)', borderRadius: 10, padding: '10px', textAlign: 'center', fontSize: 13, fontWeight: 500 }}>
                    ✅ Paid
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Prescription history */}
          <Card>
            <CardHeader title="Prescriptions" sub={`${prescriptions.length} found for this patient`} />
            {prescriptions.length === 0 ? (
              <div style={{ padding: '20px 20px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                No prescriptions on record for this patient.
              </div>
            ) : (
              <div>
                {prescriptions.map(p => (
                  <div key={p.id}
                    onClick={() => navigate(`/clinic/prescription/${p.id}`)}
                    style={{
                      padding: '12px 18px', borderBottom: '1px solid var(--border)',
                      cursor: 'pointer', transition: 'background 0.15s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--teal-light)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>
                          {p.diagnosis || 'Prescription'}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                          {p.date} · {(p.medicines || []).length} medicine{(p.medicines || []).length !== 1 ? 's' : ''}
                          {p.doctorName ? ` · Dr. ${p.doctorName}` : ''}
                        </div>
                        {(p.medicines || []).slice(0, 2).map((m, i) => (
                          <div key={i} style={{ fontSize: 11, color: 'var(--slate)', marginTop: 2 }}>
                            💊 {m.name} — {m.frequency} × {m.duration}
                          </div>
                        ))}
                        {(p.medicines || []).length > 2 && (
                          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>
                            +{p.medicines.length - 2} more…
                          </div>
                        )}
                      </div>
                      <span style={{ color: 'var(--teal)', fontSize: 16, marginLeft: 8 }}>›</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* WhatsApp Activity */}
          <Card>
            <CardHeader title="WhatsApp Activity" sub="Sent messages & patient replies" />
            <WhatsAppLog key={waLogKey} centreId={user?.uid} visitId={id} />
          </Card>
        </div>

      {/* PRINT TEMPLATE — off-screen, NOT display:none (breaks print) */}
      <div ref={printRef} style={{ position: 'absolute', left: '-9999px', top: 0 }}>
        <PrintBill visit={visit} profile={profile} />
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </Layout>
  )
}

// ── PRINT BILL TEMPLATE ────────────────────────────────────
function PrintBill({ visit, profile }) {
  if (!visit) return null
  return (
    <div style={{ fontFamily: 'DM Sans, sans-serif', padding: 40, maxWidth: 700, margin: '0 auto', color: '#111' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, paddingBottom: 20, borderBottom: '2px solid #0B9E8A' }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#0B9E8A' }}>{profile?.centreName}</div>
          <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>{profile?.address}</div>
          <div style={{ fontSize: 13, color: '#666' }}>📞 {profile?.phone}</div>
          {profile?.gstNumber && <div style={{ fontSize: 12, color: '#666' }}>GST: {profile.gstNumber}</div>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#0D2B3E' }}>BILL</div>
          <div style={{ fontSize: 13, color: '#666' }}>No. {visit.billNo}</div>
          <div style={{ fontSize: 13, color: '#666' }}>{visit.date}</div>
        </div>
      </div>

      {/* Patient */}
      <div style={{ background: '#F4F7F9', borderRadius: 10, padding: '14px 18px', marginBottom: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          {[['Patient Name', visit.patientName], ['Age / Gender', `${visit.age} yrs / ${visit.gender}`], ['Phone', visit.phone], ['Ref. Doctor', visit.refDoctor || '—'], ['Sample Type', visit.sampleType], ['Date', visit.date]].map(([l, v]) => (
            <div key={l}>
              <div style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 0.8 }}>{l}</div>
              <div style={{ fontSize: 14, fontWeight: 500, color: '#0D2B3E' }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tests table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 24 }}>
        <thead>
          <tr style={{ background: '#0D2B3E', color: '#fff' }}>
            <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 12 }}>Test Name</th>
            <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: 12 }}>Price</th>
            <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: 12 }}>GST</th>
            <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: 12 }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {(visit.tests || []).map((t, i) => {
            const gstAmt = Math.round(t.price * (t.gst || 0) / 100)
            return (
              <tr key={i} style={{ borderBottom: '1px solid #E2EAF0', background: i % 2 ? '#F9FBFC' : '#fff' }}>
                <td style={{ padding: '10px 16px', fontSize: 13 }}>{t.name}</td>
                <td style={{ padding: '10px 16px', fontSize: 13, textAlign: 'right' }}>₹{t.price}</td>
                <td style={{ padding: '10px 16px', fontSize: 13, textAlign: 'right' }}>{t.gst || 0}% (₹{gstAmt})</td>
                <td style={{ padding: '10px 16px', fontSize: 13, textAlign: 'right', fontWeight: 600 }}>₹{t.price + gstAmt}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* Totals */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 24 }}>
        <div style={{ width: 260 }}>
          {[['Subtotal', `₹${visit.subtotal || 0}`], ['GST', `₹${visit.gstAmount || 0}`], ['Discount', `-₹${visit.discount || 0}`]].map(([l, v]) => (
            <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#666', padding: '4px 0' }}>
              <span>{l}</span><span>{v}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 700, color: '#0D2B3E', borderTop: '2px solid #0B9E8A', paddingTop: 8, marginTop: 8 }}>
            <span>Total</span><span>₹{visit.totalAmount || 0}</span>
          </div>
        </div>
      </div>

      <div style={{ textAlign: 'center', fontSize: 12, color: '#999', borderTop: '1px solid #E2EAF0', paddingTop: 16 }}>
        Thank you for choosing {profile?.centreName}. Reports will be shared on WhatsApp.
        <br />Powered by MediFlow
      </div>
    </div>
  )
}
