import fs from 'fs';
import path from 'path';
import { getDatabase } from '../src/lib/db.ts';

const db = getDatabase();

console.log('=== BẮT ĐẦU CẬP NHẬT CHUẨN XÁC 100% CÁC TRƯỜNG MÔ TẢ TỪ FILE NGUỒN ===\n');

const csvPath = path.join(process.cwd(), 'data', 'official_master_catalog.csv');
const rawText = fs.readFileSync(csvPath, 'utf8');

function norm(s) {
  if (!s) return '';
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/\s+/g, ' ').trim();
}

function clean(str) {
  if (!str) return '';
  return str.trim().replace(/^["']|["']$/g, '').trim();
}

function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(clean(current));
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(clean(current));
  return result;
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
  return lines.map(l => parseCsvLine(l));
}

const rows = parseFullCsv(rawText);
const existingPrograms = db.prepare('SELECT id, code, name, group_name FROM training_programs').all();

let currentProgram = null;
let currentHeaderMap = null;
let lastPositionCode = '';
let updatedCount = 0;

for (let r = 0; r < rows.length; r++) {
  const row = rows[r];
  const first = row[0] || '';

  // 1. Nhận diện tiêu đề Phụ lục
  const plMatch = first.match(/PHỤ LỤC\s+(I|II|III|IV)\.(\d+)/i);
  if (plMatch) {
    const plCode = `PL_${plMatch[1]}.${plMatch[2]}`;
    const foundProg = existingPrograms.find(p => p.code === plCode || p.name.includes(plMatch[0]));
    if (foundProg) {
      currentProgram = foundProg;
      currentHeaderMap = null;
      lastPositionCode = '';
      console.log(`-> Nhận diện [${currentProgram.code}]: ${currentProgram.name}`);
    }
    continue;
  }

  // 2. Nhận diện dòng Header
  if ((first === 'STT' || first === 'TT') && currentProgram) {
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
      expertCol: -1,
      studiedCol: -1,
      reg2027Col: -1
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
      } else if (n.includes('da hoc')) {
        currentHeaderMap.studiedCol = idx;
      } else if (n.includes('dang ky') || n.includes('2027')) {
        currentHeaderMap.reg2027Col = idx;
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

  // 3. Dòng dữ liệu chuyên đề
  const stt = parseInt(first);
  if (!isNaN(stt) && stt > 0 && currentProgram && currentHeaderMap && currentHeaderMap.topicCol !== -1) {
    let positionCode = currentHeaderMap.posCol !== -1 ? (row[currentHeaderMap.posCol] || '') : '';
    if (positionCode) {
      lastPositionCode = positionCode;
    } else {
      positionCode = lastPositionCode; // Kế thừa vị trí chức danh của nhóm trước
    }

    const topicName = row[currentHeaderMap.topicCol] || '';
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

    if (!topicName || topicName.trim().length === 0) continue;

    // Tìm trong DB
    let dbTopic = db.prepare(`
      SELECT id FROM training_program_topics 
      WHERE program_id = ? AND (
        display_order = ? OR 
        TRIM(LOWER(topic_name)) = TRIM(LOWER(?))
      )
    `).get(currentProgram.id, stt, topicName);

    if (dbTopic) {
      db.prepare(`
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
      `).run(
        topicName,
        positionCode,
        deliveryMethod,
        duration,
        learningPath,
        competency,
        certRequirement,
        certPlanning,
        certAppoint,
        certReappoint,
        stt,
        dbTopic.id
      );
      updatedCount++;
    } else {
      db.prepare(`
        INSERT INTO training_program_topics (
          program_id, topic_name, position_code, delivery_method, duration, 
          learning_path, competency, certificate_requirement, 
          cert_planning_higher, cert_appoint_higher, cert_reappoint, display_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        currentProgram.id,
        topicName,
        positionCode,
        deliveryMethod,
        duration,
        learningPath,
        competency,
        certRequirement,
        certPlanning,
        certAppoint,
        certReappoint,
        stt
      );
      updatedCount++;
    }
  }
}

console.log(`\n=== KẾT THÚC CẬP NHẬT: ĐÃ CẬP NHẬT ${updatedCount} CHUYÊN ĐỀ ===\n`);

// Kiểm tra lại mẫu các phụ lục
console.log('Mẫu PL I.1:');
console.log(db.prepare('SELECT id, position_code, topic_name, delivery_method, duration, learning_path, competency, certificate_requirement FROM training_program_topics WHERE program_id = 1 LIMIT 2').all());

console.log('Mẫu PL I.3:');
console.log(db.prepare('SELECT id, position_code, topic_name, delivery_method, duration, learning_path, competency, certificate_requirement, cert_planning_higher, cert_appoint_higher FROM training_program_topics WHERE program_id = 3 LIMIT 2').all());

console.log('Mẫu PL III.1 (Chi nhánh):');
console.log(db.prepare('SELECT id, position_code, topic_name, delivery_method, duration, learning_path, competency, certificate_requirement FROM training_program_topics WHERE program_id = 46 LIMIT 3').all());
