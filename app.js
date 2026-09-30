(() => {
'use strict';
const C = window.APP_CONFIG;
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const mb = n => (n / 1e6).toFixed(n < 1e5 ? 2 : 1) + ' MB';
const inr = n => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(n);
const pad = n => String(n).padStart(2, '0');
const safe = s => (String(s).replace(/[^\w.\- ]+/g, '_').trim().slice(0, 80)) || 'file';
const fmtDate = ms => new Date(ms).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

let toastT;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 3500);
}

/* ---------- storage (IndexedDB) ---------- */
let db;
const openDB = () => new Promise((res, rej) => {
  const r = indexedDB.open('billsender', 1);
  r.onupgradeneeded = () => {
    const d = r.result;
    d.createObjectStore('projects', { keyPath: 'id' });
    d.createObjectStore('bills', { keyPath: 'id' }).createIndex('projectId', 'projectId');
  };
  r.onsuccess = () => { db = r.result; res(); };
  r.onerror = () => rej(r.error);
});
const run = (store, mode, fn) => new Promise((res, rej) => {
  const t = db.transaction(store, mode);
  const req = fn(t.objectStore(store));
  t.oncomplete = () => res(req ? req.result : undefined);
  t.onerror = t.onabort = () => rej(t.error);
});
const getAll = store => run(store, 'readonly', s => s.getAll());
const getOne = (store, id) => run(store, 'readonly', s => s.get(id));
const put = (store, o) => run(store, 'readwrite', s => s.put(o));
const del = (store, id) => run(store, 'readwrite', s => s.delete(id));
const billsOf = pid => run('bills', 'readonly', s => s.index('projectId').getAll(pid))
  .then(a => a.sort((x, y) => x.created - y.created));

/* ---------- state ---------- */
let view = { id: null };
let urls = [];
const blobOf = b => b.data ? new Blob([b.data], { type: b.type }) : b.blob; // data = ArrayBuffer (safe on iOS Safari)
const revoke = () => { urls.forEach(URL.revokeObjectURL); urls = []; };

/* ---------- rendering ---------- */
async function render() {
  revoke();
  const back = $('#backBtn');
  if (view.id) await renderProject(); else await renderList();
  back.hidden = !view.id;
}

async function renderList() {
  $('#title').textContent = 'Bill Sender';
  const [projects, bills] = await Promise.all([getAll('projects'), getAll('bills')]);
  projects.sort((a, b) => b.created - a.created);
  const by = {};
  bills.forEach(b => (by[b.projectId] ||= []).push(b));
  $('#app').innerHTML = `
    <form class="newp" data-form="new-project">
      <input type="text" name="name" placeholder="New project name" maxlength="80" autocomplete="off" required>
      <button class="primary" type="submit">Add</button>
    </form>
    ${projects.length ? '<ul class="list">' + projects.map(p => {
      const bs = by[p.id] || [];
      const total = bs.reduce((s, b) => s + (b.amount || 0), 0);
      const chip = p.status === 'sent'
        ? `<span class="chip sent">Sent ${fmtDate(p.sentAt)}</span>`
        : `<span class="chip draft">${p.sentAt ? 'Changed since sent' : 'Draft'}</span>`;
      return `<li class="card" data-action="open" data-id="${p.id}">
        <b>${esc(p.name)} ${chip}</b>
        <span class="sub">${bs.length} bill${bs.length === 1 ? '' : 's'}${total ? ' · ' + inr(total) : ''}</span></li>`;
    }).join('') + '</ul>' : '<p class="empty">No projects yet.<br>Add one above to start collecting bills.</p>'}`;
}

