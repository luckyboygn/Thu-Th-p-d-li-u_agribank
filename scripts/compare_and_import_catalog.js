import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('data/database.sqlite');
const csvPath = path.join(process.cwd(), 'data', 'official_master_catalog.csv');
const rawText = fs.readFileSync(csvPath, 'utf8');

function clean(str) {
  if (!str) return '';
  return str.trim().replace(/^["']|["']$/g, '').trim();
}

function parseFullCsv(text) {
  const lines = [];
  let currentLine = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      currentLine += ch;
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && text[i + 1] === '\n') {
        i++;
      }
      if (currentLine.trim()) {
        lines.push(currentLine);
      }
      currentLine = '';
    } else {
      currentLine += ch;
    }
  }
  if (currentLine.trim()) {
    lines.push(currentLine);
  }
  
  return lines.map(line => {
    const result = [];
    let current = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQ && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQ = !inQ;
        }
      } else if (c === ',' && !inQ) {
        result.push(clean(current));
        current = '';
      } else {
        current += c;
      }
    }
    result.push(clean(current));
    return result;
  });
}

function norm(s) {
  if (!s) return '';
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]/g, ' ').trim();
}

const rows = parseFullCsv(rawText);
const programData = new Map();

let currentPl = null;
let currentHeaderMap = null;
let lastPositionCode = '';

for (let r = 0; r < rows.length; r++) {
  const row = rows[r];
  const first = row[0] || '';

  const plMatch = first.match(/PHỤ LỤC\s+(I|II|III|IV)\.(\d+)/i);
  if (plMatch) {
    currentPl = `PL_${plMatch[1]}.${plMatch[2]}`;
    if (!programData.has(currentPl)) {
      programData.set(currentPl, []);
    }
    currentHeaderMap = null;
    lastPositionCode = '';
    continue;
  }

  if ((first === 'STT' || first === 'TT') && currentPl) {
    currentHeaderMap = {
      posCol: -1,
      topicCol: -1,
      methodCol: -1,
      durationCol: -1,
      pathCol: -1,
      competencyCol: -1,
      certCol: -1,
      planningCol: -1,
      appointCol: -1,
      reappointCol: -1,
      expertCol: -1
    };

    row.forEach((cell, idx) => {
      const n = norm(cell);
      if (n.includes('quy hoach')) {
        currentHeaderMap.planningCol = idx;
      } else if (n.includes('bo nhiem lai')) {
        currentHeaderMap.reappointCol = idx;
      } else if (n.includes('bo nhiem')) {
        currentHeaderMap.appointCol = idx;
      } else if (n.includes('cong nhan') || n.includes('chuyen gia') || n.includes('giang vien')) {
        currentHeaderMap.expertCol = idx;
      } else if ((n.startsWith('vi tri') || n.includes('chuc danh')) && !n.includes('chung chi') && !n.includes('dao tao')) {
        currentHeaderMap.posCol = idx;
      } else if (n.includes('chuyen de') && !n.includes('hoan thanh')) {
        currentHeaderMap.topicCol = idx;
      } else if (n.includes('hinh thuc')) {
        currentHeaderMap.methodCol = idx;
      } else if (n.includes('thoi luong')) {
        currentHeaderMap.durationCol = idx;
      } else if (n.includes('lo trinh')) {
        currentHeaderMap.pathCol = idx;
      } else if (n.includes('nang luc')) {
        currentHeaderMap.competencyCol = idx;
      } else if (n.includes('chung chi') || n.includes('hoan thanh')) {
        currentHeaderMap.certCol = idx;
      }
    });
    continue;
  }

  const stt = parseInt(first);
  if (!isNaN(stt) && stt > 0 && currentPl && currentHeaderMap && currentHeaderMap.topicCol !== -1) {
    let positionCode = currentHeaderMap.posCol !== -1 ? (row[currentHeaderMap.posCol] || '') : '';
    if (positionCode) {
      lastPositionCode = positionCode;
    } else {
      positionCode = lastPositionCode;
    }

    const topicName = row[currentHeaderMap.topicCol] || '';
    if (!topicName || topicName.trim().length === 0) continue;

    const deliveryMethod = currentHeaderMap.methodCol !== -1 ? (row[currentHeaderMap.methodCol] || '') : '';
    const duration = currentHeaderMap.durationCol !== -1 ? (row[currentHeaderMap.durationCol] || '') : '';
    const learningPath = currentHeaderMap.pathCol !== -1 ? (row[currentHeaderMap.pathCol] || '') : '';
    const competency = currentHeaderMap.competencyCol !== -1 ? (row[currentHeaderMap.competencyCol] || '') : '';
    
    let certRequirement = currentHeaderMap.certCol !== -1 ? (row[currentHeaderMap.certCol] || '') : '';
    if (currentHeaderMap.expertCol !== -1 && row[currentHeaderMap.expertCol]) {
      const expVal = row[currentHeaderMap.expertCol];
      if (expVal && expVal !== 'x') {
        certRequirement = certRequirement ? `${certRequirement} (${expVal})` : expVal;
      }
    }

    const certPlanning = currentHeaderMap.planningCol !== -1 ? (row[currentHeaderMap.planningCol] === 'x' ? 'x' : '') : '';
    const certAppoint = currentHeaderMap.appointCol !== -1 ? (row[currentHeaderMap.appointCol] === 'x' ? 'x' : '') : '';
    const certReappoint = currentHeaderMap.reappointCol !== -1 ? (row[currentHeaderMap.reappointCol] === 'x' ? 'x' : '') : '';

    programData.get(currentPl).push({
      positionCode,
      topicName,
      deliveryMethod,
      duration,
      learningPath,
      competency,
      certRequirement,
      certPlanning,
      certAppoint,
      certReappoint
    });
  }
}

