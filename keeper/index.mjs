import fs from 'node:fs';
import WebSocket from 'ws';

const PROJECT = process.env.PROJECT_ID;
const USER = process.env.SCRATCH_USER;
const PASS = process.env.SCRATCH_PASS;
const CONTACT = process.env.CONTACT || 'https://scratch.mit.edu/users/weather_sunny';
const STAY = Number(process.env.STAY_MINUTES || 28) * 60 * 1000;
const FILE = process.env.BACKUP_FILE || 'backup.json';
const UA = `Mozilla/5.0 neko-island-keeper/1.0 ${CONTACT}`;
const NAMES = ['☁ 島1', '☁ 島2', '☁ 島3', '☁ 島4', '☁ 島5', '☁ 島6', '☁ 島7', '☁ 島8', '☁ 共有番'];

if (!PROJECT || !USER || !(PASS || process.env.SCRATCH_SESSION)) {
  console.error('PROJECT_ID / SCRATCH_USER / SCRATCH_PASS のどれかがありません');
  process.exit(1);
}

const good = (v) => /^\d{31,256}$/.test(v ?? '');
const cookie = (res, key) => res.headers.getSetCookie().join(';').match(new RegExp(`${key}=([^;]+)`))?.[1];

async function login() {
  if (process.env.SCRATCH_SESSION) return process.env.SCRATCH_SESSION;
  const csrf = cookie(await fetch('https://scratch.mit.edu/csrf_token/', { headers: { 'User-Agent': UA } }), 'scratchcsrftoken');
  const res = await fetch('https://scratch.mit.edu/accounts/login/', {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      'Content-Type': 'application/json',
      'X-CSRFToken': csrf,
      'X-Requested-With': 'XMLHttpRequest',
      Referer: 'https://scratch.mit.edu',
      Cookie: `scratchcsrftoken=${csrf};scratchlanguage=en;`,
    },
    body: JSON.stringify({ username: USER, password: PASS, useMessages: true }),
  });
  const sid = cookie(res, 'scratchsessionsid');
  if (!sid) throw new Error(`ログインできませんでした (${res.status}) ${(await res.text()).slice(0, 200)}`);
  return sid;
}

let sid;
try { sid = await login(); } catch (e) {
  console.error(e.message);
  process.exit(1);
}
console.log('ログインできた');

let saved = {};
try { saved = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { saved = {}; }
for (const k of NAMES.slice(0, 8)) if (!good(saved[k])) delete saved[k];
const live = {};
let done = false;

const ws = new WebSocket(process.env.CLOUD_URL || 'wss://clouddata.scratch.mit.edu', {
  headers: { 'User-Agent': UA, Origin: 'https://scratch.mit.edu', Cookie: `scratchsessionsid=${sid};` },
});

const send = (obj) => ws.send(JSON.stringify(obj) + '\n');

ws.on('open', () => {
  send({ method: 'handshake', user: USER, project_id: PROJECT });
  setTimeout(restore, 4000);
});

ws.on('message', (data) => {
  for (const line of data.toString().split('\n')) {
    if (!line.trim()) continue;
    let m;
    try { m = JSON.parse(line); } catch { continue; }
    if (m.method === 'set' && NAMES.includes(m.name)) {
      live[m.name] = String(m.value);
      if (good(live[m.name]) || m.name === '☁ 共有番') saved[m.name] = live[m.name];
    }
  }
});

function restore() {
  const todo = NAMES.filter((name) => {
    const now = live[name];
    const back = saved[name];
    return back && back !== '0' && (now === undefined || now === '0');
  });
  todo.forEach((name, i) => {
    live[name] = saved[name];
    setTimeout(() => send({ method: 'set', name, value: saved[name], user: USER, project_id: PROJECT }), i * 300);
  });
  console.log(`つながった: ${Object.keys(live).length - todo.length}個の変数を受信 / 復元 ${todo.length}個`);
  setTimeout(finish, STAY);
}

function finish() {
  done = true;
  fs.writeFileSync(FILE, JSON.stringify(saved, null, 1));
  const islands = NAMES.slice(0, 8).filter((k) => good(saved[k])).length;
  console.log(`保存した島: ${islands}個`);
  ws.close();
  setTimeout(() => process.exit(0), 1000);
}

ws.on('close', (code) => {
  if (done) return;
  console.log('切断:', code);
  fs.writeFileSync(FILE, JSON.stringify(saved, null, 1));
  process.exit(0);
});
ws.on('error', (e) => {
  console.error('接続エラー:', e.message);
  process.exit(1);
});
