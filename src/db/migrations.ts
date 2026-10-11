// ─── Schema migrations ────────────────────────────────────────────────────────
// The database records its schema version in `PRAGMA user_version`. On start-up
// every migration with a higher version runs, in order, each in its own
// transaction. To change the schema: append a new entry, never edit an old one.
//
// Migration 1 is the baseline: it applies the full CREATE TABLE IF NOT EXISTS
// schema, so both a fresh file and a pre-migration database land on version 1.

import type { Database } from 'bun:sqlite'
import { SCHEMA } from './schema'

export interface Migration {
  version: number
  name:    string
  up:      (db: Database) => void
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'baseline schema',
    up: (db) => { db.run(SCHEMA) },
  },
  {
    version: 2,
    name: 'session_bids gains is_override',
    up: (db) => {
      // The v1 baseline (schema.ts) now includes this column, so a fresh database
      // already has it; only an older database on v1 needs the ALTER.
      const cols = db.query('PRAGMA table_info(session_bids)').all() as { name: string }[]
      if (!cols.some((c) => c.name === 'is_override')) {
        db.run('ALTER TABLE session_bids ADD COLUMN is_override INTEGER NOT NULL DEFAULT 0')
      }
    },
  },
]

export function currentVersion(db: Database): number {
  return (db.query('PRAGMA user_version').get() as { user_version: number }).user_version
}

export function migrate(db: Database, migrations: Migration[] = MIGRATIONS): number {
  const sorted = [...migrations].sort((a, b) => a.version - b.version)
  let version = currentVersion(db)
  for (const m of sorted) {
    if (m.version <= version) continue
    db.transaction(() => {
      m.up(db)
      db.run(`PRAGMA user_version = ${Math.trunc(m.version)}`)
    })()
    version = m.version
    console.log(`[db] Migrated to v${m.version}: ${m.name}`)
  }
  return version
}
