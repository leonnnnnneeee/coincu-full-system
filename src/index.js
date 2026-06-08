require('dotenv').config();
const express = require('express');
const cron = require('node-cron');
const path = require('path');
const { getLeads, updateLeadStatus, saveLeads } = require('./leads-db');
const { runScan } = require('./scanner');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// ── API ROUTES ──────────────────────────────────────

// GET all leads
app.get('/api/leads', (req, res) => {
  res.json(getLeads());
});

// POST add lead
app.post('/api/leads', (req, res) => {
  const leads = getLeads();
  const lead = {
    id: `lead_${String(leads.length + 1).padStart(3, '0')}_${Date.now()}`,
    name: req.body.name || '',
    website: req.body.website || '',
    sources: req.body.sources || '',
    telegram_username: req.body.telegram_username || '',
    lark_email: req.body.lark_email || '',
    research: req.body.research || '',
    status: req.body.status || 'new',
    note: req.body.note || '',
    last_contacted: new Date().toISOString().slice(0, 10),
    last_scanned: null,
    week: Math.ceil((new Date() - new Date(new Date().getFullYear(), 0, 1)) / 604800000)
  };
  leads.push(lead);
  saveLeads(leads);
  res.json({ ok: true, lead });
});

// PATCH update lead status
app.patch('/api/leads/:id', (req, res) => {
  const changed = updateLeadStatus(req.params.id, req.body.status, req.body.note);
  res.json({ ok: true, changed });
});

// POST trigger manual scan
app.post('/api/scan', async (req, res) => {
  res.json({ ok: true, message: 'Scan đang chạy...' });
  runScan().catch(console.error);
});

// GET scan status / stats
app.get('/api/stats', (req, res) => {
  const leads = getLeads();
  const counts = {};
  leads.forEach(l => { counts[l.status] = (counts[l.status] || 0) + 1; });
  res.json({ total: leads.length, counts, lastScan: new Date().toISOString() });
});

