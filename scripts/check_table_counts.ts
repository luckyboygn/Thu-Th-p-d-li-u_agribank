import { DatabaseSync } from 'node:sqlite';
import path from 'path';

const dbPath = path.resolve(process.cwd(), 'data', 'database.sqlite');
const db = new DatabaseSync(dbPath);

const tables = [
  'units', 'users', 'exams', 'collections', 'forms', 'employees',
  'uploads', 'upload_rows', 'upload_errors', 'submissions',
  'training_demand_submissions', 'training_demand_positions', 'training_demand_topics',
  'training_demand_programs', 'training_demand_program_topics',
  'audit_logs', 'training_programs', 'training_program_topics',
  'training_program_groups', 'training_positions', 'training_topics', 'training_position_topics'
];

for (const t of tables) {
  try {
    const row = db.prepare(`SELECT COUNT(*) as count FROM ${t}`).get() as any;
    console.log(`${t}: ${row.count}`);
  } catch (e: any) {
    console.log(`${t}: Error (${e.message})`);
  }
}
