# UMak Pay API: frontend contract

Base URL `http://localhost:3000` (phone: `adb reverse tcp:3000 tcp:3000`). Amounts are integer **centavos**.
Cashier routes need the header `x-cashier-key: <CASHIER_KEY>`. Contract: **TagakPesoV2** (tPHP, one wallet per card, non-transferable).

## The card wallet model
Each NFC card is bound on-chain to exactly one wallet (`linkCard(cardId, wallet)`, immutable, `cardId = 0x + uidHash`).
The card stores a **signed wallet record** (balance, nonce, optional pending payment). The record can only change when:
1. the request is **online** (it reaches this API),
2. the card has **no pending payment**,
3. the request is made **with the card**: UID plus the record read from it.

Every endpoint that changes a card returns a new `card` hex. **The phone must write it to the card** (NDEF record, mime `application/x-umakpay`, raw bytes) before telling the user the operation is done. Use NTAG215-class storage; a record is 83 bytes when clear and 200 bytes when pending.

```
 [CLEAR] ──POS tap (offline OK), PIN ok, amount ≤ balance──► [PENDING]
    ▲   POS appends a signed receipt to the card                 │
    │                                                            │ any online tap: POST /cards/refresh
    └──── new clear record written to the card ◄─────────────────┘ (settles it on-chain)
 POST /cards/topup needs CLEAR + latest nonce → returns record with balance + amount
```

## Endpoints
| Route | Who | Notes |
|---|---|---|
| `GET /health` | any | `{chainId, contract, relayer, deployer, cardSigner}` |
| `POST /link` `{uid, studentNo, name?, pin}` | cashier | On-chain `linkCard`. 201 `{uidHash, studentNo, address, linkTx, card}`: **write `card`**. 409 `ALREADY_LINKED` |
| `POST /cards/topup` `{uid, card, amount}` | student phone | Online top-up (mock payment). Returns `{card, balance, nonce, txHash, explorer, ref}`. |
| `POST /cards/topup/cash` `{uid, card, amount, orNumber}` | cashier | Same rules, for cash |
| `POST /cards/refresh` `{uid, card}` | student phone / online POS | Settles the card's pending payment and any queued ones. Returns `{card, balance, nonce, settled:[…]}` |
| `GET /students/by-uid/:uidHash` | any | `{uidHash, studentNo, name, address, balance, offlineCap}` |
| `GET /students/:address/receipts?limit=50` | student phone | `{address, studentNo, name, balance, pendingTotal, receipts:[{id, to, merchant, amount, status, reason, txHash, explorer, createdAt}]}` |
| `GET /merchants` | any | `[{id, name, address, deviceAddress}]` |
| `POST /merchants` `{name, deviceAddress?}` | cashier | On-chain `addMerchant` |
| `POST /merchants/:id/device` `{deviceAddress}` | cashier | Register or rotate the stall's POS key |
| `GET /sync` | POS device | Device-auth headers. `{syncedAt, cardSigner, students:[{uidHash, studentNo, name, address, pinHash, pinSalt, pinIter, balance, offlineCap, cardNonce, blocked}], merchants}` |
| `POST /settle` `{receipts:[{id, cardId, to, amount, createdAt, cardNonce, sig}]}` | POS queue | ≤ 50 per batch; idempotent |
| `GET /receipts/:id` | any | `{id, status, reason, txHash, explorer}` |

### Card endpoint errors
- 400: `INVALID_CARD_RECORD`, `FORGED_CARD_RECORD`
- 404: `CARD_NOT_LINKED`
- 409: `CARD_PENDING` (call refresh first), `CARD_STALE` (call refresh first)
- 403: `CARD_BLOCKED`
- 502: `CHAIN_UNAVAILABLE` (the card is unchanged; retry)

## Card record (binary, big-endian)
```
STATE  (82)  0 u8 version=1 | 1 u64 balance | 9 u32 nonce | 13 u32 issuedAt(s) | 17 sig[65]
FLAG   (1)   0 = clear, 1 = pending follows
PENDING(117) 0 uuid[16] | 16 stall address[20] | 36 u64 amount | 44 u64 createdAt(ms) | 52 POS sig[65]
```
The STATE signature is EIP-712 `CardState{cardId bytes32, balance uint64, nonce uint32, issuedAt uint32}`, signed by `cardSigner`.
Domain: `{name:'UMak Pay', version:'1', chainId, verifyingContract: contract}` (values from `/health`).

## POS: offline payment
1. Read the UID and the record. Compute `cardId = '0x' + sha256(normalizedUid)`.
2. Check the STATE signature with `recoverTypedDataAddress(...) === cardSigner`. If it fails, refuse (forged).
3. Refuse if any of these is true:
   - FLAG = 1: the card already has a pending payment.
   - The cached `/sync` entry has `blocked`.
   - The record's nonce is below the cached `cardNonce`: the card holds a stale copy.
4. Verify the PIN offline (PBKDF2, below). Check `amount ≤ STATE.balance` (and `≤ offlineCap` if you want a stricter limit).
5. Sign the receipt with the device key:
   ```js
   types = { Receipt: [ {name:'id',type:'string'}, {name:'cardId',type:'bytes32'}, {name:'to',type:'address'},
                        {name:'amount',type:'uint256'}, {name:'createdAt',type:'uint64'}, {name:'cardNonce',type:'uint32'} ] }
   message = { id: uuid, cardId, to: stall.address, amount: BigInt(c), createdAt: BigInt(ms), cardNonce: STATE.nonce }
   ```
6. **Write STATE + FLAG=1 + PENDING to the card**, queue the receipt locally, then show success.
7. When the POS is online, `POST /settle` the queued receipts.
   - If the POS is online at the moment of the tap, it can call `/cards/refresh` right away and write back the clear record. The card is then never left pending.

The backend rejects receipts from a rolled-back card copy (`STALE_CARD_STATE` / `DOUBLE_SPEND`) and blocks that card.

## Device key and `/sync` auth
The POS generates a key once (`generatePrivateKey()`), keeps it in IndexedDB, and shows its address. The cashier registers it with `POST /merchants/:id/device`.
```
x-device-address: account.address | x-device-timestamp: Date.now() (±2 min)
x-device-signature: account.signMessage({ message: `UMak Pay device auth ${ts}` })
```

## Offline PIN check (PBKDF2, WebCrypto)
```js
const key  = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits'])
const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: hexToBytes(pinSalt), iterations: pinIter }, key, 256)
ok = toHex(bits) === pinHash
```

## Demo data
- `pnpm --filter api seed` creates 4 stalls and 3 virtual demo cards (`de:00:00:01…03`, PIN 1234), registered on-chain.
- `--fund` also tops each card up ₱200 and settles 3 payments each.
