# Talent on Demand platform

Marketplace for the Talent on Demand (ToD) pilot in Addis Ababa: vetted young
talents deliver standard service packages to micro and small enterprises, and
the client's money is held by the partner bank until the work is accepted.

This repository holds the whole marketplace. Three modules are built
separately by the integration developer and plug in through fixed interfaces:
**Fayda identity verification**, the **vetting workflow**, and **bank-held
escrow with reconciliation**. Test stand-ins take their place outside
production. See [docs/DEVELOPER-INTEGRATION.md](docs/DEVELOPER-INTEGRATION.md).

| | |
| --- | --- |
| `apps/api` | NestJS 11 API, Prisma 6, PostgreSQL 16 |
| `apps/web` | Next.js 16 web app, English and Amharic, phone-first |
| `docs/` | [Integration guide](docs/DEVELOPER-INTEGRATION.md), [architecture](docs/ARCHITECTURE.md), [requirement coverage](docs/REQUIREMENTS-COVERAGE.md) |

## Run it locally

You need Node 22 and PostgreSQL 16.

```bash
npm install

# Database (create the role and two databases once)
createuser -s tod -P            # password: tod
createdb -O tod tod_dev
createdb -O tod tod_test

cp apps/api/.env.example apps/api/.env
npm run db:deploy -w apps/api   # apply migrations
npm run db:seed -w apps/api     # service areas, 14 packages, parameters, demo staff

npm run dev:api                 # http://localhost:4000/api
npm run dev:web                 # http://localhost:3000
```

Demo staff accounts (development only): phones `+251911000001` to
`+251911000006` (super admin, platform admin, support agent, vetting officer,
finance officer, MEL officer), password `ChangeMe-2026!`. The first sign-in
shows a secret to add to an authenticator app.

Outside production the API returns one-time codes in its responses (`devCode`)
and prints SMS to the console, so you can register without a phone.

## Try a full assignment

1. Register a talent and a client in the web app.
2. In the console, as the vetting officer, open each user and use **Test
   stand-ins** to set the identity result, and for the talent a vetting
   outcome with a tier in a service area.
3. As the client, request a package in that service area; the talent sees the
   invitation and accepts.
4. The client accepts the proposal and gets a payment reference. In the
   console, as the finance officer, confirm the reference on the **Funding**
   page (this stands in for the bank).
5. The talent delivers; the client accepts with their password; the talent is
   paid net of commission and both can rate.

## Tests

```bash
npm test -w apps/api
```

Runs unit tests and the end-to-end acceptance scenarios from section 9.2 of
the requirements (1 to 7 and 10 to 14) against `tod_test`, which is rebuilt
on each run. The setup refuses any database whose name does not end in
`_test`.

## Configuration

Business rules from section 5 of the requirements are **parameters**, edited
in the console without a release. Financial ones (commission rates and
eligibility, value limits, fees) need a second approver. Defaults are in
`apps/api/src/common/parameters.ts`.

Environment variables are listed in `apps/api/.env.example`. In production set
`APP_ENV=production`, long random `JWT_SECRET` and `FIELD_ENCRYPTION_KEY`
values from the secrets manager, and `SMS_PROVIDER=afromessage`.
