import fs from 'node:fs';
import WebSocket from 'ws';

const PROJECT = process.env.PROJECT_ID;
const CONTACT = process.env.CONTACT || 'https://scratch.mit.edu/users/weather_sunny';
const STAY = Number(process.env.STAY_MINUTES || 28) * 60 * 1000;
const FILE = process.env.BACKUP_FILE || 'backup.json';
const NAMES = ['☁ 島1', '☁ 島2', '☁ 島3', '☁ 島4', '☁ 島5', '☁ 島6', '☁ 島7', '☁ 島8', '☁ 共有番'];

if (!PROJECT) {
  console.error('PROJECT_ID がありません');
  process.exit(1);
}

let saved = {};
try { saved = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { saved = {}; }
const live = {};
let done = false;
const user = 'player' + Math.floor(1000 + Math.random() * 9000000);

const ws = new WebSocket(process.env.CLOUD_URL || 'wss://clouddata.turbowarp.org', {
  headers: { 'User-Agent': `neko-island-keeper/1.0 ${CONTACT}` },
});

const send = (obj) => ws.send(JSON.stringify(obj) + '\n');
const good = (v) => typeof v === 'string' ? v.length > 30 : false;

ws.on('open', () => {
  send({ method: 'handshake', user, project_id: PROJECT });
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
  let n = 0;
  for (const name of NAMES) {
    const now = live[name];
    const back = saved[name];
    if (back && (now === undefined || now === '0') && back !== '0') {
      send({ method: 'set', name, value: back, user, project_id: PROJECT });
      live[name] = back;
      n++;
    }
  }
  console.log(`つながった: ${Object.keys(live).length}個の変数を受信 / 復元 ${n}個`);
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