async function renderProject() {
  const p = await getOne('projects', view.id);
  if (!p) { view = { id: null }; return render(); }
  const bills = await billsOf(p.id);
  $('#title').textContent = p.name;
  const total = bills.reduce((s, b) => s + (b.amount || 0), 0);
  const plan = planParts(bills);
  const size = bills.reduce((s, b) => s + b.size, 0);
  const chip = p.status === 'sent'
    ? `<span class="chip sent">Sent ${fmtDate(p.sentAt)}</span>`
    : `<span class="chip draft">${p.sentAt ? 'Changed since sent' : 'Draft'}</span>`;

  $('#app').innerHTML = `
    <div class="sub" style="margin-bottom:12px">${chip}
      <button class="link" data-action="rename">Rename</button></div>
    <div class="row">
      <button class="primary" data-action="cam">📷 Take photo</button>
      <button class="secondary" data-action="files">📎 Add files</button>
    </div>
    ${bills.length ? '<ul class="list">' + bills.map(b => {
      let th;
      if (b.type.startsWith('image/')) { const u = URL.createObjectURL(blobOf(b)); urls.push(u); th = `<img src="${u}" alt="">`; }
      else th = 'PDF';
      return `<li class="card bill" data-action="edit-bill" data-id="${b.id}">
        <div class="thumb">${th}</div>
        <div class="meta"><b>${esc(b.name)}</b>
          <span class="sub">${esc(b.date || '')}${b.amount != null ? ' · ' + inr(b.amount) : ''} · ${mb(b.size)}</span>
          ${b.note ? `<em>${esc(b.note)}</em>` : ''}</div></li>`;
    }).join('') + '</ul>' : '<p class="empty">No bills yet.<br>Take a photo or add files.</p>'}
    <div style="margin-top:24px"><button class="link" data-action="del-project">Delete project</button></div>
    <div class="bar"><div class="bar-in">
      <div class="sub">${bills.length ? `${bills.length} bill${bills.length === 1 ? '' : 's'}${total ? ' · ' + inr(total) : ''} · ${mb(size)} → ${plan.error ? 'cannot send' : plan.parts.length + ' email' + (plan.parts.length === 1 ? '' : 's')}` : 'Add bills to enable sending'}</div>
      <button class="primary" style="width:100%" data-action="send" ${bills.length && !plan.error ? '' : 'disabled'}>${p.status === 'sent' ? 'Send again' : 'Send'} to ${esc(C.TO)}</button>
    </div></div>`;
}

/* ---------- planning: split bills into <= MAX_ZIP_BYTES groups ---------- */
function planParts(bills) {
  const cap = C.MAX_ZIP_BYTES - 30000; // headroom for zip headers + summary.csv
  const parts = []; let cur = [], size = 0, no = 0;
  for (const b of bills) {
    if (b.size > cap) return { error: `“${b.name}” is ${mb(b.size)}, too big for one email.`, parts: [] };
    if (size + b.size > cap && cur.length) { parts.push(cur); cur = []; size = 0; }
    cur.push({ ...b, no: ++no }); size += b.size;
  }
  if (cur.length) parts.push(cur);
  return { parts };
}

/* ---------- adding bills ---------- */
async function compressImage(file) {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const sc = Math.min(1, 2200 / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * sc), h = Math.round(bmp.height * sc);
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.82));
    if (blob && blob.size < file.size) return { blob, name: file.name.replace(/\.\w+$/, '') + '.jpg', type: 'image/jpeg' };
  } catch (e) { /* fall through, keep original */ }
  return { blob: file, name: file.name, type: file.type };
}

async function addFiles(fileList) {
  const p = await getOne('projects', view.id);
  const cap = C.MAX_ZIP_BYTES - 30000;
  let added = [], skipped = [];
  for (const f of fileList) {
    const isImg = f.type.startsWith('image/'), isPdf = f.type === 'application/pdf';
    if (!isImg && !isPdf) { skipped.push(`${f.name} (unsupported type)`); continue; }
    try {
      const r = isImg ? await compressImage(f) : { blob: f, name: f.name, type: f.type };
      // Copy into memory now: iOS Safari can lose a stored File/Blob later ("The object can not be found here").
      const data = await r.blob.arrayBuffer();
      if (data.byteLength > cap) { skipped.push(`${f.name} (${mb(data.byteLength)} is over the ${mb(cap)} email limit)`); continue; }
      const bill = { id: uid(), projectId: p.id, name: r.name || 'bill', type: r.type || (isPdf ? 'application/pdf' : 'image/jpeg'),
        size: data.byteLength, data, date: today(), amount: null, note: '', created: Date.now() + added.length };
      await put('bills', bill); added.push(bill);
    } catch (err) { skipped.push(`${f.name} (${err.name}: ${err.message})`); }
  }
  if (added.length) { p.status = 'draft'; await put('projects', p); }
  if (skipped.length) toast('Skipped: ' + skipped.join('; '));
  else if (added.length) toast(`Added ${added.length} bill${added.length === 1 ? '' : 's'}`);
  await render();
  if (added.length === 1) openBill(added[0].id);
}

