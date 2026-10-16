# Integration guide for the three developer modules

The marketplace is complete except for three modules that the integration
developer builds:

1. **Fayda identity verification** (requirements section 4.2, FR-KYC-01 to 12)
2. **The vetting workflow** (section 4.4, FR-VET-01 to 12)
3. **Bank-held escrow with reconciliation** (section 4.9, FR-ESC-01 to 13)

Each module plugs into the API through a small, fixed interface in
`apps/api/src/integrations`. The rest of the platform depends only on these
interfaces, so the modules can be built, tested and replaced without touching
the marketplace code.

Until the modules exist, **test stand-ins** fill the gaps so the whole platform
can be demonstrated and tested end to end. The stand-ins are reachable only
when `APP_ENV` is not `production`, and the escrow stand-in refuses to start in
production at all.

| Module | Where it plugs in | Stand-in used today |
| --- | --- | --- |
| Fayda | `IDENTITY_PROVIDER` and `IdentityResultService.apply()` in `integrations/identity.ts` | `PendingIdentityProvider` plus `POST /api/dev/identity/:userId` |
| Vetting | `VettingOutcomeService.apply()` in `integrations/vetting.ts` | `POST /api/dev/vetting/:userId` |
| Escrow | `ESCROW_PROVIDER` (`EscrowProvider`) in `integrations/escrow.ts`, and `PaymentEventsService` in `payments/payment-events.service.ts` | `TestEscrowProvider` plus `POST /api/dev/funding/:reference` |

Providers are wired in `apps/api/src/integrations/integrations.module.ts`.
Replace the stand-in class there with your implementation.

---

## 1. Fayda identity verification

### What the marketplace does already

* `POST /api/me/identity/start` is the user's "Verify my identity" button. It
  calls `IdentityVerificationProvider.start(userId)` and marks the user
  `PENDING`. Whatever your `start()` returns (`redirectUrl`, `message`) is
  passed back to the app, so an eSignet or VeriFayda redirect works without UI
  changes.
* `IdentityResultService.apply(result, actorId?)` is the single place where an
  identity outcome is written. It:
  * enforces **one account per identity** using `identityToken`, and rejects
    a duplicate with `409 IDENTITY_DUPLICATE` (FR-KYC-04);
  * refuses anyone **under the minimum age** (parameter `MINIMUM_AGE`, 18),
    deactivates the account and returns `403 UNDER_AGE` (FR-ACC-09);
  * stores only the masked identifier (`6302 XXXX XXXX 9718`), verified name,
    sex, date of birth, photo file id and status (FR-KYC-03, FR-KYC-05);
  * writes an `IDENTITY_RESULT` audit entry with the method and reference, and
    a hash of the token, never the attributes themselves (FR-KYC-08);
  * publishes or hides the talent profile through `PublicationService`.
* Client value limits follow the result: `PROVISIONAL` users get the
  `ASSIGNMENT_VALUE_LIMITS.PROVISIONAL` limit; unverified users cannot post
  (FR-KYC-09, FR-CLI-05).
* The 1% inclusive commission for women uses `sex` from the verified result,
  so it applies only after Fayda verification (FR-COM-01).

### What you build

* The relying-party flow with Fayda (VeriFayda 2.0 or eSignet): consent
  capture before each request (FR-KYC-02), OTP or biometric authentication on
  Fayda's side, and the callback.
* The **encrypted identifier vault**: the authentic FAN or FIN is held only in
  your module, encrypted separately, and readable only by the verification
  service (FR-KYC-06). Give the marketplace a stable opaque `identityToken`
  per person instead.
* The provisional manual-verification queue and the failed or partial review
  queue with retry limits and escalation (FR-KYC-09, FR-KYC-10).
* Counting verification calls for cost reporting (FR-KYC-12).
* No biometric data is ever stored (FR-KYC-07).

### Contract

