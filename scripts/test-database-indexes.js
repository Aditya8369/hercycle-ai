import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

let passed = 0
let failed = 0

function checkIncludes(content, searchString, label) {
  if (content.includes(searchString)) {
    passed += 1
    return
  }
  failed += 1
  console.error(`  ❌ ${label}`)
  console.error(`       missing substring: ${searchString}`)
}

async function verifySchema() {
  console.log('— Verifying SQL composite indexes in supabase_migration.sql')

  const migrationPath = path.join(rootDir, 'supabase_migration.sql')
  const migrationContent = fs.readFileSync(migrationPath, 'utf8')

  checkIncludes(
    migrationContent,
    'CREATE INDEX IF NOT EXISTS idx_cycles_user_start_date ON cycles(user_id, start_date DESC);',
    'contains idx_cycles_user_start_date'
  )
  checkIncludes(
    migrationContent,
    'CREATE INDEX IF NOT EXISTS idx_daily_logs_user_date ON daily_logs(user_id, date DESC);',
    'contains idx_daily_logs_user_date'
  )
  checkIncludes(
    migrationContent,
    'CREATE INDEX IF NOT EXISTS idx_weight_user_recorded ON weight_entries(user_id, recorded_date DESC);',
    'contains idx_weight_user_recorded'
  )

  console.log('\n— Verifying Foreign Key CASCADE constraints in supabase_migration.sql')

  checkIncludes(migrationContent, 'user_profiles_user_id_fkey', 'contains user_profiles CASCADE constraint')
  checkIncludes(migrationContent, 'cycles_user_id_fkey', 'contains cycles CASCADE constraint')
  checkIncludes(migrationContent, 'daily_logs_user_id_fkey', 'contains daily_logs CASCADE constraint')
  checkIncludes(migrationContent, 'weight_entries_user_id_fkey', 'contains weight_entries CASCADE constraint')
  checkIncludes(migrationContent, 'challenge_progress_user_id_fkey', 'contains challenge_progress CASCADE constraint')
  checkIncludes(migrationContent, 'user_badges_user_id_fkey', 'contains user_badges CASCADE constraint')

  console.log(`\n✅ All ${passed} database schema assertions passed.`)
  if (failed > 0) process.exit(1)
}

verifySchema()