/* ---------- bill edit dialog ---------- */
async function openBill(id) {
  const b = await getOne('bills', id); if (!b) return;
  const d = $('#billDlg');
  d.innerHTML = `<form method="dialog" id="billForm">
    <h2>${esc(b.name)}</h2><div class="sub">${mb(b.size)}</div>
    <label>Date</label><input type="date" name="date" value="${esc(b.date)}">
    <label>Amount (₹)</label><input type="number" name="amount" inputmode="decimal" step="0.01" min="0" value="${b.amount ?? ''}">
    <label>Note</label><textarea name="note" rows="2" maxlength="200">${esc(b.note)}</textarea>
    <div class="row" style="margin-top:16px">
      <button class="primary" value="save">Save</button>
      <button class="secondary" value="cancel" formnovalidate>Cancel</button>
    </div>
    <button class="link" type="button" id="delBill">Delete this bill</button></form>`;
  d.showModal();
  $('#delBill').onclick = async () => {
    if (!confirm('Delete this bill?')) return;
    await del('bills', id);
    const p = await getOne('projects', b.projectId); p.status = 'draft'; await put('projects', p);
    d.close(); render();
  };
  $('#billForm').onsubmit = async e => {
    if (e.submitter && e.submitter.value !== 'save') return;
    const f = new FormData(e.target);
    b.date = f.get('date') || today();
    const a = String(f.get('amount')).trim();
    b.amount = a === '' ? null : Math.round(parseFloat(a) * 100) / 100;
    if (Number.isNaN(b.amount)) b.amount = null;
    b.note = String(f.get('note') || '').trim();
    await put('bills', b);
    const p = await getOne('projects', b.projectId); p.status = 'draft'; await put('projects', p);
    render();
  };
}

/* ---------- Google sign-in (token only, for gmail.send) ---------- */
let tokenClient, accessToken = null, tokenExp = 0;
function getToken() {
  return new Promise((res, rej) => {
    if (accessToken && Date.now() < tokenExp - 60000) return res(accessToken);
    if (!window.google || !google.accounts || !google.accounts.oauth2) return rej(new Error('Google sign-in did not load. Check your internet connection and reopen the app.'));
    if (!tokenClient) {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: C.CLIENT_ID, scope: 'https://www.googleapis.com/auth/gmail.send', login_hint: C.FROM, hint: C.FROM,
        callback: () => {}, error_callback: () => {}
      });
    }
    tokenClient.callback = r => {
      if (r.error) return rej(new Error(r.error_description || r.error));
      accessToken = r.access_token; tokenExp = Date.now() + (r.expires_in || 3600) * 1000; res(accessToken);
    };
    tokenClient.error_callback = e => rej(new Error('Sign-in was cancelled or blocked (' + (e.type || 'unknown') + ').'));
    tokenClient.requestAccessToken({ prompt: '' });
  });
}

