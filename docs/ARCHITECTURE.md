# Architecture

## Shape

```
apps/web  (Next.js, browser)  ──/api rewrite──▶  apps/api (NestJS)  ──▶  PostgreSQL
                                                     │
                                                     ├─ integrations/  ◀── Fayda, vetting, escrow modules (developer)
                                                     ├─ notifications/ ──▶ SMS (AfroMessage), Telegram, email
                                                     └─ files/         ──▶ local disk (swap for object storage in Ethiopia)
```

A single API process serves the web app and staff console. The web app calls
it through a same-origin rewrite, so the session is an httpOnly cookie.
Scheduled rules (review windows, deadlines, invitation expiry, rating
publication, dispute and safeguarding targets) run every five minutes in
`jobs/jobs.service.ts`; set `JOBS_DISABLED=true` on all but one instance if
you scale out.

## Modules (`apps/api/src`)

| Module | Responsibility |
| --- | --- |
| `common` | Config, Prisma, audit log, sequences, parameters, clock, crypto, auth guard |
| `auth` | Registration, sign-in, OTP, staff MFA, assisted registration |
| `integrations` | The three developer interfaces, publication rule, stand-ins |
| `talent`, `clients` | Profiles, payout account, client levels and limits |
| `catalogue` | Versioned packages |
| `assignments` | Requests, matching, invitations, proposals, milestones, review windows |
| `payments` | Commission, funding instructions, settlements, receipts, inbound escrow events |
| `disputes` | Case workflow, decisions, approvals, appeals, execution |
| `ratings` | Two-way ratings and the trust score |
| `messaging` | Per-assignment threads with contact masking |
| `support` | Helpdesk and the confidential safeguarding channel |
| `admin` | Users, roles, staff, parameters with approval, audit search, overview |
| `reports` | MEL indicators, disaggregation with suppression, funnels, WTP, Excel export |
| `me` | Identity and vetting entry points, data export, deactivation, erasure |
| `jobs`, `dev` | Scheduler; test stand-in routes (404 in production) |

## Rules that hold everywhere

* **Money** is integer santim. Commission is computed per settled milestone
  from the rate snapshotted on the assignment when it was agreed.
* **State changes** to an assignment go through `assignments/state.ts`, which
  checks the allowed transition and uses an optimistic update, and records an
  `AssignmentEvent`.
* **Audit**: identity, payment, dispute, configuration and administrative
  actions write to `AuditLog`. Rows are hash-chained and a database trigger
  blocks update, delete and truncate. `GET /api/admin/audit/verify` checks
  the chain.
* **Personal data**: the payout account number is encrypted with AES-256-GCM;
  the Fayda identifier is stored only masked; restricted fields (disability,
  displacement, contacts, payout details) never appear on public profiles;
  confidential cases are visible only to designated safeguarding staff.
* **Staff** sessions require an authenticator code; routes used only by staff
  reject sessions without MFA.
* **Time** comes from `ClockService`, which tests can move forward.
* **Working days** exclude Saturday, Sunday and the `HOLIDAYS` parameter
  (fill it with Ethiopian public holidays each year).

## Deployment notes

Hosting must be in Ethiopia (NFR-PRV-02). The API and web app run as two
Node processes behind a reverse proxy that terminates TLS and forwards
`/api` to the API; `deploy/compose.yaml` sets this up with Docker, see
[DEPLOYMENT.md](DEPLOYMENT.md). Replace `LocalDiskStorage` and `NoScanner` in
`files/storage.ts` with the chosen object store and a malware scanner. Back
up PostgreSQL daily; financial records are kept for ten years.
