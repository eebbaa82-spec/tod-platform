# Requirement coverage

Against the ToD Platform Requirements Definition V-005 (November 4, 2026).
Requirements added since V-002 are listed under *New in V-005* at the end. Status key:

* **Built**: implemented and, where marked ✔, exercised by an automated test.
* **Developer**: part of the partner-bank identity, vetting or escrow modules, behind the
  interfaces in [DEVELOPER-INTEGRATION.md](DEVELOPER-INTEGRATION.md).
* **Partly**: the data and hooks exist; the full feature is still to do.
* **Later**: R2 to R4 items not started.

## 4.1 Accounts and authentication

| ID | Status | Notes |
| --- | --- | --- |
| FR-ACC-01 | Built ✔ | Phone and one-time code registration as talent or client |
| FR-ACC-02 | Built | Add the other role from the account page |
| FR-ACC-03 | Built ✔ | Password or 6-digit PIN; code on a new device and for reset |
| FR-ACC-04 | Built ✔ | Authenticator-app MFA for every staff role, enforced in the API guard |
| FR-ACC-05 | Built ✔ | Versioned consents (`POLICY_VERSIONS` parameter) |
| FR-ACC-06 | Built ✔ | Assisted registration with the owner's code, agent recorded |
| FR-ACC-07 | Built | Lock after `LOGIN_MAX_FAILED_ATTEMPTS`, SMS notice |
| FR-ACC-08 | Built | Deactivate, data export and logged erasure request |
| FR-ACC-09 | Built ✔ | Under-18 refused on the verified date of birth |

## 4.2 Identity verification (through the partner bank)

| ID | Status | Notes |
| --- | --- | --- |
| FR-KYC-01, 06, 09, 10, 11, 12 | Developer | Bank connector (IF-01), reference vault, queues, request counting |
| FR-KYC-02 | Built ✔ | Consent recorded before every request; refused without it |
| FR-KYC-07 | Built | No photograph or biometric field is received or stored |
| FR-KYC-03 | Built | Only name, sex, date of birth, result and a token for the bank reference |
| FR-KYC-04 | Built ✔ | One account per identity token derived from the bank customer reference |
| FR-KYC-05 | Built ✔ | Badge and masked identifier |
| FR-KYC-08 | Built ✔ | Every request and result audited with method and reference |

## 4.3 Talent profile and tiering

| ID | Status | Notes |
| --- | --- | --- |
| FR-TAL-01, 04, 05 | Built | Profile field groups, portfolio, availability and response time |
| FR-TAL-02 | Built | Sex and age from the verified identity; voluntary disability, displacement, other |
| FR-TAL-03 | Built ✔ | Restricted fields never on the public profile |
| FR-TAL-06 | Built | Tier per service area; package minimum tier and concurrency enforced |
| FR-TAL-07 | Developer | Promotion is a vetting outcome |
| FR-TAL-08 | Partly | Profile-completeness proxy used in matching until the index is defined |
| FR-TAL-09 | Built | Payout account name must match the verified name |
| FR-TAL-10 | Later | |
| FR-TAL-11 | Built | Badge, tier and test score shown when there is no history |

## 4.4 Vetting

FR-VET-01 to 12 are **Developer**. The marketplace side (outcome, tiers,
publication, suspension, reduced visibility field) is built.

## 4.5 Clients

| ID | Status | Notes |
| --- | --- | --- |
| FR-CLI-01 to 04 | Built | Three levels and their required fields; staff confirm Verified enterprises |
| FR-CLI-05 | Built ✔ | Value limits per level, provisional limit, unverified cannot post |
| FR-CLI-06 | Built | Referral source |
| FR-CLI-07 | Later | |

## 4.6 Catalogue

| ID | Status | Notes |
| --- | --- | --- |
| FR-CAT-01, 03, 04 | Built ✔ | Versioned packages; assignments bound to the version |
| FR-CAT-02 | Built | 14 packages across the 10 areas, EN and AM (prices are placeholders) |
| FR-CAT-05 | Built | Custom scope for Expert tier through support scoping |
| FR-CAT-06 | Built | Extension flag hides a package |

## 4.7 Matching and proposals

| ID | Status | Notes |
| --- | --- | --- |
| FR-MAT-01 | Built | Package, or a described need that support scopes |
| FR-MAT-02 | Built | Weighted ranking (`MATCH_WEIGHTS`) |
| FR-MAT-03 | Built | Inclusion slots for new Entry-tier talents |
| FR-MAT-04, 05, 06 | Built ✔ | Accept price, propose, counter, decline; every price recorded |
| FR-MAT-07 | Built | Support alert when no proposal after one working day |
| FR-MAT-08 | Built | Direct repeat engagement after a completed assignment |
| FR-MAT-09 | Built ✔ | Contacts masked in messages before funding |

## 4.8 Assignments and milestones

