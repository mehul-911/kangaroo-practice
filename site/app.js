import { firebaseConfig } from './firebase-config.js';
/* ---------- helpers ---------- */
const $ = (s, e = document) => e.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const L = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d } catch { return d } };
const S = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] } return a };
const fmt = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
const LET = ['A', 'B', 'C', 'D', 'E'];
const app = $('#app'), timerEl = $('#timer'), menuEl = $('#menu'), menuBtn = $('#menuBtn');
let user = null, backend = null, bank = null, expl = {}, ex = null, tick = null;

/* ---------- backends ---------- */
async function makeFirebase(cfg) {
  const base = 'https://www.gstatic.com/firebasejs/10.12.2/';
  const [{ initializeApp }, A, F] = await Promise.all([import(base + 'firebase-app.js'), import(base + 'firebase-auth.js'), import(base + 'firebase-firestore.js')]);
  const fapp = initializeApp(cfg), auth = A.getAuth(fapp), db = F.getFirestore(fapp);
  const email = u => `${u.trim().toLowerCase()}@kangaroo-practice.app`;
  const profile = async uid => { const s = await F.getDoc(F.doc(db, 'users', uid)); return s.exists() ? { uid, ...s.data() } : null };
  return {
    mode: 'firebase', hasUsers: async () => true,
    async restore() { await auth.authStateReady(); return auth.currentUser ? profile(auth.currentUser.uid) : null },
    async login(u, p) {
      const c = await A.signInWithEmailAndPassword(auth, email(u), p); const pr = await profile(c.user.uid);
      if (!pr) { await A.signOut(auth); throw new Error('Account profile not found. Ask the admin to finish setting up this account (README step 2).') }
      if (pr.disabled) { await A.signOut(auth); throw new Error('This account is turned off. Ask your parent/teacher.') } return pr
    },
    logout: () => A.signOut(auth),
    saveAttempt: (u, a) => F.addDoc(F.collection(db, 'users', u.uid, 'attempts'), { ...a, ts: F.serverTimestamp() }),
    async last(uid, n = 5) {
      const s = await F.getDocs(F.query(F.collection(db, 'users', uid, 'attempts'), F.orderBy('ts', 'desc'), F.limit(n)));
      return s.docs.map(d => ({ id: d.id, ...d.data(), ts: d.data().ts?.toMillis?.() || Date.now() }))
    },
    async students() { const s = await F.getDocs(F.collection(db, 'users')); return s.docs.map(d => ({ uid: d.id, ...d.data() })) },
    async create(name, username, pin, role = 'student') {
      const sec = initializeApp(cfg, 'sec' + Date.now()), sa = A.getAuth(sec);
      const c = await A.createUserWithEmailAndPassword(sa, email(username), pin);
      await F.setDoc(F.doc(db, 'users', c.user.uid), { name, username: username.trim().toLowerCase(), role, disabled: false, created: Date.now() });
      await A.signOut(sa)
    },
    setDisabled: (uid, v) => F.updateDoc(F.doc(db, 'users', uid), { disabled: v })
  }
}
function makeLocal() {
  const hash = async s => {
    if (crypto.subtle) return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('kg:' + s)))].map(b => b.toString(16).padStart(2, '0')).join('');
    let h = 5381; for (const ch of 'kg:' + s) h = ((h << 5) + h + ch.charCodeAt(0)) | 0; return 'x' + h };
  const uuid = () => crypto.randomUUID ? crypto.randomUUID() : 'id' + Date.now().toString(36) + Math.random().toString(36).slice(2);
  const users = () => L('kg_users', []);
  return {
    mode: 'local', hasUsers: async () => users().length > 0,
    async restore() { const id = L('kg_cur'); const u = users().find(x => x.uid === id); return u && !u.disabled ? u : null },
    async login(name, pin) {
      const u = users().find(x => x.username === name.trim().toLowerCase());
      if (!u || u.pin !== await hash(pin) || u.disabled) throw new Error('Wrong username or PIN.'); S('kg_cur', u.uid); return u
    },
    async logout() { localStorage.removeItem('kg_cur') },
    async saveAttempt(u, a) { const k = 'kg_att_' + u.uid; S(k, [{ ...a, ts: Date.now(), id: uuid() }, ...L(k, [])].slice(0, 50)) },
    async last(uid, n = 5) { return L('kg_att_' + uid, []).slice(0, n) },
    async students() { return users().map(({ pin, ...r }) => r) },
    async create(name, username, pin, role = 'student') {
      const us = users(); username = username.trim().toLowerCase();
      if (us.some(x => x.username === username)) throw new Error('That username already exists.');
      us.push({ uid: uuid(), name, username, pin: await hash(pin), role, disabled: false, created: Date.now() }); S('kg_users', us)
    },
    async setDisabled(uid, v) { const us = users(); us.find(x => x.uid === uid).disabled = v; S('kg_users', us) }
  }
}