/* ---------- building & sending the emails ---------- */
const csvCell = v => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
function buildCsv(part) {
  const rows = [['No', 'File', 'Date', 'Amount (INR)', 'Note']];
  part.forEach(b => rows.push([b.no, `${pad(b.no)}_${safe(b.name)}`, b.date, b.amount ?? '', b.note]));
  const total = part.reduce((s, b) => s + (b.amount || 0), 0);
  rows.push(['', 'TOTAL', '', total.toFixed(2), '']);
  return '﻿' + rows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
const utf8b64 = s => btoa(unescape(encodeURIComponent(s))).replace(/.{1,76}/g, '$&\r\n');
function blobB64(blob) {
  return new Promise((res, rej) => {
    const f = new FileReader();
    f.onload = () => res(f.result.slice(f.result.indexOf(',') + 1).replace(/.{1,76}/g, '$&\r\n'));
    f.onerror = () => rej(f.error);
    f.readAsDataURL(blob);
  });
}
async function buildMime({ subject, text, zipName, zipBlob }) {
  const bd = 'b_' + uid();
  const head = [
    `From: ${C.FROM}`, `To: ${C.TO}`,
    `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`,
    'MIME-Version: 1.0', `Content-Type: multipart/mixed; boundary="${bd}"`, '',
    `--${bd}`, 'Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: base64', '', ''
  ].join('\r\n');
  const attHead = [`\r\n--${bd}`, `Content-Type: application/zip; name="${zipName}"`,
    `Content-Disposition: attachment; filename="${zipName}"`, 'Content-Transfer-Encoding: base64', '', ''].join('\r\n');
  return new Blob([head, utf8b64(text), attHead, await blobB64(zipBlob), `\r\n--${bd}--\r\n`], { type: 'message/rfc822' });
}

const stage = (label, p) => Promise.resolve(p).catch(e => { throw new Error(`${label} failed: ${e && e.name ? e.name + ': ' : ''}${e && e.message}`); });
async function sendPart(project, part, i, n) {
  const zip = new JSZip();
  part.forEach(b => zip.file(`${pad(b.no)}_${safe(b.name)}`, b.data || b.blob));
  zip.file('summary.csv', buildCsv(part));
  const zipBlob = await stage('Zipping', zip.generateAsync({ type: 'blob', compression: 'STORE' }));
  const total = part.reduce((s, b) => s + (b.amount || 0), 0);
  const subject = `${project.name} mail ${i} of ${n}`;
  const text = [`Project: ${project.name}`, `Email ${i} of ${n}`,
    `Bills in this email: ${part.length}${part.length > 1 ? ` (No. ${part[0].no}-${part[part.length - 1].no})` : ` (No. ${part[0].no})`}`,
    total ? `Total amount in this email: ${inr(total)}` : '', '',
    ...part.map(b => `${b.no}. ${b.name} | ${b.date}${b.amount != null ? ' | ' + inr(b.amount) : ''}${b.note ? ' | ' + b.note : ''}`),
    '', 'A summary.csv is included in the attached zip.'].filter((l, k, a) => l !== '' || a[k - 1] !== '').join('\n');
  const zipName = `${safe(project.name).replace(/ /g, '_')}_mail${i}of${n}.zip`;
  const mime = await stage('Building email', buildMime({ subject, text, zipName, zipBlob }));
  const token = await stage('Google sign-in', getToken());
  const r = await stage('Sending', fetch('https://www.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=media', {
    method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'message/rfc822' }, body: mime
  }));
  if (!r.ok) {
    if (r.status === 401) accessToken = null;
    let m = ''; try { m = (await r.json()).error.message; } catch (e) {}
    throw new Error(`Gmail said ${r.status}${m ? ': ' + m : ''}`);
  }
  return zipBlob.size;
}

