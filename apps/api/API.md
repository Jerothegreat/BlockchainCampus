# UMak Pay API: frontend contract

Base URL `http://localhost:3000` (phone: `adb reverse tcp:3000 tcp:3000`). Amounts are integer **centavos**.
Cashier routes need header `x-cashier-key: <CASHIER_KEY>`.

| Route | Who | Notes |
|---|---|---|
| `POST /link` `{uid, studentNo, name?, pin}` | cashier | 201 `{uidHash, studentNo, address}`, 409 `ALREADY_LINKED` |
| `GET /students/by-uid/:uidHash` | cashier | `{uidHash, studentNo, name, address, balance, offlineCap}` |
| `POST /topup` `{uidHash, amount, orNumber}` | cashier | `{txHash, explorer}` |
| `GET /merchants` | any | `[{id, name, address, deviceAddress}]` |
| `POST /merchants` `{name, deviceAddress?}` | cashier | 201 merchant |
| `POST /merchants/:id/device` `{deviceAddress}` | cashier | register/rotate the stall's POS key; 409 `DEVICE_IN_USE` |
| `GET /sync` | POS device | device-auth headers (below) |
| `POST /settle` `{receipts:[…]}` | POS + student phone | signed receipts (below) |
| `GET /receipts/:id` | any | `{id, status, reason, txHash, explorer}` |
| `GET /students/:address/receipts?limit=50` | student phone (`/me`) | `{address, studentNo, name, balance (null if chain down), pendingTotal, receipts:[{id, to, merchant, amount, status, reason, txHash, explorer, createdAt}]}` |

## POS device key
On first run the POS phone generates a key (`generatePrivateKey()` from `viem/accounts`), keeps it in IndexedDB, and shows its address. The cashier registers it with `POST /merchants/:id/device`. One device per stall.

## `GET /sync` device auth
```
ts = Date.now()
x-device-address:   account.address
x-device-timestamp: ts                      // within ±2 min of server time
x-device-signature: await account.signMessage({ message: `UMak Pay device auth ${ts}` })
```
Response: `{ syncedAt, students:[{uidHash, studentNo, name, address, pinHash, pinSalt, pinIter, balance, offlineCap}], merchants:[…] }`.
Errors: 401 `DEVICE_AUTH_REQUIRED | DEVICE_CLOCK_SKEW | DEVICE_NOT_REGISTERED | DEVICE_AUTH_INVALID`, 502 `CHAIN_UNAVAILABLE`.

## Offline PIN check (PBKDF2, WebCrypto, ~15–100 ms)
```js
const key  = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits'])
const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: hexToBytes(pinSalt), iterations: pinIter }, key, 256)
ok = toHex(bits) === pinHash
```
Never log or store the PIN. Lock a card on the device after 3 wrong PINs.

## Signed receipts (EIP-712)
The POS signs every receipt when it is created. The QR carries `sig`, and the student phone forwards it unchanged.
```js
const domain = { name: 'UMak Pay', version: '1', chainId: 97, verifyingContract: '0x08494bba10FF9E6C6562D1F495ab9b1361D2522f' } // use /health values
const types = { Receipt: [
  { name: 'id', type: 'string' }, { name: 'from', type: 'address' }, { name: 'to', type: 'address' },
  { name: 'amount', type: 'uint256' }, { name: 'createdAt', type: 'uint64' } ] }
const r = { id: crypto.randomUUID(), from: student.address, to: stall.address, amount, createdAt: Date.now() }
const sig = await account.signTypedData({ domain, types, primaryType: 'Receipt',
  message: { ...r, amount: BigInt(r.amount), createdAt: BigInt(r.createdAt) } })
POST /settle { receipts: [{ ...r, sig }] }   // ≤ 50 per batch
```
Each result has a `status`:
- `settled`
- `failed` (`INSUFFICIENT`)
- `pending` (comes with HTTP 502: retry later)
- `rejected`, with reason `UNKNOWN_PARTY`, `CONFLICT`, `BAD_SIGNATURE` or `STALL_HAS_NO_DEVICE`

Submitting the same receipt from both phones is safe.

## Demo data
- `pnpm --filter api seed` creates 4 stalls and 3 demo students (`de:00:00:01…03`, PIN 1234).
- `--fund` also tops each demo student up ₱200 on-chain and settles 3 payments each.