```ts
// apps/api/src/integrations/identity.ts
interface IdentityVerificationProvider {
  readonly name: string;
  start(userId: string): Promise<{ status: 'PENDING'; redirectUrl?: string; message?: string }>;
}

interface IdentityResult {
  userId: string;
  status: 'VERIFIED' | 'PROVISIONAL' | 'FAILED' | 'PENDING';
  identityToken?: string;          // stable, opaque, one per person
  identifierForMasking?: string;   // FAN/FIN in clear, used only to compute the mask, never stored
  verifiedName?: string;
  sex?: 'FEMALE' | 'MALE';
  dateOfBirth?: Date;
  photoFileId?: string;            // upload the photo through FilesService first
  method: 'FAYDA_OTP' | 'FAYDA_BIOMETRIC' | 'MANUAL_PROVISIONAL' | 'TEST_STAND_IN';
  reference?: string;              // Fayda transaction reference
}
```

Call `identityResultService.apply(result, staffUserIdOrUndefined)` when a
verification finishes, including provisional approvals by staff and the later
upgrade from `PROVISIONAL` to `VERIFIED`. Catch `IDENTITY_DUPLICATE` and
`UNDER_AGE` to route the case to your review queue.

---

## 2. Vetting workflow

### What the marketplace does already

* `POST /api/me/vetting/request` moves a talent from `NOT_STARTED` to
  `IN_PROGRESS` and alerts vetting officers. Hook your pipeline's start here,
  or start it from your own screens.
* `VettingOutcomeService.apply(outcome)` writes the result: vetting status,
  tier and test score per service area, an audit entry, and profile
  publication.
* A profile is published only when vetting is `APPROVED` **and** identity is
  `VERIFIED` or `PROVISIONAL` (FR-VET-07, FR-TAL-11). Suspending the account
  hides it again.
* Matching uses the tiers: a talent is invited only to packages at or below
  their tier in that service area, and only while under the tier's concurrency
  limit (`TIER_CONCURRENCY`, FR-TAL-06). The test score is shown to clients on
  proposals and on profiles with no history.
* `TalentProfile.visibility` (`NORMAL` or `REDUCED`) is there for graduated
  sanctions (FR-VET-10). Suspension is in the staff console already.

### What you build

The six-stage pipeline (FR-VET-01): practical tests per service area in
Amharic or English (FR-VET-02), soft-skills assessment (FR-VET-03), the officer
review queue (FR-VET-04), referees (FR-VET-05), automated screening for
duplicate phones, payment accounts and devices (FR-VET-06), induction and quiz
(FR-VET-07), probation flags (FR-VET-08), stage timings (FR-VET-09), sanctions
(FR-VET-10), auditor sampling (FR-VET-11) and retakes after the configured
interval (FR-VET-12). Promotion between tiers (FR-TAL-07) is also an
`apply()` call with the new tier.

### Contract

```ts
// apps/api/src/integrations/vetting.ts
interface VettingOutcome {
  talentUserId: string;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'APPROVED' | 'REJECTED';
  tiers?: { serviceAreaCode: string; tier: 'ENTRY' | 'INTERMEDIATE' | 'EXPERT'; testScore?: number }[];
  reviewerId?: string;
  note?: string;
}
```

Service area codes are in `apps/api/prisma/catalogue-data.ts` (`SOCIAL`,
`DIGITAL_MKT`, `DESIGN`, `BOOKKEEPING`, `DATA_ENTRY`, `INVENTORY`,
`CUSTOMER_DB`, `ECOMMERCE`, `BUS_ADMIN`, `WEB_IT`).

---

## 3. Bank-held escrow with reconciliation

### What the marketplace does already

The marketplace decides **when** money moves and **how much**; your module
makes it move and proves it moved.

