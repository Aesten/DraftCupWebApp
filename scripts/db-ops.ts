// Database helpers used by scripts/server-deploy.sh.
//
//   bun scripts/db-ops.ts backup <db> <dest>   consistent online copy (VACUUM INTO)
//   bun scripts/db-ops.ts busy <db>            exit 1 if an auction or pick-ban is in progress
//   bun scripts/db-ops.ts migrate-check <db>   run pending migrations on a scratch copy of <db>

import { Database } from 'bun:sqlite'
import { copyFileSync, existsSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

const [cmd, dbPath, dest] = process.argv.slice(2)

function fail(msg: string): never {
  console.error(`[db-ops] ${msg}`)
  process.exit(1)
}

if (!dbPath) fail('usage: db-ops.ts <backup|busy|migrate-check> <db> [dest]')

if (!existsSync(dbPath)) {
  // Nothing to protect on a first deploy: the server creates the database on start.
  console.log(`[db-ops] ${dbPath} does not exist, skipping ${cmd}`)
  process.exit(0)
}

switch (cmd) {
  case 'backup': {
    if (!dest) fail('backup needs a destination path')
    if (existsSync(dest)) fail(`${dest} already exists`)
    const db = new Database(dbPath, { readonly: true })
    db.run('VACUUM INTO ?', [dest])
    db.close()
    const check = new Database(dest, { readonly: true })
    const ok = (check.query('PRAGMA integrity_check').get() as { integrity_check: string }).integrity_check
    check.close()
    if (ok !== 'ok') fail(`backup failed integrity check: ${ok}`)
    console.log(`[db-ops] Backed up to ${dest}`)
    break
  }

  case 'busy': {
    const db = new Database(dbPath, { readonly: true })
    const auctions = db.query(
      "SELECT id, status FROM auction_sessions WHERE status IN ('live', 'paused')"
    ).all() as { id: number; status: string }[]
    const pickBans = db.query(
      "SELECT id, status FROM pick_ban_sessions WHERE status IN ('banning', 'picking')"
    ).all() as { id: number; status: string }[]
    db.close()
    for (const s of auctions) console.log(`[db-ops] Auction session ${s.id} is ${s.status}`)
    for (const s of pickBans) console.log(`[db-ops] Pick-ban session ${s.id} is ${s.status}`)
    if (auctions.length || pickBans.length) process.exit(1)
    console.log('[db-ops] No auction or pick-ban in progress')
    break
  }

  case 'migrate-check': {
    // Run the migrations of the checked-out code against a throwaway copy, so a
    // broken migration fails here instead of on the live database.
    const scratch = path.join(tmpdir(), `bdc-migrate-check-${process.pid}.db`)
    copyFileSync(dbPath, scratch)
    try {
      const { initDb, closeDb } = await import('../src/db/database')
      const db = initDb(scratch)
      const fk = db.query('PRAGMA foreign_key_check').all().length
      const ok = (db.query('PRAGMA integrity_check').get() as { integrity_check: string }).integrity_check
      closeDb()
      if (fk || ok !== 'ok') fail(`migrated copy is unhealthy (fk violations: ${fk}, integrity: ${ok})`)
      console.log('[db-ops] Migrations apply cleanly to a copy of the live database')
    } finally {
      for (const suffix of ['', '-wal', '-shm']) rmSync(scratch + suffix, { force: true })
    }
    break
  }

  default:
    fail(`unknown command: ${cmd}`)
}