| ID | Status | Notes |
| --- | --- | --- |
| FR-ASG-01 | Built ✔ | State machine with guarded transitions |
| FR-ASG-02 | Built ✔ | Talent told to start only when Funded |
| FR-ASG-03, 05, 06 | Built ✔ | Evidence against the checklist, revision limit, password sign-off |
| FR-ASG-04 | Built ✔ | Review window, reminders, auto-acceptance |
| FR-ASG-07 | Built | Free before funding; mutual refund after |
| FR-ASG-08 | Built | Deadline alerts before and at the deadline |
| FR-ASG-09 | Built | Several milestones with own amounts and deadlines |

## 4.9 Escrow and payments

| ID | Status | Notes |
| --- | --- | --- |
| FR-ESC-01 | Built / Developer | Unique reference and instructions built; channel adapters by developer |
| FR-ESC-02, 05, 06 | Built ✔ | Funded only on confirmation; release rules; net payout and receipt |
| FR-ESC-03, 09, 12 | Developer | Ledger, daily reconciliation, file exchange |
| FR-ESC-04 | Built | Instructions only; no Operator account in the flow |
| FR-ESC-07 | Built ✔ | Two different people for dispute splits and financial parameter changes |
| FR-ESC-08 | Built ✔ | Freeze on dispute |
| FR-ESC-10 | Built | Refund to the originating party |
| FR-ESC-11 | Built | Idempotency keys on every instruction and inbound event |
| FR-ESC-13 | Partly | Receipt shows commission; tax invoice format to be confirmed |

## 4.10 Pay-later

Built ahead of R2 against a **test lender** (`TestLenderConnector`). The real
lender plugs in through `LENDER_CONNECTOR` in `integrations/lender.ts`; see
the integration guide, section 4. `PAY_LATER_ENABLED` stays off in a fresh
install. Limits are in `PAY_LATER_LIMITS`, the tenor in `PAY_LATER_TENOR_DAYS`
and the default and freeze rules in `PAY_LATER_RISK`; all are FINANCIAL
parameters and need a second approver to change.

| ID | Status | Notes |
| --- | --- | --- |
| FR-BNP-01 | Built ✔ | Global switch `PAY_LATER_ENABLED`; per-client switch for administrators (Console, Pay-later) |
| FR-BNP-02 | Built ✔ | Confirmed verified enterprise, bank-verified identity, establishment date, approved pay-later cohort, stated purpose, no arrears or default |
| FR-BNP-03 | Built ✔ | The agreed application data (registration, beneficial owner, time in operation, platform history, amount, tenor, purpose) goes to the lender and is kept as sent; the lender's decision is recorded, never made by ToD |
| FR-BNP-04 | Built ✔ | Lender limits per enterprise, per assignment and for the portfolio; first-cycle limit; cohort cap (`Cohort.payLaterCap`); sector cap as a share of the portfolio limit; step-up after a full repayment |
| FR-BNP-05 | Built ✔ | The facility funds escrow; each accepted (or dispute-released) stage becomes an instalment due 30 to 60 days later |
| FR-BNP-06 | Built ✔ | Acknowledgement of debt signed with the client's PIN, in their language, with time and IP, before any drawdown |
| FR-BNP-07 | Built ✔ | Reminders before (`PAY_LATER_REMINDER_DAYS_BEFORE`), on, and 1, 8 and 31 days after the due date; new assignments blocked while late |
| FR-BNP-08 | Built ✔ | Partial repayments applied oldest first; ageing, default rate, arrears over 30 days as a share of the balance, matured loans; default rate in the indicators report |
| FR-BNP-09 | Built ✔ | No second agreement while any pay-later balance is open |
| FR-BNP-10 | Built ✔ | `LENDER_VIEWER` role: read-only portfolio, agreements and evidence packs |
| FR-BNP-11 | Built ✔ | Daily check: above the trigger, new approvals freeze, client limits are cut (`freezeLimitCut`), finance is alerted and the event is flagged for the SNV snapshot; finance lifts the freeze with a reason |
| FR-BNP-12 | Built ✔ | Portfolio view (Console, Pay-later) and an evidence pack per borrower (agreement, acknowledgement, accepted work, schedule, reminders, repayments, exceptions, audit trail) |
| FR-BNP-13 | Built ✔ | Negotiated due dates and other exceptions need a reason and a second approver; repeat use waits for a recorded affordability reassessment |

## 4.11 Commission and fees

| ID | Status | Notes |
| --- | --- | --- |
| FR-COM-01 | Built ✔ | 5% standard, 1% for women with a verified identity or confirmed disability, snapshotted at agreement |
| FR-COM-02 | Built ✔ | Parameters with effective dates and a second approver |
| FR-COM-06 | Built | `TALENT_FEES_ENABLED` off |
| FR-COM-03, 04, 05 | Later | |

## 4.12 Disputes

| ID | Status | Notes |
| --- | --- | --- |
| FR-DSP-01, 02 | Built ✔ | Open within the window; owner assigned; evidence snapshot |
| FR-DSP-03 | Built | Stage targets in working days with alerts |
| FR-DSP-04, 05 | Built ✔ | Remedies; execution under dual authorisation |
| FR-DSP-06 | Built | One appeal, decided by someone else, final |
| FR-DSP-07 | Built | Closure notices |
| FR-DSP-08 | Partly | Rate and resolution time in MEL; by-cause report to add |

