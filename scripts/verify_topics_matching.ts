import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import * as xlsx from 'xlsx';

const f = 'C:/Users/NGOCNGUYEN/.gemini/antigravity/brain/7ac02a7b-1717-4f99-aa54-34e7ada4ae4f/.user_uploaded/media_1792221797718_da22720f.xlsx';
const wb = xlsx.readFile(f);
const ws = wb.Sheets['3. PL full'];

if (ws['!merges']) {
  for (const m of ws['!merges']) {
    const originCell = ws[xlsx.utils.encode_cell(m.s)];
    if (!originCell || originCell.v === undefined || originCell.v === null || originCell.v === '') continue;
    for (let r = m.s.r; r <= m.e.r; r++) {
      for (let c = m.s.c; c <= m.e.c; c++) {
        const addr = xlsx.utils.encode_cell({ r, c });
        if (!ws[addr] || ws[addr].v === undefined || ws[addr].v === null || ws[addr].v === '') {
          ws[addr] = { ...originCell };
        }
      }
    }
  }
}

const rows = xlsx.utils.sheet_to_json(ws, { header: 1 }) as any[][];
function cleanText(val: any): string {
  if (val === undefined || val === null) return '';
  return String(val).replace(/\r\n/g, ' ').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
}
function normalize(s: string): string {
  return cleanText(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

let curCode = '';
let colMap: any = null;
const parsedTopics: any[] = [];

for (let r = 0; r < rows.length; r++) {
  const row = rows[r];
  if (!row || !Array.isArray(row) || row.length === 0) continue;
  const first = cleanText(row[0] || row[1] || '');
  if (first.toUpperCase().startsWith('PHỤ LỤC') || first.toUpperCase().startsWith('PHU LUC')) {
    const m = first.match(/PHỤ LỤC\s+([I|V|X]+(\.[0-9]+)?)/i);
    const code = m ? m[1] : '';
    if (code.includes('.')) {
      curCode = code;
      colMap = null;
    }
    continue;
  }
  const isHeader = row.some(c => {
    const nc = normalize(String(c));
    return nc.includes('ten chuyen de') || nc.includes('chuyen de dao tao');
  });
  if (isHeader) {
    colMap = {};
    row.forEach((c, idx) => {
      const nc = normalize(String(c));
      if (nc === 'stt') colMap.stt = idx;
      else if (nc.includes('quy hoach')) colMap.plan = idx;
      else if (nc.includes('bo nhiem o vi tri') || nc.includes('bo nhiem o vt')) colMap.appoint = idx;
      else if (nc.includes('bo nhiem lai')) colMap.reappoint = idx;
      else if (nc.includes('chuyen gia') || nc.includes('giang vien')) colMap.appoint = idx;
      else if (nc.includes('vi tri') || nc.includes('chuc danh')) colMap.pos = idx;
      else if (nc.includes('ten chuyen de') || nc === 'chuyen de') colMap.topic = idx;
      else if (nc.includes('hinh thuc')) colMap.method = idx;
      else if (nc.includes('thoi luong')) colMap.duration = idx;
      else if (nc.includes('lo trinh')) colMap.path = idx;
      else if (nc.includes('nang luc')) colMap.comp = idx;
      else if (nc.includes('chung chi') || nc.includes('hoan thanh')) colMap.cert = idx;
    });
    continue;
  }
  if (colMap && colMap.topic !== undefined) {
    const rawTopic = cleanText(row[colMap.topic]);
    if (!rawTopic) continue;
    const nTopic = normalize(rawTopic);
    if (
      nTopic.startsWith('tong thoi gian') ||
      nTopic.startsWith('tong cong') ||
      nTopic.startsWith('tong so') ||
      nTopic === 'tong' ||
      nTopic.startsWith('ghi chu') ||
      rawTopic.startsWith('(*') ||
      rawTopic.startsWith('(**') ||
      rawTopic.startsWith('(***') ||
      rawTopic.startsWith('PHÒNG ') ||
      rawTopic.startsWith('BAN ') ||
      rawTopic.startsWith('TRUNG TÂM ')
    ) continue;

    // A real topic row always has an integer STT (e.g. 1, 2, 3, ...)
    if (colMap.stt !== undefined) {
      const sttNum = Number(row[colMap.stt]);
      if (isNaN(sttNum) || !Number.isInteger(sttNum) || sttNum <= 0) continue;
    }

    parsedTopics.push({
      progCode: curCode,
      pos: colMap.pos !== undefined ? cleanText(row[colMap.pos]) : '',
      topic: rawTopic,
      method: colMap.method !== undefined ? cleanText(row[colMap.method]) : '',
      duration: colMap.duration !== undefined ? cleanText(row[colMap.duration]) : '',
      path: colMap.path !== undefined ? cleanText(row[colMap.path]) : '',
      comp: colMap.comp !== undefined ? cleanText(row[colMap.comp]) : '',
      cert: colMap.cert !== undefined ? cleanText(row[colMap.cert]) : '',
      plan: colMap.plan !== undefined ? cleanText(row[colMap.plan]) : '',
      appoint: colMap.appoint !== undefined ? cleanText(row[colMap.appoint]) : '',
      reappoint: colMap.reappoint !== undefined ? cleanText(row[colMap.reappoint]) : ''
    });
  }
}

const db = new DatabaseSync(path.join(process.cwd(), 'data', 'database.sqlite'));
const dbTopics = db.prepare(`
  SELECT t.id, t.program_id, t.topic_name, p.code as prog_code
  FROM training_program_topics t
  JOIN training_programs p ON t.program_id = p.id
`).all() as any[];

console.log('Parsed count:', parsedTopics.length, 'DB count:', dbTopics.length);
let matched = 0;
let unmatched: any[] = [];

for (const pt of parsedTopics) {
  const normPt = normalize(pt.topic);
  const found = dbTopics.find(dt => {
    const codeMatch = dt.prog_code === 'PL_' + pt.progCode || dt.prog_code.endsWith(pt.progCode);
    return codeMatch && normalize(dt.topic_name) === normPt;
  });
  if (found) {
    matched++;
  } else {
    const foundByTopic = dbTopics.find(dt => normalize(dt.topic_name) === normPt);
    if (foundByTopic) {
      matched++;
    } else {
      unmatched.push(pt);
    }
  }
}
console.log('Matched count:', matched, 'Unmatched count:', unmatched.length);

let hasPath = 0, hasPos = 0, hasComp = 0, hasCert = 0, hasPlan = 0, hasAppoint = 0, hasReappoint = 0;
for (const pt of parsedTopics) {
  if (pt.path) hasPath++;
  if (pt.pos) hasPos++;
  if (pt.comp) hasComp++;
  if (pt.cert) hasCert++;
  if (pt.plan) hasPlan++;
  if (pt.appoint) hasAppoint++;
  if (pt.reappoint) hasReappoint++;
}
console.log('Field stats of parsedTopics:');
console.log({ total: parsedTopics.length, hasPos, hasPath, hasComp, hasCert, hasPlan, hasAppoint, hasReappoint });
