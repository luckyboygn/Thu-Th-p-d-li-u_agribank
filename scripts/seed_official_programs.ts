import fs from 'fs';
import path from 'path';
import { getDatabase } from '../src/lib/db.ts';

interface Topic {
  topic_name: string;
  delivery_method: string;
  duration: string;
}

interface Program {
  code: string;
  title: string;
  group_title: string;
  topics: Topic[];
}

interface Group {
  code: string;
  title: string;
  programs: Program[];
}

export function seedOfficialPrograms() {
  const filePath = path.join(process.cwd(), 'data/official_catalog_text.md');
  if (!fs.existsSync(filePath)) {
    console.error('File not found:', filePath);
    return;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  const groups: Group[] = [];
  let currentGroup: Group | null = null;
  let currentProgram: Program | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Sub program: PHỤ LỤC I.1., PHỤ LỤC II.10., etc.
    const subMatch = line.match(/^PHỤ LỤC ([IVXLCDM]+\.[0-9]+[a-z]?)\.?\s*(.*)/i);
    // Major group: PHỤ LỤC I., PHỤ LỤC II., etc.
    const majorMatch = line.match(/^PHỤ LỤC ([IVXLCDM]+)\.\s*(.*)/i);

    if (subMatch) {
      const code = 'PL_' + subMatch[1].replace(/\.$/, '');
      currentProgram = {
        code,
        title: line,
        group_title: currentGroup ? currentGroup.title : 'KHÁC',
        topics: []
      };
      if (currentGroup) {
        currentGroup.programs.push(currentProgram);
      }
    } else if (majorMatch) {
      const code = 'PL_' + majorMatch[1];
      currentGroup = {
        code,
        title: line,
        programs: []
      };
      groups.push(currentGroup);
      currentProgram = null;
    } else if (line.startsWith('|') && currentProgram) {
      const parts = line.split('|').map(s => s.trim());
      if (parts.length >= 4) {
        const col1 = parts[1];
        const col2 = parts[2];
        const col3 = parts[3];
        if (col1 && col1 !== 'Tên chuyên đề' && !col1.startsWith('---')) {
          currentProgram.topics.push({
            topic_name: col1,
            delivery_method: col2 || '',
            duration: col3 || ''
          });
        }
      }
    }
  }

  const db = getDatabase();

  // Create tables if not exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS training_programs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code VARCHAR(50) UNIQUE NOT NULL,
      name VARCHAR(255) NOT NULL,
      group_name VARCHAR(100),
      display_order INTEGER DEFAULT 1,
      status VARCHAR(20) DEFAULT 'ACTIVE',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS training_program_topics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      program_id INTEGER NOT NULL REFERENCES training_programs(id) ON DELETE CASCADE,
      topic_name VARCHAR(255) NOT NULL,
      delivery_method VARCHAR(255),
      duration VARCHAR(100),
      display_order INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS training_demand_programs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      submission_id INTEGER NOT NULL REFERENCES training_demand_submissions(id) ON DELETE CASCADE,
      program_id INTEGER NOT NULL REFERENCES training_programs(id),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(submission_id, program_id)
    );

    CREATE TABLE IF NOT EXISTS training_demand_program_topics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      demand_program_id INTEGER NOT NULL REFERENCES training_demand_programs(id) ON DELETE CASCADE,
      program_topic_id INTEGER NOT NULL REFERENCES training_program_topics(id),
      participant_count INTEGER NOT NULL DEFAULT 0,
      topic_name_snapshot VARCHAR(255),
      delivery_method_snapshot VARCHAR(255),
      duration_snapshot VARCHAR(100),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(demand_program_id, program_topic_id)
    );

    CREATE INDEX IF NOT EXISTS idx_prog_code ON training_programs(code);
    CREATE INDEX IF NOT EXISTS idx_prog_topics_prog ON training_program_topics(program_id);
    CREATE INDEX IF NOT EXISTS idx_demand_prog_sub ON training_demand_programs(submission_id);
    CREATE INDEX IF NOT EXISTS idx_demand_prog_top_dp ON training_demand_program_topics(demand_program_id);
  `);

  console.log('Seeding official training programs and topics into SQLite...');

  const insertProgStmt = db.prepare(`
    INSERT INTO training_programs (code, name, group_name, display_order, status)
    VALUES (?, ?, ?, ?, 'ACTIVE')
    ON CONFLICT(code) DO UPDATE SET
      name = excluded.name,
      group_name = excluded.group_name,
      display_order = excluded.display_order
  `);

  const getProgStmt = db.prepare('SELECT id FROM training_programs WHERE code = ?');
  const deleteOldTopicsStmt = db.prepare('DELETE FROM training_program_topics WHERE program_id = ?');
  const insertTopicStmt = db.prepare(`
    INSERT INTO training_program_topics (program_id, topic_name, delivery_method, duration, display_order)
    VALUES (?, ?, ?, ?, ?)
  `);

  db.exec('BEGIN TRANSACTION;');
  try {
    let progOrder = 1;
    let totalTopicsSeeded = 0;
    let totalProgramsSeeded = 0;

    for (const group of groups) {
      for (const prog of group.programs) {
        insertProgStmt.run(prog.code, prog.title, group.title, progOrder++);
        const row = getProgStmt.get(prog.code) as any;
        const progId = row.id;
        totalProgramsSeeded++;

        // Only clear topics if not already referenced by existing demand topics, or we can just replace
        deleteOldTopicsStmt.run(progId);

        let topicOrder = 1;
        for (const t of prog.topics) {
          insertTopicStmt.run(progId, t.topic_name, t.delivery_method, t.duration, topicOrder++);
          totalTopicsSeeded++;
        }
      }
    }

    db.exec('COMMIT;');
    console.log(`SUCCESS! Seeded ${totalProgramsSeeded} programs and ${totalTopicsSeeded} topics.`);
  } catch (err) {
    db.exec('ROLLBACK;');
    console.error('Seeding failed:', err);
    throw err;
  }
}

seedOfficialPrograms();
