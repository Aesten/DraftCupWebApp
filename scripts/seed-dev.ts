// ─── Development seed ─────────────────────────────────────────────────────────
// Fills the database with a realistic tournament so every page has content:
//   BDC XVI, featured, with a global map pool and rolled matchups
//   Division 1: finished auction, full rosters, played bracket (Aary wins)
//   Division 2: auction live and mid-way, 4 bids on the active player, chat
//
//   bun run seed:dev            # refuses if the database already holds a tournament
//   bun run seed:dev -- --force # wipes tournaments/maps first
//
// Uses the same DB path as the server (./data/draftcup.db under the cwd), so run
// it from the repo root. Tokens printed at the end log you in at /login.

import { initDb, execute, queryOne, queryAll } from '../src/db/database'

const force = process.argv.includes('--force')
initDb()

const existing = queryOne<{ n: number }>('SELECT COUNT(*) as n FROM tournaments')!.n
if (existing > 0 && !force) {
  console.error(`[seed] Database already has ${existing} tournament(s). Re-run with --force to replace them.`)
  process.exit(1)
}

const now = () => new Date().toISOString()
const one = (sql: string, p: unknown[] = []) => queryOne<any>(sql, p as any)!

execute('DELETE FROM tournaments')
execute('DELETE FROM maps')

// ─── Tournament ───────────────────────────────────────────────────────────────
execute(`INSERT INTO tournaments (name, slug, description, is_featured, players_per_team, host_token, auctioneer_token)
         VALUES ('BDC XVI', 'bdc-xvi', '16th edition of the Bannerlord Draft Cup', 1, 6, 'DRAFT-HOST01', 'DRAFT-AUCT01')`)
const T = one("SELECT id FROM tournaments WHERE slug = 'bdc-xvi'").id

const maps = ['Vatnborg', "Lycaron's Districts", 'Urikskalaar', 'Lakeside (Winter)', 'Ghost Town']
for (const m of maps) execute('INSERT INTO maps (name, game_id) VALUES (?, ?)', [m, m.toLowerCase().replace(/[^a-z]/g, '')])
const mapIds = queryAll<{ id: number }>('SELECT id FROM maps ORDER BY id').map(r => r.id)
execute('UPDATE tournaments SET map_pool = ?, finals_map_pool = ? WHERE id = ?', [JSON.stringify(mapIds), JSON.stringify(mapIds), T])
const fac = Object.fromEntries(queryAll<{ id: number; name: string }>('SELECT id, name FROM factions').map(r => [r.name, r.id]))

const pairs = [['Battania', 'Aserai'], ['Sturgia', 'Vlandia'], ['Khuzait', 'Empire'], ['Vlandia', 'Aserai']]
pairs.forEach(([a, b], i) => execute(
  'INSERT INTO matchups (tournament_id, round, label, map_id, faction_a_id, faction_b_id, is_public) VALUES (?, ?, ?, ?, ?, ?, 1)',
  [T, i + 1, i < 3 ? `Round ${i + 1}` : 'Round 4', mapIds[i], fac[a], fac[b]]))

const classesOf = (i: number) => ['inf', 'arc', 'cav', 'inf', 'inf,cav', 'arc', 'inf', 'cav'][i % 8]

// ─── Division 1: finished, with a played bracket ──────────────────────────────
execute("INSERT INTO auctions (tournament_id, name, status) VALUES (?, 'Division 1', 'finished')", [T])
const A1 = one("SELECT id FROM auctions WHERE name = 'Division 1'").id
const caps1: [string, string][] = [['Aary', 'cav'], ['Albie', 'cav'], ['Authari', 'cav'], ['Odin', 'cav'], ['Kamby', 'inf'], ['Neto', 'cav'], ['Rigo', 'cav'], ['Troechka', 'cav']]
const teamNames: Record<string, string> = { Odin: "Not Inspire's team" }
for (const [n, c] of caps1) {
  execute('INSERT INTO captains (auction_id, display_name, team_name, budget, class) VALUES (?, ?, ?, 20, ?)', [A1, n, teamNames[n] ?? `${n}'s team`, c])
}
const cap1 = Object.fromEntries(queryAll<{ id: number; display_name: string }>('SELECT id, display_name FROM captains WHERE auction_id = ?', [A1]).map(r => [r.display_name, r.id]))