/* ---------- bank ---------- */
async function loadBank() {
  const m = await (await fetch('bank/manifest.json', { cache: 'no-cache' })).json();
  bank = await Promise.all(m.papers.map(async p => ({ ...p, ...(await (await fetch('bank/' + p.path, { cache: 'no-cache' })).json()) })));
  try { expl = await (await fetch('bank/explanations.json', { cache: 'no-cache' })).json() } catch { expl = {} }
}
const tier = n => n <= 8 ? 3 : n <= 16 ? 4 : 5;

/* ---------- exam creation ---------- */
function buildExam(opts) {
  const seen = new Set(L('kg_seen_' + user.uid, []));
  const papers = bank.filter(p => opts.papers.includes(p.id));
  const pool = papers.flatMap(p => p.questions.filter(q => q.status === 'ok').map(q => ({ id: p.id + ':' + q.n, paper: p.id, title: p.title, n: q.n, points: q.points, img: q.img, answer: q.answer })));
  const per = opts.mode === 'exam' ? { 3: 8, 4: 8, 5: 8 } : (() => { const k = Math.round(opts.count / 3); return { 3: k, 4: k, 5: opts.count - 2 * k } })();
  const qs = [];
  for (const t of [3, 4, 5]) {
    const cand = pool.filter(q => q.points === t);
    const fresh = shuffle(cand.filter(q => !seen.has(q.id))), old = shuffle(cand.filter(q => seen.has(q.id)));
    qs.push(...[...fresh, ...old].slice(0, per[t]))
  }
  return { id: String(Date.now()), mode: opts.mode, minutes: opts.minutes, started: Date.now(), endAt: opts.minutes ? Date.now() + opts.minutes * 60000 : null, qs, answers: {}, flags: {}, idx: 0, revealed: {} }
}
const saveSession = () => ex && S('kg_sess_' + user.uid, ex);

/* ---------- screens ---------- */
function loginScreen(firstRun) {
  stopTimer(); menuBtn.hidden = true; menuEl.hidden = true;
  app.innerHTML = `<form class="card" id="lf" style="max-width:420px;margin:40px auto" novalidate><h2>${firstRun ? 'Create the admin account' : 'Sign in'}</h2>
  ${backend.mode === 'local' ? '<p class="muted">Demo mode: accounts and scores stay in this browser only. See README to enable real logins.</p>' : ''}
  ${firstRun ? '<label for="n">Your name</label><input id="n" name="name" autocomplete="name">' : ''}
  <label for="u">Username</label><input id="u" name="username" autocapitalize="none" autocorrect="off" spellcheck="false" autocomplete="username" required>
  <label for="p">PIN / password (min 6 characters)</label>
  <div class="row auto" style="gap:8px;flex-wrap:nowrap"><input id="p" name="password" type="password" autocomplete="${firstRun ? 'new-password' : 'current-password'}" style="flex:1" required><button type="button" id="show" aria-label="Show PIN" style="flex:0 0 auto">👁</button></div>
  <p class="err" id="e" role="alert" aria-live="polite"></p><button class="pri" id="go" type="submit" style="width:100%">${firstRun ? 'Create &amp; sign in' : 'Sign in'}</button></form>`;
  $('#show').onclick = () => { const p = $('#p'); p.type = p.type === 'password' ? 'text' : 'password'; p.focus() };
  $('#lf').addEventListener('submit', async ev => {
    ev.preventDefault();
    const u = $('#u').value.trim(), p = $('#p').value, btn = $('#go'); $('#e').textContent = '';
    if (!u || !p) { $('#e').textContent = 'Enter your username and PIN.'; return }
    btn.disabled = true;
    try {
      if (firstRun) { if (p.length < 6) throw new Error('PIN must be at least 6 characters.'); await backend.create(($('#n')?.value || '').trim() || u, u, p, 'admin') }
      user = await backend.login(u, p); await home()
    } catch (e) { $('#e').textContent = friendly(e); btn.disabled = false }
  });
  $('#u').focus()
}
function friendly(e) {
  const c = e.code || '';
  if (/invalid-credential|wrong-password|user-not-found|invalid-email/.test(c)) return 'Wrong username or PIN.';
  if (c.includes('too-many-requests')) return 'Too many tries. Wait a few minutes and try again.';
  if (c.includes('network')) return 'No internet connection. Check your network and try again.';
  if (c.includes('permission-denied')) return 'Permission denied. Check the Firestore rules (see README).';
  if (c.includes('email-already-in-use')) return 'That username already exists.';
  return e.message || 'Something went wrong. Please try again.'
}