console.log('=== TIẾN HÀNH ĐỒNG BỘ CHUẨN XÁC 100% CÁC CHUYÊN ĐỀ ===');

const updateStmt = db.prepare(`
  UPDATE training_program_topics
  SET 
    topic_name = ?,
    position_code = ?,
    delivery_method = ?,
    duration = ?,
    learning_path = ?,
    competency = ?,
    certificate_requirement = ?,
    cert_planning_higher = ?,
    cert_appoint_higher = ?,
    cert_reappoint = ?,
    display_order = ?
  WHERE id = ?
`);

let totalUpdated = 0;

db.exec('BEGIN TRANSACTION;');
try {
  for (const [plCode, tList] of programData.entries()) {
    const prog = db.prepare("SELECT id, name FROM training_programs WHERE code = ?").get(plCode);
    if (!prog) {
      console.log(`[!] Không tìm thấy chương trình ${plCode}`);
      continue;
    }

    const dbTopics = db.prepare("SELECT id FROM training_program_topics WHERE program_id = ? ORDER BY id ASC").all(prog.id);

    if (dbTopics.length !== tList.length) {
      console.error(`[!] Lệch số lượng chuyên đề tại ${plCode}: DB=${dbTopics.length}, CSV=${tList.length}`);
      continue;
    }

    for (let i = 0; i < tList.length; i++) {
      const t = tList[i];
      const dbTopicId = dbTopics[i].id;
      updateStmt.run(
        t.topicName,
        t.positionCode,
        t.deliveryMethod,
        t.duration,
        t.learningPath,
        t.competency,
        t.certRequirement,
        t.certPlanning,
        t.certAppoint,
        t.certReappoint,
        i + 1,
        dbTopicId
      );
      totalUpdated++;
    }
  }
  db.exec('COMMIT;');
  console.log(`✓ Đã cập nhật thành công chuẩn xác ${totalUpdated} chuyên đề!`);
} catch (e) {
  db.exec('ROLLBACK;');
  console.error('Lỗi khi cập nhật:', e);
}