execute("INSERT INTO auction_sessions (auction_id, status, sold_count, finished_at) VALUES (?, 'finished', 48, ?)", [A1, now()])
const S1 = one('SELECT id FROM auction_sessions WHERE auction_id = ?', [A1]).id
const pool1 = ['Torvald', 'Ysolde', 'Brann', 'Maelis', 'Oswin', 'Ranulf', 'Edda', 'Piers', 'Hakon', 'Sibyl', 'Leofric', 'Wynn', 'Gareth', 'Alys', 'Corvin', 'Ilse', 'Kestrel', 'Marrek', 'Thane', 'Rosalind', 'Cedric', 'Anselm', 'Saoirse', 'Osric', 'Wulfric', 'Varrick', 'Bryn', 'Dagny', 'Eirik', 'Freyd', 'Gudrun', 'Halvar', 'Ingrid', 'Jorund', 'Kolbein', 'Liv', 'Magnar', 'Njal', 'Orm', 'Ragna', 'Sigurd', 'Tova', 'Ulf', 'Vidar', 'Yrsa', 'Asger', 'Bodil', 'Dag']
pool1.forEach((p, i) => {
  execute('INSERT INTO players (tournament_id, name, classes, is_available) VALUES (?, ?, ?, 0)', [T, p, classesOf(i)])
  const pid = one('SELECT id FROM players WHERE name = ? AND tournament_id = ?', [p, T]).id
  execute('INSERT INTO session_purchases (session_id, captain_id, player_id, player_name, price) VALUES (?, ?, ?, ?, ?)',
    [S1, cap1[caps1[i % 8][0]], pid, p, Math.round((6 - Math.floor(i / 8)) * 10 + (i % 5)) / 10])
  execute("INSERT INTO session_queue (session_id, player_id, player_name, queue_position, status) VALUES (?, ?, ?, ?, 'sold')", [S1, pid, p, i])
})

execute("INSERT INTO brackets (tournament_id, auction_id, name, is_public, locked) VALUES (?, ?, 'Division 1', 1, 1)", [T, A1])
const B1 = one('SELECT id FROM brackets WHERE auction_id = ?', [A1]).id
// round, order, label, group, a, b, score a, score b
const games: [number, number, string, string | null, string, string, number, number][] = [
  [1, 0, 'Group A', 'A', 'Authari', 'Albie', 6, 1], [1, 1, 'Group A', 'A', 'Aary', 'Neto', 6, 2],
  [1, 2, 'Group B', 'B', 'Kamby', 'Troechka', 6, 2], [1, 3, 'Group B', 'B', 'Rigo', 'Odin', 6, 2],
  [2, 0, 'Group A', 'A', 'Authari', 'Aary', 3, 4], [2, 1, 'Group A', 'A', 'Albie', 'Neto', 5, 3],
  [2, 2, 'Group B', 'B', 'Kamby', 'Rigo', 3, 4], [2, 3, 'Group B', 'B', 'Troechka', 'Odin', 6, 1],
  [3, 0, 'Group A', 'A', 'Authari', 'Neto', 6, 0], [3, 1, 'Group A', 'A', 'Albie', 'Aary', 1, 6],
  [3, 2, 'Group B', 'B', 'Kamby', 'Odin', 6, 0], [3, 3, 'Group B', 'B', 'Troechka', 'Rigo', 3, 4],
  [4, 0, 'Semi-Final 1', null, 'Aary', 'Kamby', 6, 1], [4, 1, 'Semi-Final 2', null, 'Rigo', 'Authari', 5, 4],
  [5, 0, 'Final', null, 'Aary', 'Rigo', 7, 4],
]
for (const [r, o, label, g, a, b, sa, sb] of games) {
  execute(`INSERT INTO matches (bracket_id, round, match_order, match_label, group_label, captain_a_id, captain_b_id, score_a, score_b, winner_captain_id, status, is_finals)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'played', ?)`,
    [B1, r, o, label, g, cap1[a], cap1[b], sa, sb, sa > sb ? cap1[a] : cap1[b], r === 5 ? 1 : 0])
}
execute("INSERT INTO matchups (tournament_id, bracket_id, round, label, map_id, faction_a_id, faction_b_id, is_public) VALUES (?, ?, 5, 'Final', ?, ?, ?, 1)",
  [T, B1, mapIds[4], fac['Vlandia'], fac['Battania']])

