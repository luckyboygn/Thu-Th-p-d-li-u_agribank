import { getDatabase } from '../src/lib/db';

const db = getDatabase();

console.log('=== KIỂM TRA DỮ LIỆU HIỆN CÓ ĐỐI VỚI 4 RÀNG BUỘC UNIQUE ===\n');

// 1. UNIQUE(collection_id, unit_id) trong training_demand_submissions
const dupSubmissions = db.prepare(`
  SELECT collection_id, unit_id, COUNT(*) as cnt, GROUP_CONCAT(id) as ids, GROUP_CONCAT(status) as statuses
  FROM training_demand_submissions
  GROUP BY collection_id, unit_id
  HAVING cnt > 1
`).all() as any[];

console.log(`1. training_demand_submissions - UNIQUE(collection_id, unit_id):`);
if (dupSubmissions.length === 0) {
  console.log(`   -> KHÔNG CÓ VI PHẠM (0 cặp trùng lặp).`);
} else {
  console.log(`   -> PHÁT HIỆN ${dupSubmissions.length} CẶP VI PHẠM:`);
  dupSubmissions.forEach(d => console.log(`      Collection ${d.collection_id}, Unit ${d.unit_id}: ${d.cnt} bản ghi (IDs: ${d.ids}, Statuses: ${d.statuses})`));
}

// 2. UNIQUE(submission_id, program_id) trong training_demand_programs
const dupPrograms = db.prepare(`
  SELECT submission_id, program_id, COUNT(*) as cnt, GROUP_CONCAT(id) as ids
  FROM training_demand_programs
  GROUP BY submission_id, program_id
  HAVING cnt > 1
`).all() as any[];

console.log(`\n2. training_demand_programs - UNIQUE(submission_id, program_id):`);
if (dupPrograms.length === 0) {
  console.log(`   -> KHÔNG CÓ VI PHẠM (0 cặp trùng lặp).`);
} else {
  console.log(`   -> PHÁT HIỆN ${dupPrograms.length} CẶP VI PHẠM:`);
  dupPrograms.forEach(d => console.log(`      Submission ${d.submission_id}, Program ${d.program_id}: ${d.cnt} bản ghi (IDs: ${d.ids})`));
}

// 3. UNIQUE(demand_program_id, program_topic_id) trong training_demand_program_topics
const dupTopics = db.prepare(`
  SELECT demand_program_id, program_topic_id, COUNT(*) as cnt, GROUP_CONCAT(id) as ids
  FROM training_demand_program_topics
  GROUP BY demand_program_id, program_topic_id
  HAVING cnt > 1
`).all() as any[];

console.log(`\n3. training_demand_program_topics - UNIQUE(demand_program_id, program_topic_id):`);
if (dupTopics.length === 0) {
  console.log(`   -> KHÔNG CÓ VI PHẠM (0 cặp trùng lặp).`);
} else {
  console.log(`   -> PHÁT HIỆN ${dupTopics.length} CẶP VI PHẠM:`);
  dupTopics.forEach(d => console.log(`      DemandProgram ${d.demand_program_id}, Topic ${d.program_topic_id}: ${d.cnt} bản ghi (IDs: ${d.ids})`));
}

// 4. UNIQUE(exam_id, unit_id, version) trong exam_uploads
const dupUploads = db.prepare(`
  SELECT exam_id, unit_id, version, COUNT(*) as cnt, GROUP_CONCAT(id) as ids
  FROM exam_uploads
  GROUP BY exam_id, unit_id, version
  HAVING cnt > 1
`).all() as any[];

console.log(`\n4. exam_uploads - UNIQUE(exam_id, unit_id, version):`);
if (dupUploads.length === 0) {
  console.log(`   -> KHÔNG CÓ VI PHẠM (0 bộ trùng lặp).`);
} else {
  console.log(`   -> PHÁT HIỆN ${dupUploads.length} BỘ VI PHẠM:`);
  dupUploads.forEach(d => console.log(`      Exam ${d.exam_id}, Unit ${d.unit_id}, Version ${d.version}: ${d.cnt} bản ghi (IDs: ${d.ids})`));
}