function setMenu() {
  menuBtn.hidden = false;
  menuBtn.onclick = e => { e.stopPropagation(); menuEl.hidden = !menuEl.hidden };
  document.onclick = () => { menuEl.hidden = true };
  menuEl.innerHTML = `<div class="muted" style="padding:8px 12px">${esc(user.name)}</div>
  <button id="m-home">🏠 Home</button><button id="m-hist">📈 My last 5 scores</button>${user.role === 'admin' ? '<button id="m-admin">👥 Manage students</button>' : ''}<button id="m-out">Sign out</button>`;
  $('#m-home').onclick = () => home(); $('#m-hist').onclick = () => history(); $('#m-out').onclick = async () => { await backend.logout(); user = null; ex = null; start() };
  if (user.role === 'admin') $('#m-admin').onclick = () => admin()
}

async function home() {
  stopTimer(); setMenu(); menuEl.hidden = true;
  const sess = L('kg_sess_' + user.uid), usable = bank.reduce((a, p) => a + p.usable, 0);
  app.innerHTML = `${sess ? `<div class="card"><b>You have an unfinished ${sess.mode === 'exam' ? 'exam' : 'practice'}.</b> ${Object.keys(sess.answers).length}/${sess.qs.length} answered.
  <div class="row auto" style="margin-top:10px"><button class="pri" id="resume">Resume</button><button id="drop">Discard it</button></div></div>` : ''}
  <div class="card"><h2>Hi ${esc(user.name.split(' ')[0])}! Ready for a test?</h2>
  <div class="row"><div><label>Mode</label><select id="mode"><option value="exam">Full exam – 24 questions (answers shown at the end)</option><option value="practice">Practice – instant feedback &amp; explanation</option></select></div>
  <div><label>Time</label><select id="mins"><option value="75">75 minutes (Math Kangaroo USA)</option><option value="120">120 minutes (older international papers)</option><option value="0">No timer</option></select></div></div>
  <div class="row" id="cnt" hidden><div><label>Number of questions</label><select id="count"><option>6</option><option>12</option><option selected>24</option></select></div></div>
  <label>Question source</label><div class="row auto" style="gap:6px"><button id="all">All papers</button><button id="usa">USA only</button><button id="none">Clear</button></div>
  <div id="papers" class="row auto" style="gap:6px 14px;margin-top:8px">${bank.map(p => `<label style="margin:0;display:flex;gap:6px;align-items:center;font-size:14px;color:var(--ink)"><input type="checkbox" style="width:auto" value="${p.id}" checked>${esc(p.title.replace(' · Ecolier', '').replace('Math Kangaroo USA', 'USA'))} <span class="muted">(${p.usable})</span></label>`).join('')}</div>
  <p class="muted">Real Kangaroo scoring: 8 questions × 3 pts, 8 × 4 pts, 8 × 5 pts = <b>96 max</b>. Wrong or blank answers score 0 (no penalty). ${usable} verified questions in the bank.</p>
  <p class="err" id="e"></p><button class="pri" id="begin">Start</button></div>`;
  const checks = () => [...app.querySelectorAll('#papers input')];
  $('#all').onclick = () => { checks().forEach(c => { c.checked = true }) }; $('#none').onclick = () => { checks().forEach(c => { c.checked = false }) };
  $('#usa').onclick = () => { checks().forEach(c => { c.checked = c.value.startsWith('usa') }) };
  $('#mode').onchange = e => { $('#cnt').hidden = e.target.value === 'exam' }; $('#cnt').hidden = true;
  if (sess) { $('#resume').onclick = () => { ex = sess; runExam() }; $('#drop').onclick = () => { localStorage.removeItem('kg_sess_' + user.uid); home() } }
  $('#begin').onclick = () => {
    const papers = checks().filter(c => c.checked).map(c => c.value);
    if (!papers.length) { $('#e').textContent = 'Pick at least one paper.'; return }
    ex = buildExam({ mode: $('#mode').value, minutes: +$('#mins').value, count: +$('#count').value, papers });
    const need = ex.mode === 'exam' ? 24 : +$('#count').value;
    if (ex.qs.length < need) { $('#e').textContent = `Only ${ex.qs.length} verified questions available for that selection. Choose more papers.`; ex = null; return }
    saveSession(); runExam()
  }
}

