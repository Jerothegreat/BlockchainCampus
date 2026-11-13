# HeronPay API contract (web <-> apps/api)

Amounts and balances are integers in **centavos** (TagakPeso has 2 decimals): ₱85.00 = `8500`. Times are epoch milliseconds. `uid` is the normalized chip UID (lower-case hex, no separators; `apps/web/src/lib/uid.ts`). `uidHash = sha256(uid)` hex. `pinHash = sha256(pin + uid)` hex, the offline PIN check on the POS. Errors: `{ "error": string }` with a 4xx/5xx code.

| Method | Path | Body / query | 200 response |
| --- | --- | --- | --- |
| POST | `/link` | `{ uid, studentNo, name, pin }` (pin = 4 digits) | `201 Student`; `409` if the uid or student number is already linked |
| GET | `/students/by-uid/:uidHash` | | `Student` or `404` |
| GET | `/students/by-no/:studentNo` | | `Student` or `404` (cashier "Look up by student number") |
| POST | `/login` | `{ studentNo, pin }` | `Student` or `401` |
| GET | `/students/:studentNo/receipts` | | `ReceiptStatus[]`, newest first |
| GET | `/sync` | `?merchantId=&queue=` (records the stall's heartbeat for `/ops`) | `{ syncedAt, merchants: Merchant[], students: SyncStudent[] }` |
| POST | `/settle` | `{ receipts: Receipt[] }` (1 to 100) | `{ txHash: string \| null, receipts: ReceiptStatus[] }` |
| GET | `/receipts/:id` | | `ReceiptStatus` or `404` |
| GET | `/settlements` | `?limit=10` | `ReceiptStatus[]` settled, newest first (landing feed) |
| GET | `/ops` | | `Ops` (projector panel) |
| POST | `/assistant` | `{ studentNo, question }` | `{ answer, tip }` |

```ts
type Student = { uidHash: string; studentNo: string; name: string; address: `0x${string}`; balance: number }
type SyncStudent = Student & { pinHash: string; offlineCap: number; capReason: string; flagged: boolean }
type Merchant = { id: string; name: string; address: `0x${string}` }

// Made offline by the POS, carried in the receipt QR, posted by either phone.
type Receipt = {
  id: string            // crypto.randomUUID(); the contract id is keccak256(utf8(id))
  from: `0x${string}`   // student address
  to: `0x${string}`     // merchant address
  amount: number        // centavos, > 0
  createdAt: number
  uidHash: string
  merchantId: string
  item?: string
}
type ReceiptStatus = Receipt & {
  status: 'pending' | 'settled' | 'failed'
  txHash: string | null
  blockNumber: number | null
  merchantName: string
  studentName: string
  failReason: string | null   // 'INSUFFICIENT'
}

type Ops = {
  flags: { uidHash: string; studentName: string; reason: string; at: number; capBefore: number; capAfter: number }[]
  stalls: { merchantId: string; name: string; online: boolean; queue: number; lastSync: number | null }[]
  totals: { settled: number; pending: number; failed: number; count: number }
  receipts: ReceiptStatus[]          // latest 20
  caps: { studentName: string; uidHash: string; offlineCap: number; capReason: string }[]
}
```

Rules:
- `/settle` is idempotent per receipt id: an id already settled in the DB is returned as is and never sent to the chain again; the contract skips duplicates as a second guard.
- A receipt the chain reports as `PaymentFailed` is `failed` with `failReason: 'INSUFFICIENT'`.
- If the chain call throws, the receipts stay `pending` and the response is `502`.
- Offline cap default is 20000 (₱200). A flagged student gets `offlineCap: 0` on the next `/sync`.
- A stall is `online` in `/ops` if its last `/sync` was under 2 minutes ago.
