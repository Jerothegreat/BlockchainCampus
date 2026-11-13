// Registered IDs with no wallet record must recover, save to the ID, then top up.
// Run against Vite: node e2e/me-topup.mjs [baseUrl]
import assert from 'node:assert/strict'
import { chromium, expect } from '@playwright/test'
import { createHash } from 'node:crypto'

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/chromium' })
async function runScenario(scenario) {
  const context = await browser.newContext()
  const page = await context.newPage()
  const uid = 'aabbccdd'
  const student = { uidHash: createHash('sha256').update(uid).digest('hex'), address: `0x${'3'.repeat(40)}`, name: 'Test Student', studentNo: '2026-001' }
  // Valid codec layout; API boundary mocked so the browser test never mints funds.
  const card = `0x01${'00'.repeat(81)}00`
  let topups = 0
  let restorations = 0
  const physical = scenario !== 'demo'
  if (physical) await page.addInitScript(() => {
    window.testCard = null
    window.testWriteFails = false
    window.NDEFReader = class {
      async scan() { window.testReader = this }
      async write(message) {
        if (window.testWriteFails) throw new Error('Test NFC write failed')
        window.testCard = [...message.records[0].data]
      }
    }
  })
  await page.route('**:3000/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    let result
    if (path === '/cards/lookup') result = { registered: true }
    else if (path === '/cards/login') {
      const restore = scenario !== 'nfc-existing'
      assert.equal(route.request().postDataJSON().restoreCard, restore)
      if (restore) restorations++
      result = restore ? { ...student, card } : student
    }
    else if (path === '/cards/refresh') result = { card, balance: 0, nonce: 0, settled: [] }
    else if (path === '/cards/topup') {
      assert.equal(route.request().postDataJSON().card, card)
      topups++
      result = { card, balance: 20000, nonce: 1, ref: 'TEST', txHash: `0x${'4'.repeat(64)}` }
    } else if (path.startsWith('/students/')) result = {
      ...student, balance: topups * 20000, pendingTotal: 0, receipts: [],
      activity: topups ? [{ kind: 'topup', id: 'test-topup', to: student.address, merchant: null,
        amount: 20000, status: 'settled', reason: null, txHash: `0x${'4'.repeat(64)}`,
        createdAt: Date.now(), method: 'online', ref: 'TEST' }] : [],
    }
    else result = {}
    await route.fulfill({ json: result })
  })
  await page.goto((process.argv[2] || 'http://127.0.0.1:5173') + '/me')
  if (scenario === 'nfc-existing') await page.evaluate((card) => {
    window.testCard = card.slice(2).match(/../g).map((byte) => parseInt(byte, 16))
  }, card)
  if (!physical) await page.evaluate(async ({ uid }) => {
    const { db } = await import('/src/lib/db.ts')
    await db.virtualCards.put({ uid, card: null, label: 'Registered demo ID' })
  }, { uid })
  const tap = async () => {
    if (!physical) return page.getByRole('button', { name: 'Registered demo ID' }).click()
    await page.getByRole('button', { name: 'Start scanning' }).click()
    await page.evaluate(() => window.testReader.onreading({ serialNumber: 'aa:bb:cc:dd', message: {
      records: window.testCard ? [{ recordType: 'mime', mediaType: 'application/x-umakpay', data: new DataView(new Uint8Array(window.testCard).buffer) }] : [],
    } }))
  }
  const credentials = async () => {
    await page.getByLabel('Email', { exact: true }).fill('student@umak.edu.ph')
    await page.getByLabel('Student number', { exact: true }).fill(student.studentNo)
    await page.getByLabel('PIN (6 digits)', { exact: true }).fill('123456')
    await page.getByRole('button', { name: 'Log in', exact: true }).click()
  }
  await tap()
  await credentials()
  await expect(page.getByText('Hi, Test', { exact: true })).toBeVisible()
  if (physical) {
    assert.ok(await page.evaluate(() => window.testCard), 'Login must save a wallet record to NFC')
    await page.waitForTimeout(1600) // useNfc suppresses write-triggered reads for 1.5 seconds.
  }
  if (scenario === 'nfc-record-lost' || scenario === 'nfc-write-fails') {
    await page.evaluate((fail) => { window.testCard = null; window.testWriteFails = fail }, scenario === 'nfc-write-fails')
  }
  await page.getByRole('link', { name: 'Top up', exact: true }).click()
  await tap()
  if (scenario === 'nfc-record-lost' || scenario === 'nfc-write-fails') await credentials()
  if (scenario === 'nfc-write-fails') {
    await expect(page.getByText('Card not saved yet', { exact: true })).toBeVisible()
    assert.equal(topups, 0, 'Do not mint before the restored wallet is saved')
    await page.evaluate(() => { window.testWriteFails = false })
    await page.getByRole('button', { name: 'Try again', exact: true }).click()
  }
  await expect(page.getByText('This ID is not registered yet.', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Topped up ₱200.00', { exact: true })).toBeVisible()
  assert.equal(topups, 1)
  assert.equal(restorations, scenario === 'nfc-existing' ? 0 : scenario.startsWith('nfc-') ? 2 : 1)
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(page.getByText('+₱200.00', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Activity', exact: true }).click()
  await expect(page.getByText('+₱200.00', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Pending', exact: true }).click()
  await expect(page.getByText('+₱200.00', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Settled', exact: true }).click()
  await expect(page.getByText('+₱200.00', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: /Top up.*TEST/ })).toHaveAttribute('href', /444444/)
  console.log(`PASS ${scenario}: login → save wallet → top up → save wallet → Recent and Activity`)
  await context.close()
}

try {
  for (const scenario of ['demo', 'nfc', 'nfc-existing', 'nfc-record-lost', 'nfc-write-fails']) await runScenario(scenario)
} finally {
  await browser.close()
}
