/**
 * Regression test for PWA install prompt component structure & configuration (GitHub Issue #816).
 *
 *   node scripts/test-install-prompt.js
 */

import fs from 'fs'
import path from 'path'

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

function checkTrue(actual, label) {
  check(Boolean(actual), true, label)
}

function section(title) {
  console.log(`\n— ${title}`)
}

section('Component & Layout Checks')

const rootDir = process.cwd()

const installPromptPath = path.join(rootDir, 'components', 'layout', 'InstallPrompt.jsx')
checkTrue(fs.existsSync(installPromptPath), 'InstallPrompt.jsx exists in components/layout/')

const installPromptCode = fs.readFileSync(installPromptPath, 'utf8')
checkTrue(installPromptCode.includes("'use client'"), 'InstallPrompt is a client component')
checkTrue(installPromptCode.includes('beforeinstallprompt'), 'Listens for beforeinstallprompt event')
checkTrue(installPromptCode.includes('appinstalled'), 'Listens for appinstalled event')
checkTrue(installPromptCode.includes('preventDefault'), 'Calls preventDefault on install prompt event')
checkTrue(installPromptCode.includes('userChoice'), 'Awaits user choice on prompt trigger')
checkTrue(installPromptCode.includes('sessionStorage'), 'Uses sessionStorage for dismiss persistence')
checkTrue(installPromptCode.includes('display-mode: standalone'), 'Detects standalone display mode')

const layoutPath = path.join(rootDir, 'app', '[locale]', 'layout.js')
const layoutCode = fs.readFileSync(layoutPath, 'utf8')
checkTrue(layoutCode.includes('InstallPrompt'), 'Layout imports InstallPrompt')
checkTrue(layoutCode.includes('<InstallPrompt />'), 'Layout renders <InstallPrompt />')

section('Localization Checks')

const enPath = path.join(rootDir, 'messages', 'en.json')
const hiPath = path.join(rootDir, 'messages', 'hi.json')

const enContent = JSON.parse(fs.readFileSync(enPath, 'utf8'))
const hiContent = JSON.parse(fs.readFileSync(hiPath, 'utf8'))

checkTrue(Boolean(enContent.InstallPrompt), 'en.json contains InstallPrompt section')
check(enContent.InstallPrompt.title, 'Install HerCycle AI', 'English install title is correct')

checkTrue(Boolean(hiContent.InstallPrompt), 'hi.json contains InstallPrompt section')
check(hiContent.InstallPrompt.title, 'HerCycle AI इंस्टॉल करें', 'Hindi install title is correct')

section('PWA Manifest & Asset Verification')

const manifestPath = path.join(rootDir, 'public', 'manifest.json')
checkTrue(fs.existsSync(manifestPath), 'manifest.json exists in public/')

const manifestContent = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
check(manifestContent.display, 'standalone', 'Manifest display mode is standalone')

console.log(`\n========================================`)
console.log(`Passed: ${passed}`)
console.log(`Failed: ${failed}`)
console.log(`========================================\n`)

if (failed > 0) {
  process.exit(1)
}