function stopTimer() { clearInterval(tick); timerEl.hidden = true }
function runExam() {
  menuEl.hidden = true; setMenu();
  if (ex.endAt) {
    timerEl.hidden = false;
    const upd = () => { const left = Math.max(0, Math.round((ex.endAt - Date.now()) / 1000)); timerEl.textContent = '⏱ ' + fmt(left); timerEl.classList.toggle('low', left < 300); if (!left) { clearInterval(tick); finish(true) } };
    upd(); tick = setInterval(upd, 1000)
  }
  showQ()
}
function showQ() {
  const q = ex.qs[ex.idx], practice = ex.mode === 'practice', ans = ex.answers[ex.idx], rev = practice && ex.revealed[ex.idx];
  const e = expl[q.id];
  app.innerHTML = `<div class="card"><div class="row auto" style="justify-content:space-between"><span><b>Question ${ex.idx + 1}</b> / ${ex.qs.length}</span><span class="tier">${q.points} points</span>
  <button id="flag">${ex.flags[ex.idx] ? '🚩 Flagged' : '⚑ Flag for review'}</button></div>
  <img class="qimg" src="bank/${q.img}" alt="Question ${ex.idx + 1}" style="margin-top:12px" onerror="this.alt='Could not load this image – check your connection and reload.'">
  <div class="opts">${LET.map(l => `<button data-l="${l}" class="${rev ? (l === q.answer ? 'right' : l === ans ? 'wrong' : '') : ans === l ? 'sel' : ''}" ${rev ? 'disabled' : ''}>${l}</button>`).join('')}</div>
  ${rev ? `<div class="expl"><b>${ans === q.answer ? '✅ Correct!' : ans ? '❌ Not quite.' : 'No answer.'}</b> The correct answer is <b>${q.answer}</b>.<br>${e ? esc(e) : '<span class="muted">No written explanation for this one yet.</span>'}<div class="muted">Source: ${esc(q.title)} · Q${q.n}</div></div>` : ''}
  <div class="row auto" style="margin-top:14px;justify-content:space-between"><button id="prev" ${ex.idx ? '' : 'disabled'}>← Previous</button>
  ${ex.idx < ex.qs.length - 1 ? '<button class="pri" id="next">Next →</button>' : '<button class="pri" id="fin">Finish &amp; submit</button>'}</div></div>
  <div class="card"><div class="nav">${ex.qs.map((_, i) => `<button data-i="${i}" class="${ex.answers[i] ? 'done' : ''} ${i === ex.idx ? 'cur' : ''} ${ex.flags[i] ? 'flag' : ''}">${i + 1}</button>`).join('')}</div>
  <p class="muted" style="margin-bottom:0">${Object.keys(ex.answers).length} of ${ex.qs.length} answered · <button id="fin2" style="padding:3px 10px">Submit now</button></p></div>`;
  app.querySelectorAll('.opts button').forEach(b => b.onclick = () => {
    ex.answers[ex.idx] = b.dataset.l; if (practice) ex.revealed[ex.idx] = true; saveSession(); showQ()
  });
  app.querySelectorAll('.nav button').forEach(b => b.onclick = () => { ex.idx = +b.dataset.i; saveSession(); showQ() });
  $('#flag').onclick = () => { ex.flags[ex.idx] = !ex.flags[ex.idx]; saveSession(); showQ() };
  $('#prev').onclick = () => { ex.idx--; saveSession(); showQ(); scrollTo(0, 0) };
  if ($('#next')) $('#next').onclick = () => { ex.idx++; saveSession(); showQ(); scrollTo(0, 0) };
  const fin = () => { const blank = ex.qs.length - Object.keys(ex.answers).length; if (!blank || confirm(`${blank} question(s) unanswered. Submit anyway?`)) finish(false) };
  if ($('#fin')) $('#fin').onclick = fin; $('#fin2').onclick = fin;
  const nx = ex.qs[ex.idx + 1]; if (nx) new Image().src = 'bank/' + nx.img
}