| Moment | Marketplace action | Your provider receives |
| --- | --- | --- |
| Client accepts a proposal | Creates a `PaymentInstruction` with a unique reference `TODP…` | `requestCollection()` returns payment instructions in English and Amharic (and an optional checkout URL) |
| Client accepts a milestone, or the review window expires | Computes gross, commission and net from the rate snapshotted at agreement; creates a `Settlement` `TODS…` | `release()` |
| Cancellation by agreement after funding | Refund settlement | `refund()` |
| Dispute opened | Freezes the milestone amount | `freeze()` |
| Dispute decided and approved by a second person | Split, release or refund; correction unfreezes | `split()`, `release()`, `refund()`, `unfreeze()` |

`EscrowGateway` wraps your provider. It records each instruction once in the
`EscrowInstruction` table, keyed by its `idempotencyKey`, and never resends a
key (FR-ESC-11). Split instructions carry the two approvers
(`requestedById`, `approvedById`), who are always different people
(FR-ESC-07, FR-DSP-05).

Inbound events go to `PaymentEventsService`:

```ts
fundingConfirmed({ paymentReference, amount, providerRef, channel })  // only this marks Funded (FR-ESC-02)
payoutCompleted({ instructionRef, providerRef })                       // talent paid: receipt, close, rating prompts
refundCompleted({ instructionRef, providerRef })                       // client refunded
```

All three are idempotent. A short payment is refused with `FUNDING_SHORT`. The
talent is told to start only after `fundingConfirmed` (FR-ASG-02).

### What you build

* The adapters to the partner bank and to telebirr and CBE Birr, by API or by
  secure file exchange with manual confirmation where no API exists
  (FR-ESC-01, FR-ESC-12). Funds never pass through an Operator account
  (FR-ESC-04).
* The transaction-level **escrow ledger** (FR-ESC-03).
* **Daily reconciliation** between the ledger and the bank or provider
  statement, with a variance queue; a payout touched by a variance is held
  until cleared, which simply means you do not call `payoutCompleted` for it
  yet (FR-ESC-09). Variances can be added to the console's manual-review
  queues (FR-ADM-06).
* Dual authorisation for any manual release, refund, split or ledger
  adjustment you initiate inside your module (FR-ESC-07).
* Refunds to the originating account or channel (FR-ESC-10).
* The tax-compliant commission receipt or invoice (FR-ESC-13) if the bank or
  an accounting system produces it.

### Contract

```ts
// apps/api/src/integrations/escrow.ts
interface EscrowProvider {
  readonly name: string;
  readonly completesImmediately?: boolean; // leave unset: only the test stand-in completes synchronously
  requestCollection(i: CollectionRequest): Promise<{ instructionsEn: string; instructionsAm: string; checkoutUrl?: string }>;
  release(i: ReleaseInstruction): Promise<void>;
  refund(i: RefundInstruction): Promise<void>;
  split(i: SplitInstruction): Promise<void>;
  freeze(i: FreezeInstruction): Promise<void>;
  unfreeze(i: FreezeInstruction): Promise<void>;
}
```

All amounts are integer **santim** (1 ETB = 100). Payees and payers are given
as `Party` with the masked account reference; resolve the real account from
the talent's payout record (`TalentProfile.payoutAccountEnc`, decrypted with
`decryptField()` from `common/crypto.ts`) inside your module only.

---

## Wiring your implementation

```ts
// apps/api/src/integrations/integrations.module.ts
{ provide: IDENTITY_PROVIDER, useClass: FaydaIdentityProvider },
{ provide: ESCROW_PROVIDER, useClass: PartnerBankEscrowProvider },
```

If your module runs as a separate service, add a controller in your module
that authenticates the caller (mutual TLS or a signed request) and calls the
same services. Do not expose `/api/dev/*`; those routes return 404 in
production.

## Testing your module

`apps/api/test/e2e/journeys.spec.ts` runs the acceptance scenarios from
section 9.2 against a real database using the stand-ins. Swap a stand-in for
your implementation in a test module and the same scenarios should pass.
Scenarios 8 (reconciliation variance) and 9 (pay-later) belong to your module
and to the R2 pay-later work.
