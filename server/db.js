// db.js
// SQLite is used here purely so the demo runs with zero external setup.
// The schema is intentionally identical to the Postgres/Supabase schema
// described in the workflow doc - swapping the driver is the only change
// needed to move this onto Supabase for a real pilot.

import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, "..", "data", "mamaalert.db");

export const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS facilities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  call_time TEXT NOT NULL          -- HH:MM, local facility call-round time
);

CREATE TABLE IF NOT EXISTS mothers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  gestational_age INTEGER NOT NULL,
  language TEXT NOT NULL,          -- english | yoruba | igbo | hausa
  facility_id TEXT NOT NULL,
  registered_at TEXT NOT NULL,
  FOREIGN KEY (facility_id) REFERENCES facilities(id)
);

CREATE TABLE IF NOT EXISTS calls (
  id TEXT PRIMARY KEY,
  mother_id TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  status TEXT NOT NULL,            -- queued | dialing | in_progress | completed | no_answer | failed
  answers_json TEXT,
  flag TEXT,                       -- red | yellow | green | null (pending)
  transcript TEXT,
  duration_sec INTEGER,
  channel TEXT,                    -- sip_trunk provider used
  FOREIGN KEY (mother_id) REFERENCES mothers(id)
);

CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  call_id TEXT NOT NULL,
  mother_id TEXT NOT NULL,
  level TEXT NOT NULL,             -- red | yellow
  message TEXT NOT NULL,
  sent_at TEXT NOT NULL,
  recipient TEXT NOT NULL,
  channel TEXT NOT NULL,           -- sms | dashboard_digest
  acknowledged INTEGER DEFAULT 0
);
`);

export default db;