// ─── Division 2: live, mid-auction ────────────────────────────────────────────
execute("INSERT INTO auctions (tournament_id, name, status, bid_cooldown_seconds) VALUES (?, 'Division 2', 'ready', 3)", [T])
const A2 = one("SELECT id FROM auctions WHERE name = 'Division 2'").id
const caps2: [string, string, string, string][] = [
  ['Aldric', 'cav', 'Iron Wolves', 'DRAFT-CAPT01'], ['Berengar', 'inf', 'Ashen Banner', 'DRAFT-CAPT02'],
  ['Cassia', 'arc', "Cassia's Company", 'DRAFT-CAPT03'], ['Dorian', 'inf', "Dorian's Host", 'DRAFT-CAPT04'],
  ['Elric', 'cav', "Elric's Vanguard", 'DRAFT-CAPT05'], ['Freya', 'inf', 'Northwind', 'DRAFT-CAPT06'],
  ['Godric', 'inf', "Godric's Own", 'DRAFT-CAPT07'], ['Hilde', 'inf', "Hilde's Shieldwall", 'DRAFT-CAPT08'],
]
for (const [n, c, t, token] of caps2) {
  execute('INSERT INTO captains (auction_id, display_name, team_name, budget, class, token) VALUES (?, ?, ?, 20, ?, ?)', [A2, n, t, c, token])
}
const cap2 = Object.fromEntries(queryAll<{ id: number; display_name: string }>('SELECT id, display_name FROM captains WHERE auction_id = ?', [A2]).map(r => [r.display_name, r.id]))
execute("INSERT INTO auction_sessions (auction_id, status, half_budget, sold_count, skipped_count, started_at) VALUES (?, 'live', 1, 17, 2, ?)", [A2, now()])
const S2 = one('SELECT id FROM auction_sessions WHERE auction_id = ?', [A2]).id
execute("INSERT INTO brackets (tournament_id, auction_id, name) VALUES (?, ?, 'Division 2')", [T, A2])

const pool2 = ['Varrick', 'Saoirse', 'Osric', 'Wulfric', 'Bryn', 'Dagny', 'Eirik', 'Gudrun', 'Halvar', 'Ingrid', 'Jorund', 'Kolbein', 'Liv', 'Magnar', 'Njal', 'Orm', 'Ragna', 'Sigurd', 'Tova', 'Ulf', 'Vidar', 'Yrsa', 'Asger', 'Bodil', 'Dag', 'Torvald', 'Ysolde', 'Brann', 'Maelis', 'Oswin', 'Ranulf']
pool2.forEach((p, i) => {
  const name = `${p} II`
  execute('INSERT INTO players (tournament_id, name, classes, is_available) VALUES (?, ?, ?, ?)', [T, name, classesOf(i + 3), i < 17 ? 0 : 1])
  const pid = one('SELECT id FROM players WHERE name = ? AND tournament_id = ?', [name, T]).id
  if (i < 17) {
    execute('INSERT INTO session_purchases (session_id, captain_id, player_id, player_name, price) VALUES (?, ?, ?, ?, ?)',
      [S2, cap2[caps2[i % 8][0]], pid, name, Math.round((7 - Math.floor(i / 8) * 2) * 10 + (i % 6)) / 10])
    execute("INSERT INTO session_queue (session_id, player_id, player_name, queue_position, status) VALUES (?, ?, ?, ?, 'sold')", [S2, pid, name, i])
  } else {
    execute('INSERT INTO session_queue (session_id, player_id, player_name, queue_position, status) VALUES (?, ?, ?, ?, ?)', [S2, pid, name, i, i === 17 ? 'active' : 'pending'])
  }
})
const active = one("SELECT id FROM session_queue WHERE session_id = ? AND status = 'active'", [S2]).id
const bids: [string, number][] = [['Aldric', 4.8], ['Cassia', 5.0], ['Aldric', 5.2], ['Freya', 5.4]]
for (const [n, a] of bids) {
  execute('INSERT INTO session_bids (session_id, queue_entry_id, captain_id, captain_name, amount, placed_at) VALUES (?, ?, ?, ?, ?, ?)', [S2, active, cap2[n], n, a, now()])
}
const chat: [string, string, string][] = [
  ['captain', 'Aldric', 'gl hf everyone'], ['auctioneer', 'Auctioneer', 'Half budget lifts after player 24.'],
  ['captain', 'Freya', 'who still needs cav?'], ['captain', 'Cassia', 'me, badly'],
  ['host', 'Host', 'Reminder: rosters lock at the end of this session.'],
]
for (const [r, n, c] of chat) execute('INSERT INTO session_chat (session_id, author_role, author_name, content) VALUES (?, ?, ?, ?)', [S2, r, n, c])

console.log(`[seed] BDC XVI seeded (tournament ${T}). Division 1 finished, Division 2 live (session ${S2}).`)
console.log('[seed] Log in at /login with:')
console.log('       host        DRAFT-HOST01')
console.log('       auctioneer  DRAFT-AUCT01')
console.log('       captains    DRAFT-CAPT01 … DRAFT-CAPT08 (Aldric … Hilde, Division 2)')
console.log('       admin       ADMIN_PASSWORD from your environment, at /admin-login')
process.exit(0)
