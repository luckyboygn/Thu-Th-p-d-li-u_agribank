import { getDatabase } from '../src/lib/db';

const db = getDatabase();
const indexes = db.prepare(`
  SELECT tbl_name, name, sql FROM sqlite_master WHERE type='index' AND (
    tbl_name IN ('training_demand_submissions', 'training_demand_programs', 'training_demand_program_topics', 'exam_uploads')
  )
`).all();
console.log('Existing indexes:', indexes);