async function finish(timeUp) {
  if (!ex || ex.done) return; ex.done = true; stopTimer();
  const secs = Math.min(Math.round((Date.now() - ex.started) / 1000), ex.minutes ? ex.minutes * 60 : 1e9);
  const tiers = { 3: [0, 0], 4: [0, 0], 5: [0, 0] }; let score = 0, max = 0, ok = 0, wrong = 0, blank = 0;
  ex.qs.forEach((q, i) => { max += q.points; tiers[q.points][1]++; const a = ex.answers[i]; if (!a) blank++; else if (a === q.answer) { ok++; score += q.points; tiers[q.points][0]++ } else wrong++ });
  const att = { mode: ex.mode, score, max, correct: ok, wrong, blank, secs, minutes: ex.minutes, tiers, qids: ex.qs.map(q => q.id), answers: ex.qs.map((_, i) => ex.answers[i] || '-').join(''), name: user.name };
  const seen = new Set(L('kg_seen_' + user.uid, [])); ex.qs.forEach(q => seen.add(q.id)); S('kg_seen_' + user.uid, [...seen]);
  localStorage.removeItem('kg_sess_' + user.uid);
  try { await backend.saveAttempt(user, att) } catch (e) { alert('Could not save the score online: ' + e.message) }
  results(att, ex, timeUp); ex = null
}

function results(a, session, timeUp) {
  const pct = Math.round(a.score / a.max * 100);
  app.innerHTML = `<div class="card" style="text-align:center"><h2>${timeUp ? "⏰ Time's up! " : ''}Your result</h2><div class="big">${a.score}<span class="muted" style="font-size:28px"> / ${a.max}</span></div>
  <p>${pct}% · ${a.correct} correct · ${a.wrong} wrong · ${a.blank} blank · time used ${fmt(a.secs)}</p>
  <table style="max-width:460px;margin:0 auto"><tr><th>Section</th><th>Correct</th><th>Points</th></tr>
  ${[3, 4, 5].map(t => `<tr><td>${t}-point</td><td>${a.tiers[t][0]} / ${a.tiers[t][1]}</td><td>${a.tiers[t][0] * t} / ${a.tiers[t][1] * t}</td></tr>`).join('')}</table>
  <div class="row auto" style="justify-content:center;margin-top:16px"><button class="pri" id="again">New test</button><button id="hist">My last 5 scores</button></div></div>
  <h3>Review every question</h3><div class="rev">${session.qs.map((q, i) => {
    const my = session.answers[i], good = my === q.answer, e = expl[q.id];
    return `<div class="card"><div class="row auto" style="justify-content:space-between"><b>Q${i + 1} · ${q.points} pts</b><span class="pill ${good ? 'ok' : 'bad'}">${good ? '✔ Correct' : my ? '✘ Wrong' : '— Blank'}</span></div>
    <img class="qimg" loading="lazy" src="bank/${q.img}" style="margin:10px auto">
    <div>Your answer: <b>${my || '—'}</b> · Correct answer: <b class="ok">${q.answer}</b></div>
    <div class="expl">${e ? esc(e) : '<span class="muted">No written explanation yet.</span>'}<div class="muted">Source: ${esc(q.title)} · Q${q.n}</div></div></div>`
  }).join('')}</div>`;
  $('#again').onclick = home; $('#hist').onclick = history; scrollTo(0, 0)
}

