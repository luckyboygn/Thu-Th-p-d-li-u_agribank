const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('data/database.sqlite');
db.prepare(`
  INSERT INTO system_settings (key, value, description, updated_at)
  VALUES ('active_campaign_task', 'CANDIDATE_EXAM', 'Nhiệm vụ trọng tâm đợt này (CANDIDATE_EXAM, TRAINING_DEMAND, BOTH, AUTO)', CURRENT_TIMESTAMP)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
`).run();
console.log('Settings after update:', db.prepare('SELECT * FROM system_settings').all());