function openSend(project, bills) {
  const { parts, error } = planParts(bills);
  const d = $('#sendDlg');
  const configured = C.CLIENT_ID && !/^PASTE/.test(C.CLIENT_ID);
  const st = { project, parts, next: 0 };
  d.innerHTML = `<h2>Send “${esc(project.name)}”</h2>
    <p class="sub">${bills.length} bill${bills.length === 1 ? '' : 's'} → <b>${parts.length} email${parts.length === 1 ? '' : 's'}</b> to ${esc(C.TO)}<br>from ${esc(C.FROM)}</p>
    <div class="bar-prog"><i id="prog"></i></div><div id="log"></div>
    <div class="row"><button class="primary" id="sendGo">Send now</button><button class="secondary" id="sendClose">Cancel</button></div>`;
  const log = (m, c) => { const l = $('#log'); const e = document.createElement('div'); if (c) e.className = c; e.textContent = m; l.appendChild(e); l.scrollTop = l.scrollHeight; };
  $('#sendClose').onclick = () => { d.close(); render(); };
  if (error || !configured) {
    log(error || 'Google sign-in is not set up yet: add your Client ID in config.js (see SETUP.md).', 'err');
    $('#sendGo').disabled = true;
  }
  const go = async tokenPromise => {
    const btn = $('#sendGo'); btn.disabled = true; btn.textContent = 'Sending…';
    let lock; try { lock = await navigator.wakeLock?.request('screen'); } catch (e) {}
    try {
      await tokenPromise;
      for (; st.next < parts.length; st.next++) {
        const i = st.next + 1;
        log(`Preparing email ${i} of ${parts.length}…`);
        const sz = await sendPart(project, parts[st.next], i, parts.length);
        log(`✓ Email ${i} of ${parts.length} sent (${mb(sz)} zip, ${parts[st.next].length} bill${parts[st.next].length === 1 ? '' : 's'})`, 'ok');
        $('#prog').style.width = (i / parts.length * 100) + '%';
      }
      project.status = 'sent'; project.sentAt = Date.now(); project.sentParts = parts.length;
      await put('projects', project);
      log('All done. Project marked as Sent.', 'ok');
      btn.hidden = true; $('#sendClose').textContent = 'Close';
    } catch (e) {
      log('✗ ' + e.message + (st.next ? ` (emails 1–${st.next} were already sent; Retry continues from email ${st.next + 1})` : ''), 'err');
      btn.disabled = false; btn.textContent = 'Retry';
    } finally { try { lock && lock.release(); } catch (e) {} }
  };
  // requestAccessToken must run inside the tap, so call getToken() right here.
  $('#sendGo').onclick = () => go(getToken());
  d.showModal();
}

/* ---------- events ---------- */
document.addEventListener('submit', async e => {
  if (e.target.dataset.form !== 'new-project') return;
  e.preventDefault();
  const name = new FormData(e.target).get('name').trim().replace(/\s+/g, ' ');
  if (!name) return;
  const p = { id: uid(), name, created: Date.now(), status: 'draft', sentAt: null };
  await put('projects', p); view = { id: p.id }; render();
});

document.addEventListener('click', async e => {
  const el = e.target.closest('[data-action]'); if (!el) return;
  const a = el.dataset.action;
  if (a === 'open') { view = { id: el.dataset.id }; render(); }
  else if (a === 'cam') $('#camIn').click();
  else if (a === 'files') $('#fileIn').click();
  else if (a === 'edit-bill') openBill(el.dataset.id);
  else if (a === 'rename') {
    const p = await getOne('projects', view.id);
    const n = prompt('Project name', p.name);
    if (n && n.trim()) { p.name = n.trim().replace(/\s+/g, ' '); await put('projects', p); render(); }
  } else if (a === 'del-project') {
    if (!confirm('Delete this project and all its bills from this phone?')) return;
    for (const b of await billsOf(view.id)) await del('bills', b.id);
    await del('projects', view.id); view = { id: null }; render();
  } else if (a === 'send') {
    const p = await getOne('projects', view.id);
    openSend(p, await billsOf(p.id));
  }
});

$('#backBtn').onclick = () => { view = { id: null }; render(); };
['#camIn', '#fileIn'].forEach(s => $(s).addEventListener('change', async e => {
  const files = [...e.target.files]; e.target.value = '';
  if (files.length) await addFiles(files);
}));
history.replaceState(null, '', location.href);
window.addEventListener('popstate', () => { if (view.id) { view = { id: null }; render(); } });

/* ---------- start ---------- */
openDB().then(() => { render(); navigator.storage?.persist?.(); })
  .catch(err => { $('#app').innerHTML = '<p class="empty">Could not open local storage: ' + esc(err && err.message) + '</p>'; });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
window.__test = { planParts, buildCsv };
})();
