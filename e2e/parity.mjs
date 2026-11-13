// Parity gate (docs/handoff.md, step 5): board-A/<screen>.html vs the running build.
// Compares the boxes of landmark elements in order; anything more than 8 px off is reported.
// Usage: node e2e/parity.mjs [baseUrl] [widths] [screens]
//   node e2e/parity.mjs http://localhost:5173 390,768 pos-keypad,pos-tap
// Writes e2e/parity-out/<screen>@<w>.{board,app}.png and e2e/parity-out/report.json.
import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BASE = process.argv[2] ?? 'http://localhost:5173'
const WIDTHS = (process.argv[3] ?? '390,768').split(',').map(Number)
const ONLY = process.argv[4]?.split(',')
const TOL = 8
const OUT = resolve(root, 'e2e/parity-out')
mkdirSync(OUT, { recursive: true })

const click = (name) => async (p) => p.getByRole('button', { name, exact: true }).first().click()
const link = (name) => async (p) => p.getByRole('link', { name, exact: true }).first().click()
const pin = (digits) => async (p) => {
  for (const d of digits) await p.getByRole('button', { name: `Digit ${d}`, exact: true }).click()
  await p.waitForTimeout(400)
}
const toPin = [click('Rice meal 85'), click('Charge ₱85.00'), click('Demo: ID tapped'), link('Confirm')]

/** Each screen: the route to open and the steps that put the app in the board's state. */
export const SCREENS = {
  'pos-keypad': { path: '/pos', steps: [click('Rice meal 85')] },
  'pos-tap': { path: '/pos', steps: [click('Rice meal 85'), click('Charge ₱85.00')] },
  'pos-confirm': { path: '/pos', steps: [click('Rice meal 85'), click('Charge ₱85.00'), click('Demo: ID tapped')] },
  'pos-pin': { path: '/pos', steps: toPin },
  'pos-dialog': { path: '/pos', steps: [...toPin, pin('1111')] },
  'pos-approved': { path: '/pos', steps: [...toPin, pin('1234')] },
  'pos-today': { path: '/pos/today', steps: [] },
  'pos-queue': { path: '/pos/queue', steps: [] },
}

// Landmarks compared in document order within each group.
const GROUPS = {
  header: 'header',
  title: 'h1',
  nav: 'nav[aria-label="Main"]',
  button: 'button, a.sl, a[href].rounded-full',
  slip: '.slip',
  dialog: '[role="alertdialog"]',
  card: '.rounded-\\[12px\\]',
  list: '.divide-y',
}

async function boxes(page) {
  return page.evaluate((groups) => {
    const out = {}
    for (const [g, sel] of Object.entries(groups)) {
      out[g] = [...document.querySelectorAll(sel)]
        .filter((el) => {
          const r = el.getBoundingClientRect()
          const cs = getComputedStyle(el)
          return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !el.closest('[hidden]')
        })
        .map((el) => {
          const r = el.getBoundingClientRect()
          return { x: Math.round(r.x), y: Math.round(r.y + scrollY), w: Math.round(r.width), h: Math.round(r.height), text: (el.textContent ?? '').trim().slice(0, 40) }
        })
    }
    return out
  }, GROUPS)
}

function compare(a, b) {
  const diffs = []
  for (const g of Object.keys(GROUPS)) {
    const A = a[g], B = b[g]
    if (A.length !== B.length) diffs.push({ group: g, issue: `count board ${A.length} vs app ${B.length}`, board: A.map((x) => x.text), app: B.map((x) => x.text) })
    for (let i = 0; i < Math.min(A.length, B.length); i++) {
      const off = ['x', 'y', 'w', 'h'].filter((k) => Math.abs(A[i][k] - B[i][k]) > TOL)
      if (off.length) diffs.push({ group: g, index: i, off: off.map((k) => `${k} ${A[i][k]}→${B[i][k]}`).join(', '), board: A[i].text, app: B[i].text })
    }
  }
  return diffs
}

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined })
const report = []
for (const [name, s] of Object.entries(SCREENS)) {
  if (ONLY && !ONLY.includes(name)) continue
  for (const w of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 844 }, reducedMotion: 'reduce' })
    const board = await ctx.newPage()
    await board.goto(pathToFileURL(resolve(root, `docs/design/board-A/${name}.html`)).href, { waitUntil: 'networkidle' })
    await board.evaluate(() => document.fonts.ready)
    const b = await boxes(board)
    await board.screenshot({ path: `${OUT}/${name}@${w}.board.png`, fullPage: true })

    const app = await ctx.newPage()
    await app.goto(BASE + s.path, { waitUntil: 'networkidle' })
    await app.evaluate(() => document.fonts.ready)
    await ctx.setOffline(true) // the board draws the stall offline
    await app.waitForTimeout(300)
    for (const step of s.steps) {
      await step(app)
      await app.waitForTimeout(250)
    }
    const a = await boxes(app)
    await app.screenshot({ path: `${OUT}/${name}@${w}.app.png`, fullPage: true })
    const diffs = compare(b, a)
    report.push({ screen: name, width: w, pass: diffs.length === 0, diffs })
    console.log(`${diffs.length === 0 ? 'PASS' : 'DIFF'} ${name} @${w}${diffs.length ? ` (${diffs.length})` : ''}`)
    await ctx.close()
  }
}
await browser.close()
writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2))
