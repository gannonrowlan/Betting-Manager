# Bankroll IQ

Bankroll IQ is a Node.js and Express betting tracker for logging wagers, reviewing performance, and managing bankroll movement without relying on spreadsheets.

## What It Does

- Session-based auth with registration, login, logout, account settings, and password reset
- Add, edit, delete, and bulk delete bets
- Track straight bets and multi-leg tickets
- Review history with filters, sorting, CSV export, and CSV import
- Monitor bankroll settings, deposits, and withdrawals
- View dashboard and stats pages for ROI, win rate, bankroll trend, and category breakdowns
- Run health and readiness checks for deployment environments

## Stack

- Node.js
- Express
- EJS
- MySQL
- `express-session` with a MySQL-backed session store
- Playwright for browser E2E coverage
- Node test runner for unit and integration tests

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Create your environment file

Copy [.env.example](/c:/Users/rowla/OneDrive/Desktop/Projects/Sports%20Betting%20Manager/Betting-Manager/.env.example) to `.env` and fill in your local MySQL credentials.

Required values:

- `NODE_ENV`
- `PORT`
- `DB_HOST`
- `DB_PORT`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`
- `SESSION_SECRET`

Optional values:

- `TRUST_PROXY`
- `DB_SSL`
- `DB_CONNECTION_LIMIT`
- `APP_BASE_URL`

### 3. Set up the database

Create a MySQL database and run the schema in [schema.sql](/c:/Users/rowla/OneDrive/Desktop/Projects/Sports%20Betting%20Manager/Betting-Manager/src/config/schema.sql).

```sql
SOURCE src/config/schema.sql;
```

The app also runs startup schema checks through [schemaService.js](/c:/Users/rowla/OneDrive/Desktop/Projects/Sports%20Betting%20Manager/Betting-Manager/src/services/schemaService.js), but keeping the main schema applied up front is still the cleanest local setup.

### 4. Start the app

```bash
npm run dev
```

Default local URL:

```text
http://localhost:3000
```

## Helpful Scripts

- `npm test` runs the unit and controller/integration test suite
- `npm run test:e2e` runs the Playwright browser suite
- `npm run dev` starts the app with `nodemon`
- `npm run start` starts the app normally
- `npm run seed:demo` seeds a local demo account and sample data

## Demo Seed

The demo seed script lives in [seedDemoData.js](/c:/Users/rowla/OneDrive/Desktop/Projects/Sports%20Betting%20Manager/Betting-Manager/scripts/seedDemoData.js).

After running:

```bash
npm run seed:demo
```

You can sign in with:

- Email: `demo@bankrolliq.local`
- Password: `demo-bankroll-2026`

## Testing

### Automated coverage

Unit and integration coverage currently exercises:

- auth validation and password reset services
- controller behavior for auth, bankroll, CSV import/export, and bet flows
- schema-loading behavior

Playwright E2E coverage currently exercises:

- register, login, logout, and password reset
- add, edit, single delete, and bulk delete bet flows
- history filtering and stats filtering
- bankroll settings plus deposit and withdrawal adjustments
- CSV import preview/import and CSV export happy path
- responsive/mobile navigation sanity checks

### Run tests

```bash
npm test
npm run test:e2e
```

## Project Structure

- [src/app.js](/c:/Users/rowla/OneDrive/Desktop/Projects/Sports%20Betting%20Manager/Betting-Manager/src/app.js) wires middleware, sessions, routes, and startup readiness
- [src/server.js](/c:/Users/rowla/OneDrive/Desktop/Projects/Sports%20Betting%20Manager/Betting-Manager/src/server.js) starts the HTTP server
- [src/controllers](/c:/Users/rowla/OneDrive/Desktop/Projects/Sports%20Betting%20Manager/Betting-Manager/src/controllers) contains auth, bet, and page request handling
- [src/services](/c:/Users/rowla/OneDrive/Desktop/Projects/Sports%20Betting%20Manager/Betting-Manager/src/services) contains stats, schema, import/export, session, and profile logic
- [src/views](/c:/Users/rowla/OneDrive/Desktop/Projects/Sports%20Betting%20Manager/Betting-Manager/src/views) contains EJS templates
- [tests/e2e](/c:/Users/rowla/OneDrive/Desktop/Projects/Sports%20Betting%20Manager/Betting-Manager/tests/e2e) contains Playwright tests
- [test](/c:/Users/rowla/OneDrive/Desktop/Projects/Sports%20Betting%20Manager/Betting-Manager/test) contains unit and integration tests

## Production Notes

- Use a strong `SESSION_SECRET`
- Set `NODE_ENV=production`
- Configure `APP_BASE_URL` for password reset links
- Enable `TRUST_PROXY` when running behind a reverse proxy
- Review [PRODUCTION_CHECKLIST.md](/c:/Users/rowla/OneDrive/Desktop/Projects/Sports%20Betting%20Manager/Betting-Manager/PRODUCTION_CHECKLIST.md) before launch

## Current Status

This repo is past the MVP sketch stage. The next major focus should be launch hardening and deployment polish rather than more speculative features.