async function history(uid = user.uid, who = '') {
  menuEl.hidden = true; stopTimer(); setMenu();
  app.innerHTML = '<p class="muted">Loading…</p>';
  const rows = await backend.last(uid, 5);
  app.innerHTML = `<div class="card"><h2>${who ? esc(who) + ' – ' : ''}Last 5 scores</h2>${rows.length ? `<table><tr><th>Date</th><th>Mode</th><th>Score</th><th>✔ / ✘ / blank</th><th>Time</th></tr>
  ${rows.map(r => `<tr><td>${new Date(r.ts).toLocaleString()}</td><td>${r.mode === 'exam' ? 'Exam' : 'Practice'}</td><td><b>${r.score} / ${r.max}</b></td><td>${r.correct} / ${r.wrong} / ${r.blank}</td><td>${fmt(r.secs)}</td></tr>`).join('')}</table>` : '<p class="muted">No attempts yet.</p>'}
  <button id="back" style="margin-top:12px">← Back</button></div>`;
  $('#back').onclick = () => who ? admin() : home()
}

async function admin() {
  menuEl.hidden = true; stopTimer(); setMenu(); app.innerHTML = '<p class="muted">Loading…</p>';
  let list; try { list = await backend.students() } catch (e) { app.innerHTML = `<div class="card"><p class="err">${esc(friendly(e))}</p><button id="b">Back</button></div>`; $('#b').onclick = home; return }
  list = list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  app.innerHTML = `<div class="card"><h2>Add a student</h2><div class="row"><div><label>Name</label><input id="sn"></div><div><label>Username</label><input id="su" autocapitalize="none"></div><div><label>PIN (min 6)</label><input id="sp"></div></div>
  <p class="err" id="e"></p><button class="pri" id="add">Create student</button></div>
  <div class="card"><h2>Students</h2><table><tr><th>Name</th><th>Username</th><th></th></tr>${list.map(s => `<tr><td>${esc(s.name)} ${s.role === 'admin' ? '<span class="pill">admin</span>' : ''} ${s.disabled ? '<span class="pill bad">disabled</span>' : ''}</td><td>${esc(s.username)}</td>
  <td><button data-s="${s.uid}" data-n="${esc(s.name)}">Scores</button> ${s.uid !== user.uid ? `<button data-t="${s.uid}" data-d="${s.disabled ? 0 : 1}">${s.disabled ? 'Enable' : 'Disable'}</button>` : ''}</td></tr>`).join('')}</table></div>`;
  $('#add').onclick = async () => {
    try {
      const pin = $('#sp').value; if (pin.length < 6) throw new Error('PIN must be at least 6 characters.'); if (!/^[a-z0-9._-]{3,}$/i.test($('#su').value.trim())) throw new Error('Username: 3+ letters/numbers, no spaces.');
      $('#add').disabled = true; await backend.create($('#sn').value.trim() || $('#su').value, $('#su').value, pin); admin()
    } catch (e) { $('#e').textContent = friendly(e); $('#add').disabled = false }
  };
  app.querySelectorAll('[data-s]').forEach(b => b.onclick = () => history(b.dataset.s, b.dataset.n));
  app.querySelectorAll('[data-t]').forEach(b => b.onclick = async () => { await backend.setDisabled(b.dataset.t, b.dataset.d === '1'); admin() })
}

/* ---------- boot ---------- */
async function start() {
  try {
    if (!backend) backend = firebaseConfig ? await makeFirebase(firebaseConfig) : makeLocal();
    if (!bank) await loadBank();
    user = await backend.restore();
    if (user) return home();
    loginScreen(!(await backend.hasUsers()))
  } catch (e) { app.innerHTML = `<div class="card"><h2>Something went wrong</h2><p class="err">${esc(e.message)}</p></div>` }
}
start();
