import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

let passed = 0
let failed = 0

function check(actual, expected, label) {
  if (Object.is(actual, expected)) {
    passed += 1
    return
  }
  failed += 1
  console.error(`  ❌ ${label}`)
  console.error(`       expected: ${JSON.stringify(expected)}`)
  console.error(`       actual:   ${JSON.stringify(actual)}`)
}

function checkIncludes(content, searchString, label) {
  if (content.includes(searchString)) {
    passed += 1
    return
  }
  failed += 1
  console.error(`  ❌ ${label}`)
  console.error(`       missing substring: ${searchString}`)
}

async function verifyIndexes() {
  console.log('— Verifying SQL composite index migrations in supabase_migration.sql')

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

  console.log('\n— Verifying SQL composite index migrations in MASTER_PRODUCTION_MIGRATION.sql')

  const masterPath = path.join(rootDir, 'supabase', 'MASTER_PRODUCTION_MIGRATION.sql')
  const masterContent = fs.readFileSync(masterPath, 'utf8')

  checkIncludes(masterContent, 'idx_cycles_user_start_date', 'master migration contains idx_cycles_user_start_date')
  checkIncludes(masterContent, 'idx_daily_logs_user_date', 'master migration contains idx_daily_logs_user_date')
  checkIncludes(masterContent, 'idx_weight_user_recorded', 'master migration contains idx_weight_user_recorded')

  console.log(`\n✅ All ${passed} database index assertions passed.`)
  if (failed > 0) process.exit(1)
}

verifyIndexes()