## 4.13 Ratings

| ID | Status | Notes |
| --- | --- | --- |
| FR-RAT-01, 02 | Built ✔ | Both directions, only after escrow settlement |
| FR-RAT-03 | Built ✔ | Published together, or after 7 days |
| FR-RAT-04 | Built | One reply; moderator removal with reason |
| FR-RAT-05 | Built ✔ | Trust score and level |
| FR-RAT-06 | Later | |

## 4.14 Messaging and notifications

| ID | Status | Notes |
| --- | --- | --- |
| FR-MSG-01 | Built | Per-assignment threads with files |
| FR-MSG-02 | Built | In-app and SMS (AfroMessage adapter); Telegram and email adapters |
| FR-MSG-03 | Built | Language and channel preferences |
| FR-MSG-04 | Built | Off-platform warning in both languages |
| FR-MSG-05 | Built | Announcements to a role |

## 4.15 Support and safeguarding

| ID | Status | Notes |
| --- | --- | --- |
| FR-SUP-01 | Built | App, call line and assisted desk tickets |
| FR-SUP-02 | Built ✔ | Confidential channel on every screen; designated staff only |
| FR-SUP-03 | Built ✔ | Two-working-day acknowledgement with alerts; outcome required to close |
| FR-SUP-04 | Partly | Accommodation ticket category; fulfilment tracking to add |
| FR-SUP-05 | Later | |
| FR-SUP-06 | Partly | Policy versions recorded; published texts to be supplied by the consortium |

## 4.16 Administration

| ID | Status | Notes |
| --- | --- | --- |
| FR-ADM-01 | Built | Web console with role-based menus |
| FR-ADM-02 | Built ✔ | Parameters editable without a release |
| FR-ADM-03 | Built | Suspend and reinstate with reason |
| FR-ADM-04 | Built | Search for users, assignments, disputes and tickets |
| FR-ADM-05 | Built ✔ | Append-only, hash-chained audit log with a verify check |
| FR-ADM-06 | Partly | Queue counts and ageing; identity and reconciliation queues come with the developer modules |

## 4.17 Analytics and reporting

| ID | Status | Notes |
| --- | --- | --- |
| FR-MEL-01, 02 | Built ✔ | Core indicators; talent and client disaggregation |
| FR-MEL-03, 04 | Built | Funnels and willingness to pay |
| FR-MEL-05 | Built ✔ | Small-cell suppression (`SMALL_CELL_THRESHOLD`) |
| FR-MEL-06 | Built ✔ | Excel export recording the date range and filters |
| FR-MEL-07 | Partly | Read-only `PARTNER_VIEWER` role sees aggregates; reporting pack to add |
| FR-MEL-08 | Later | |
| FR-MEL-09, 10 | Later | R3 |

## 4.18 Commercial operations

FR-BIZ-01 to 15 are **Later** (R3 and R4).

## New in V-005

Requirements added since V-002.

| ID | Release | Status | Notes |
| --- | --- | --- | --- |
| FR-TAL-12 | R1 | Built ✔ | "How did you hear about ToD?" channel and referring organisation on the talent profile |
| FR-CLI-02, 03 | R1 | Built ✔ | Owner verified through the partner bank; verified enterprise needs date of establishment (not in the future) and beneficial owner |
| FR-CLI-08 | R1 | Built ✔ | Voluntary women-led, youth-led and disability ownership flags at every client level |
| FR-ESC-14 | R1 | Built ✔ | `ESCROW_MODE=INTERIM`: every release and refund waits for two different finance officers (Console, Interim payouts); assignments carry an "Interim escrow" label and a named case owner |
| FR-DSP-09 | R1 | Built | Stage targets, intake timer, two-working-day alert and evidence lock |
| FR-ADM-07 | R1 | Built ✔ | Pilot groups (Console, Pilot groups) approved by the super administrator; a proposal can only be accepted when both people are in an approved group, within its value limit |
| FR-MEL-11, 12 | R1 | Built ✔ | Monthly GESI report (Console, Reports, GESI report) for the ten indicators, targets in `GESI_TARGETS`, flags in `GESI_FLAGS`, monthly flag notice to MEL officers |
| BR-07 | R1 | Built | Basic and individual client limits set to 10,000 birr |
| BR-16 | R1 | Built | Trust levels from completed work, rating, repeat clients and upheld disputes (`TRUST_THRESHOLDS`) |
| BR-02 | R1 | Built | Inclusive 1% commission ends on `COMMISSION_INCLUSIVE_UNTIL` (22 Feb 2027) |
| FR-TAL-08, BR-13, 14 | R2 | Later | Readiness index |
| FR-BNP-01 to 13 | R2 | Built ✔ | Pay-later with a test lender, ready for the signed lender's adapter (see 4.10) |
