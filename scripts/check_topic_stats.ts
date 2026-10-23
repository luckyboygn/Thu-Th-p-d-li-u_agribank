import { getDatabase } from '../src/lib/db';

const db = getDatabase();
console.log('In training_topics:');
console.log(db.prepare("SELECT id, code, name, delivery_method, duration FROM training_topics WHERE name LIKE '%AI nâng cao%'").all());

console.log('In training_program_topics:');
console.log(db.prepare("SELECT id, program_id, topic_name, position_code, delivery_method, duration FROM training_program_topics WHERE topic_name LIKE '%AI nâng cao%'").all());

console.log('Active demand in training_demand_program_topics for these topics:');
const progTopicIds = db.prepare("SELECT id FROM training_program_topics WHERE topic_name LIKE '%AI nâng cao%'").all() as any[];
const ids = progTopicIds.map(x => x.id);
if (ids.length > 0) {
  const placeholders = ids.map(() => '?').join(',');
  const demands = db.prepare(`
    SELECT dt.*, ds.unit_id, u.unit_code, u.unit_name
    FROM training_demand_program_topics dt
    JOIN training_demand_programs dp ON dt.demand_program_id = dp.id
    JOIN training_demand_submissions ds ON dp.submission_id = ds.id
    JOIN units u ON ds.unit_id = u.id
    WHERE dt.program_topic_id IN (${placeholders})
  `).all(...ids);
  console.log(demands);
}
