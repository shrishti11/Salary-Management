# Demo data, auto Employee ID and small extras — Design

Date: 2026-10-04. Branch: `feature/demo-data-auto-id`. Approved in chat.

## Goal
Make the app demo-ready for the assessment (10,000 employees): auto-generated Employee IDs, one-click demo seeding from the dashboard, an in-app gist of the app, CSV export and page-size control, plus the missing assessment documents.

## Decisions
- **Employee ID:** Postgres sequence `employee_code_seq`, format `EMP-` + 5 digits. Migration sets the sequence past the highest existing numeric code. `employeeCode` is removed from the create API/form and stays read-only everywhere else. Old 4-digit codes remain valid.
- **Demo seed:** `POST /api/demo-data/seed` (ADMIN only) and `GET /api/demo-data` (`{ seeded, count }`, ADMIN and HR_MANAGER). Always seeds exactly 10,000 employees (no 10k/20k/30k choices, no reset). Marker: demo email domain `@demo.acme.example`. Idempotent: once 10,000 demo employees exist, seeding is a no-op. One transaction, `pg_advisory_xact_lock`, `createMany` batches, deterministic PRNG. Shared by `bun run db:seed:demo`.
- **Dataset:** 6 departments, designations per department, 21 supported countries mapped to currencies, ~90% active, 1-4 salary records each with history and components, a few future-dated (scheduled) revisions, every employee has a salary history (so the Attention card stays empty).
- **Dashboard:** "Load demo data" card (spinner while running) that becomes a quiet "Demo data loaded" line; an "About this app" card with a one-line gist per page.
- **Extras:** `GET /api/salaries/export` (CSV of the current filters, no pagination) with an "Export CSV" button; rows-per-page selector (20/50/100) on Employees.
- **Docs:** `docs/00-requirements-one-pager.md`, `docs/05-tradeoffs-and-performance.md` (includes AI usage), implementation summary, status doc and READMEs updated.

## Follow-up (same day)
After review: About card moved to the top of the dashboard; demo employees all have salaries; "Reseed demo data" (confirmed) added via `POST /api/demo-data/reseed`.

## Out of scope
CSV import, audit log, deployment and demo video (user-owned), amount sorting.

## Testing
Backend: ID generation (sequence, concurrency, legacy codes), seed idempotence/counts/determinism, role gating, CSV escaping. Frontend: dialog without ID, dashboard card states, export link, page size. Perf timings recorded at 10k rows.