// ── SERVE DASHBOARD ────────────────────────────────
app.get('*', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Coincu Sales Dashboard</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',sans-serif;background:#F9FAFB;color:#111}
.header{background:#111;color:#fff;padding:0 28px;height:56px;display:flex;align-items:center;justify-content:space-between}
.logo{display:flex;align-items:center;gap:8px;font-weight:700;font-size:15px}
.tabs{display:flex;gap:4px}
.tab{background:transparent;color:#999;border:none;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:500}
.tab.active{background:#fff;color:#111}
.container{padding:24px;max-width:1100px;margin:0 auto}
.stats{display:flex;gap:12px;margin-bottom:24px;flex-wrap:wrap}
.stat{background:#fff;border:1px solid #E5E7EB;border-radius:10px;padding:16px 20px;flex:1;min-width:100px}
.stat-label{font-size:12px;color:#6B7280;margin-bottom:4px}
.stat-value{font-size:24px;font-weight:700}
.card{background:#fff;border:1px solid #E5E7EB;border-radius:12px;overflow:hidden;margin-bottom:16px}
.card-header{padding:14px 18px;border-bottom:1px solid #E5E7EB;font-weight:600;font-size:14px;display:flex;justify-content:space-between;align-items:center}
.lead-row{display:flex;align-items:center;gap:12px;padding:11px 18px;border-bottom:1px solid #F3F4F6}
.lead-avatar{width:34px;height:34px;background:#F3F4F6;border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;flex-shrink:0}
.lead-info{flex:1;min-width:0}
.lead-name{font-weight:600;font-size:13px}
.lead-note{font-size:12px;color:#6B7280;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.badge{padding:2px 10px;border-radius:99px;font-size:11px;font-weight:600;white-space:nowrap}
.btn{cursor:pointer;font-family:inherit;border:none;padding:8px 16px;border-radius:8px;font-size:13px;font-weight:600}
.btn-primary{background:#111;color:#fff}
.btn-secondary{background:#fff;color:#374151;border:1px solid #D1D5DB}
.btn-scan{background:#7C3AED;color:#fff;padding:6px 14px;font-size:12px;border-radius:6px}
.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:16px}
input,select,textarea{width:100%;padding:8px 12px;border:1px solid #D1D5DB;border-radius:8px;font-size:13px;background:#F9FAFB;font-family:inherit}
.scan-log{background:#0D0D0D;color:#00FF88;padding:16px;font-family:monospace;font-size:12px;height:200px;overflow-y:auto;border-radius:8px;line-height:1.6}
.hidden{display:none}
.page{display:none}.page.active{display:block}
</style>
</head>
<body>
<div class="header">
  <div class="logo">⚡ Coincu Sales</div>
  <div class="tabs">
    <button class="tab active" onclick="showPage('dashboard')">Dashboard</button>
    <button class="tab" onclick="showPage('leads')">Leads</button>
    <button class="tab" onclick="showPage('scan')">Auto Scan</button>
    <button class="tab" onclick="showPage('add')">+ Add Lead</button>
  </div>
  <button class="btn-scan btn" onclick="triggerScan()">🔍 Scan Now</button>
</div>

<div class="container">

  <!-- DASHBOARD -->
  <div id="page-dashboard" class="page active">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
      <h2 style="font-size:20px;font-weight:700">Dashboard</h2>
      <span id="last-update" style="font-size:12px;color:#9CA3AF"></span>
    </div>
    <div class="stats" id="stats-container"></div>
    <div class="card">
      <div class="card-header">All Leads</div>
      <div id="leads-list"></div>
    </div>
  </div>

  <!-- LEADS -->
  <div id="page-leads" class="page">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
      <h2 style="font-size:20px;font-weight:700">Leads</h2>
      <select id="filter-status" onchange="renderLeads()" style="width:auto;padding:7px 12px">
        <option value="all">All Status</option>
        <option value="new">New</option>
        <option value="interested">Interested</option>
        <option value="waiting">Waiting</option>
        <option value="no_budget">No Budget</option>
        <option value="follow_up_needed">Follow Up</option>
        <option value="closed_won">Won</option>
        <option value="closed_lost">Lost</option>
      </select>
    </div>
    <div id="leads-detail"></div>
  </div>

  <!-- SCAN -->
  <div id="page-scan" class="page">
    <h2 style="font-size:20px;font-weight:700;margin-bottom:8px">Auto Scan</h2>
    <p style="color:#6B7280;font-size:13px;margin-bottom:20px">Hệ thống tự động quét Telegram DM + Lark Mail mỗi 2 giờ và cập nhật status lead</p>
    <div class="card" style="margin-bottom:16px">
      <div class="card-header">
        <span>Scan Schedule</span>
        <button class="btn btn-primary" onclick="triggerScan()" style="font-size:12px;padding:6px 14px">🔍 Chạy ngay</button>
      </div>
      <div style="padding:16px;display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div style="background:#F9FAFB;border-radius:8px;padding:14px">
          <div style="font-size:12px;color:#6B7280;margin-bottom:4px">📱 Telegram</div>
          <div style="font-weight:600">Quét DM với leads</div>
          <div style="font-size:12px;color:#6B7280;margin-top:4px">Mỗi 2 giờ tự động</div>
        </div>
        <div style="background:#F9FAFB;border-radius:8px;padding:14px">
          <div style="font-size:12px;color:#6B7280;margin-bottom:4px">📧 Lark Mail</div>
          <div style="font-weight:600">Quét inbox email</div>
          <div style="font-size:12px;color:#6B7280;margin-top:4px">Mỗi 2 giờ tự động</div>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-header">Live Log</div>
      <div style="padding:16px">
        <div class="scan-log" id="scan-log">Chờ scan... Bấm "Chạy ngay" để trigger.</div>
      </div>
    </div>
  </div>

  <!-- ADD LEAD -->
  <div id="page-add" class="page">
    <h2 style="font-size:20px;font-weight:700;margin-bottom:20px">Add New Lead</h2>
    <div class="card">
      <div class="form-grid">
        <input id="f-name" placeholder="Tên dự án *">
        <input id="f-website" placeholder="Website">
        <input id="f-sources" placeholder="Nguồn (TG group, event...)">
        <input id="f-tg" placeholder="Telegram username (không có @)">
        <input id="f-email" placeholder="Lark email của lead">
        <select id="f-status">
          <option value="new">New</option>
          <option value="interested">Interested</option>
          <option value="waiting">Waiting</option>
          <option value="no_budget">No Budget</option>
          <option value="follow_up_needed">Follow Up</option>
        </select>
        <input id="f-note" placeholder="Ghi chú outreach" style="grid-column:span 2">
      </div>
      <div style="padding:0 16px 16px">
        <textarea id="f-research" placeholder="Research — mô tả ngắn về dự án" style="height:80px;resize:vertical"></textarea>
        <button class="btn btn-primary" onclick="addLead()" style="margin-top:10px;width:100%">Add Lead</button>
      </div>
    </div>
  </div>

</div>

<script>
const STATUS = {
  new:{label:'New',color:'#6B7280',bg:'#F3F4F6'},
  interested:{label:'Interested',color:'#059669',bg:'#D1FAE5'},
  waiting:{label:'Waiting',color:'#D97706',bg:'#FEF3C7'},
  no_budget:{label:'No Budget',color:'#DC2626',bg:'#FEE2E2'},
  follow_up_needed:{label:'Follow Up',color:'#7C3AED',bg:'#EDE9FE'},
  closed_won:{label:'Won',color:'#065F46',bg:'#A7F3D0'},
  closed_lost:{label:'Lost',color:'#991B1B',bg:'#FECACA'},
};

function badge(s){
  const st=STATUS[s]||STATUS.new;
  return '<span class="badge" style="background:'+st.bg+';color:'+st.color+'">'+st.label+'</span>';
}

let allLeads = [];

async function loadLeads(){
  const res = await fetch('/api/leads');
  allLeads = await res.json();
  renderStats();
  renderLeads();
  renderLeadsList();
}

function renderStats(){
  const counts={};
  allLeads.forEach(l=>{counts[l.status]=(counts[l.status]||0)+1;});
  const items=[
    {label:'Total',value:allLeads.length,color:'#111'},
    {label:'Interested',value:counts.interested||0,color:'#059669'},
    {label:'Waiting',value:counts.waiting||0,color:'#D97706'},
    {label:'No Budget',value:counts.no_budget||0,color:'#DC2626'},
    {label:'Follow Up',value:counts.follow_up_needed||0,color:'#7C3AED'},
    {label:'Won',value:counts.closed_won||0,color:'#065F46'},
  ];
  document.getElementById('stats-container').innerHTML = items.map(i=>
    '<div class="stat"><div class="stat-label">'+i.label+'</div><div class="stat-value" style="color:'+i.color+'">'+i.value+'</div></div>'
  ).join('');
  document.getElementById('last-update').textContent = 'Updated: '+new Date().toLocaleTimeString('vi-VN');
}

function renderLeadsList(){
  document.getElementById('leads-list').innerHTML = allLeads.map(l=>
    '<div class="lead-row">'+
    '<div class="lead-avatar">'+l.name[0]+'</div>'+
    '<div class="lead-info"><div class="lead-name">'+l.name+'</div><div class="lead-note">'+l.note+'</div></div>'+
    badge(l.status)+
    '<div style="font-size:12px;color:#9CA3AF;flex-shrink:0">'+l.last_contacted+'</div>'+
    '</div>'
  ).join('');
}

function renderLeads(){
  const filter = document.getElementById('filter-status')?.value || 'all';
  const leads = filter==='all' ? allLeads : allLeads.filter(l=>l.status===filter);
  document.getElementById('leads-detail').innerHTML = leads.map(l=>
    '<div class="card" style="margin-bottom:10px">'+
    '<div style="padding:14px 18px">'+
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">'+
    '<span style="font-weight:700;font-size:14px">'+l.name+'</span>'+badge(l.status)+
    '</div>'+
    '<div style="font-size:13px;color:#6B7280;margin-bottom:6px">'+l.research+'</div>'+
    '<div style="font-size:12px;background:#F9FAFB;padding:5px 10px;border-radius:6px;display:inline-block">📝 '+l.note+'</div>'+
    '<div style="margin-top:8px;font-size:12px;color:#9CA3AF">'+
    (l.telegram_username?'📱 @'+l.telegram_username+' &nbsp;':'')+
    (l.lark_email?'📧 '+l.lark_email+'&nbsp;':'')+
    'Last scan: '+(l.last_scanned?new Date(l.last_scanned).toLocaleString('vi-VN'):'Never')+
    '</div></div></div>'
  ).join('');
}

async function triggerScan(){
  const log = document.getElementById('scan-log');
  log.textContent = '['+new Date().toLocaleTimeString('vi-VN')+'] Đang trigger scan...\n';
  await fetch('/api/scan', {method:'POST'});
  log.textContent += 'Scan đang chạy trên server. Xem Railway logs để theo dõi chi tiết.\n';
  log.textContent += 'Leads sẽ được cập nhật tự động sau khi scan xong.\n';
  setTimeout(()=>{loadLeads();log.textContent+='['+new Date().toLocaleTimeString('vi-VN')+'] Đã reload leads.\n';}, 5000);
}

async function addLead(){
  const lead = {
    name: document.getElementById('f-name').value,
    website: document.getElementById('f-website').value,
    sources: document.getElementById('f-sources').value,
    telegram_username: document.getElementById('f-tg').value,
    lark_email: document.getElementById('f-email').value,
    status: document.getElementById('f-status').value,
    note: document.getElementById('f-note').value,
    research: document.getElementById('f-research').value,
  };
  if (!lead.name) { alert('Nhập tên dự án!'); return; }
  await fetch('/api/leads', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(lead)});
  ['f-name','f-website','f-sources','f-tg','f-email','f-note','f-research'].forEach(id=>{document.getElementById(id).value='';});
  await loadLeads();
  showPage('leads');
}

function showPage(name){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  document.getElementById('page-'+name).classList.add('active');
  event.target.classList.add('active');
}

loadLeads();
setInterval(loadLeads, 30000); // auto refresh mỗi 30s
</script>
</body>
</html>`);
});

// ── CRON SCHEDULER ─────────────────────────────────
cron.schedule('0 */2 * * *', async () => {
  console.log(`[CRON] ${new Date().toLocaleString('vi-VN')} — Running scan...`);
  await runScan().catch(console.error);
}, { timezone: 'Asia/Ho_Chi_Minh' });

// ── START SERVER ───────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Coincu Sales System running on port ${PORT}`);
  console.log(`📊 Dashboard: http://localhost:${PORT}`);
  console.log(`⏰ Auto scan: mỗi 2 giờ (Telegram DM + Lark Mail)`);
  console.log(`📋 Leads: ${getLeads().length} leads in database\n`);
});
