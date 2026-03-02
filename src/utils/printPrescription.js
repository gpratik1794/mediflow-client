// Helper to generate prescription HTML as a string and print via new window
export function printPrescription({ patient, diagnosis, complaints, medicines, advice, labTests, followUpDays, profile, date }) {
  const followUpDate = followUpDays
    ? new Date(Date.now() + parseInt(followUpDays) * 86400000)
        .toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : null

  const medsHtml = medicines.map((m, i) => `
    <div style="margin-bottom:14px;padding-left:16px;border-left:3px solid #E2EAF0">
      <div style="display:flex;align-items:baseline;gap:8px">
        <span style="font-size:15px;font-weight:700;color:#0D2B3E">${i + 1}. ${m.name}</span>
        <span style="font-size:12px;color:#888">(${m.type || ''})</span>
      </div>
      <div style="font-size:13px;color:#555;margin-top:3px">
        ${m.frequency} &mdash; ${m.duration} &mdash; ${m.timing}${m.notes ? ' &middot; ' + m.notes : ''}
      </div>
    </div>`).join('')

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Prescription - ${patient.name}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'DM Sans',sans-serif; color:#111; background:#fff; }
    @media print {
      body { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    }
  </style>
</head>
<body>
<div style="padding:32px;max-width:720px;margin:0 auto">

  <!-- Header -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;padding-bottom:16px;border-bottom:3px solid #0B9E8A">
    <div>
      <div style="font-size:22px;font-weight:700;color:#0D2B3E">Dr. ${profile?.ownerName || ''}</div>
      <div style="font-size:13px;color:#666;margin-top:2px">${profile?.centreName || ''}</div>
      ${profile?.address ? `<div style="font-size:12px;color:#888">${profile.address}</div>` : ''}
      ${profile?.phone ? `<div style="font-size:12px;color:#888">&#128222; ${profile.phone}</div>` : ''}
    </div>
    <div style="text-align:right">
      <div style="font-size:11px;color:#999;text-transform:uppercase;letter-spacing:1px">Prescription</div>
      <div style="font-size:13px;font-weight:600;color:#0D2B3E;margin-top:4px">${date}</div>
    </div>
  </div>

  <!-- Patient strip -->
  <div style="background:#F4F7F9;border-radius:10px;padding:12px 16px;display:flex;gap:32px;margin-bottom:20px">
    <div><div style="font-size:10px;color:#999;text-transform:uppercase">Name</div><div style="font-size:14px;font-weight:600">${patient.name}</div></div>
    ${patient.age ? `<div><div style="font-size:10px;color:#999;text-transform:uppercase">Age</div><div style="font-size:14px;font-weight:600">${patient.age} yrs</div></div>` : ''}
    ${patient.gender ? `<div><div style="font-size:10px;color:#999;text-transform:uppercase">Gender</div><div style="font-size:14px;font-weight:600">${patient.gender}</div></div>` : ''}
    ${patient.phone ? `<div><div style="font-size:10px;color:#999;text-transform:uppercase">Phone</div><div style="font-size:14px;font-weight:600">${patient.phone}</div></div>` : ''}
  </div>

  ${complaints ? `
  <div style="margin-bottom:12px">
    <div style="font-size:11px;color:#999;text-transform:uppercase;letter-spacing:.8px;margin-bottom:4px">Chief Complaints</div>
    <div style="font-size:13px;color:#444">${complaints}</div>
  </div>` : ''}

  ${diagnosis ? `
  <div style="margin-bottom:20px;padding:10px 14px;background:#E6F7F5;border-radius:8px;border-left:3px solid #0B9E8A">
    <span style="font-size:11px;color:#0B9E8A;font-weight:600;text-transform:uppercase;letter-spacing:.8px">Diagnosis: </span>
    <span style="font-size:14px;font-weight:600;color:#0D2B3E">${diagnosis}</span>
  </div>` : ''}

  <!-- Rx -->
  <div style="margin-bottom:20px">
    <div style="font-size:28px;font-family:serif;color:#0B9E8A;margin-bottom:10px">&#8478;</div>
    ${medsHtml}
  </div>

  ${labTests ? `
  <div style="margin-bottom:16px;padding:10px 14px;background:#FEF6E7;border-radius:8px">
    <div style="font-size:11px;color:#F5A623;font-weight:600;text-transform:uppercase;margin-bottom:4px">Investigations Advised</div>
    <div style="font-size:13px;color:#444">${labTests}</div>
  </div>` : ''}

  ${advice ? `
  <div style="margin-bottom:16px">
    <div style="font-size:11px;color:#999;text-transform:uppercase;letter-spacing:.8px;margin-bottom:4px">Advice</div>
    <div style="font-size:13px;color:#444">${advice}</div>
  </div>` : ''}

  ${followUpDate ? `
  <div style="margin-bottom:20px;padding:10px 14px;background:#E6F7F5;border-radius:8px">
    <span style="font-size:12px;color:#0B9E8A;font-weight:600">&#128197; Follow-up: </span>
    <span style="font-size:13px;font-weight:600">${followUpDate}</span>
  </div>` : ''}

  <!-- Signature -->
  <div style="margin-top:48px;display:flex;justify-content:flex-end">
    <div style="text-align:center">
      <div style="width:120px;border-top:1.5px solid #0D2B3E;padding-top:6px">
        <div style="font-size:13px;font-weight:600;color:#0D2B3E">Dr. ${profile?.ownerName || ''}</div>
        <div style="font-size:11px;color:#888">Signature</div>
      </div>
    </div>
  </div>

  <div style="margin-top:32px;text-align:center;font-size:11px;color:#ccc;border-top:1px solid #eee;padding-top:12px">
    Powered by MediFlow &middot; ${profile?.centreName || ''}
  </div>
</div>
<script>window.onload = function(){ window.print(); window.onafterprint = function(){ window.close() } }<\/script>
</body>
</html>`

  const win = window.open('', '_blank', 'width=800,height=900')
  win.document.write(html)
  win.document.close()
}
