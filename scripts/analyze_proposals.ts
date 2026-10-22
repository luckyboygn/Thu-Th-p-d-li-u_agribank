import { getDatabase } from '../src/lib/db';
import { normalizeText } from '../src/lib/unit-matcher';

const db = getDatabase();

interface ProposalRow {
  id: number;
  submission_id: number;
  unit_id: number;
  unit_code: string;
  unit_name: string;
  proposal_name: string;
  target_audience: string;
  participant_count: number;
  expected_duration: string;
  delivery_method: string;
  faculty_source: string;
  notes: string;
}

const rows = db.prepare(`
  SELECT p.id, p.submission_id, s.unit_id, u.unit_code, u.unit_name,
         p.proposal_name, p.target_audience, p.participant_count,
         p.expected_duration, p.delivery_method, p.faculty_source, p.notes
  FROM training_demand_proposals p
  JOIN training_demand_submissions s ON p.submission_id = s.id
  JOIN units u ON s.unit_id = u.id
  ORDER BY p.id ASC
`).all() as ProposalRow[];

console.log(`Tổng số bản ghi đề xuất (training_demand_proposals): ${rows.length}`);

// Đếm số tên đề xuất thô khác nhau (raw proposal_name trimmed)
const rawNames = new Set(rows.map(r => r.proposal_name.trim()));
console.log(`Số tên đề xuất thô khác nhau: ${rawNames.size}`);

// Nhóm theo tên gần giống (normalizeText: không dấu, chữ thường, bỏ khoảng trắng thừa)
interface NormalizedGroup {
  normKey: string;
  sampleName: string;
  variations: Set<string>;
  unitCount: Set<number>;
  unitsList: Array<{ unitCode: string; unitName: string }>;
  totalParticipants: number;
  recordCount: number;
  ids: number[];
}

const groups = new Map<string, NormalizedGroup>();

for (const r of rows) {
  const normKey = normalizeText(r.proposal_name);
  if (!groups.has(normKey)) {
    groups.set(normKey, {
      normKey,
      sampleName: r.proposal_name.trim(),
      variations: new Set(),
      unitCount: new Set(),
      unitsList: [],
      totalParticipants: 0,
      recordCount: 0,
      ids: []
    });
  }

  const g = groups.get(normKey)!;
  g.variations.add(r.proposal_name.trim());
  if (!g.unitCount.has(r.unit_id)) {
    g.unitCount.add(r.unit_id);
    g.unitsList.push({ unitCode: r.unit_code, unitName: r.unit_name });
  }
  g.totalParticipants += (r.participant_count || 0);
  g.recordCount++;
  g.ids.push(r.id);
}

console.log(`Số nhóm tên chuẩn hóa (gần giống): ${groups.size}`);

// Sắp xếp theo số đơn vị đề xuất giảm dần, sau đó số người học giảm dần
const sortedGroups = Array.from(groups.values()).sort((a, b) => {
  if (b.unitCount.size !== a.unitCount.size) {
    return b.unitCount.size - a.unitCount.size;
  }
  return b.totalParticipants - a.totalParticipants;
});

console.log('\n--- TOP 30 NHÓM ĐỀ XUẤT (THEO SỐ ĐƠN VỊ ĐỀ XUẤT VÀ TỔNG NGƯỜI) ---');
const top30 = sortedGroups.slice(0, 30);

top30.forEach((g, idx) => {
  console.log(`\n[Nhóm ${idx + 1}] Tên chuẩn hóa: "${g.normKey}"`);
  console.log(`  - Đại diện: "${g.sampleName}"`);
  console.log(`  - Số bản ghi: ${g.recordCount} | Số đơn vị: ${g.unitCount.size} | Tổng người học: ${g.totalParticipants}`);
  console.log(`  - Các biến thể tên (${g.variations.size}): ${Array.from(g.variations).map(v => `"${v}"`).join('; ')}`);
  console.log(`  - Các đơn vị: ${g.unitsList.slice(0, 5).map(u => `[${u.unitCode}] ${u.unitName}`).join(', ')}${g.unitsList.length > 5 ? ` ... (+${g.unitsList.length - 5} đơn vị khác)` : ''}`);
});
