# Demo data, auto Employee ID and extras: implementation summary

Date: 2026-10-04. Branch: `feature/demo-data-auto-id`. Spec: `docs/superpowers/specs/2026-10-04-demo-data-auto-id-design.md`. Plan: `docs/superpowers/plans/2026-10-04-demo-data-auto-id.md`.

## Original request
Make the Employee ID automatic. Add a way to load 10,000 demo employees with one click on the dashboard (no 10k/20k/30k choices). Check the assessment PDF and fill any gaps. Add a short "what is this app" card to the dashboard. Add small nice-to-have features.

## What was built
- **Auto Employee ID.** Migration `20261004120000_employee_code_sequence` creates `employee_code_seq` and starts it after the highest existing `EMP-<n>`. `createEmployee` takes `nextval` (`EMP-` + 5 digits). `employeeCode` was removed from the create schema, the add dialog and the form types; a client-supplied one is ignored; PATCH still rejects it. `DUPLICATE_EMPLOYEE_CODE` can no longer happen.
- **Demo data.** `backend/src/modules/demo-data/`: a pure deterministic generator (every employee gets a salary history) (`demo-data.generator.ts`), a service that tops up to exactly 10,000 inside one transaction with an advisory lock (`demo-data.service.ts`), `GET /api/demo-data` and `POST /api/demo-data/seed` (ADMIN), and `bun run db:seed:demo`. Demo rows are identified by the `@demo.acme.example` email domain. Real run: 10,000 employees in 8.4 s; a repeat is a no-op.
- **Dashboard.** `AboutCard` (one line per page plus key ideas) at the top, and `DemoDataCard` (admin only: "Load demo data" with a spinner, then a "Demo data loaded" line with a confirmed "Reseed demo data" button).
- **CSV export.** `GET /api/salaries/export` (list filters, no paging, formula-safe, BOM) and an "Export CSV" button via the `/employees/export` route. Page size options now include 100.
- **Docs.** `docs/00-requirements-one-pager.md`, `docs/05-tradeoffs-and-performance.md` (timings, trade-offs, AI usage), READMEs, status doc and module doc updated.

## API and database changes
New: `GET/POST /api/demo-data`, `GET /api/salaries/export`. Changed: `POST /api/employees` ignores `employeeCode`. Database: one sequence, no table changes.

## Tests
Backend 264 passing (new: generator, seed service including concurrency and top-up, routes, CSV helper, export endpoint, ID generation). Frontend 305 passing (new: dashboard cards and seeding flows, export link, export route). Typecheck and build clean. Timings at 10k rows are in the trade-offs doc.

## Known limitations
- Reseed (`POST /api/demo-data/reseed`, dashboard "Reseed demo data" with a confirm) deletes only employees on the `@demo.acme.example` domain and their salary history, then seeds a fresh 10,000. Employee IDs keep counting up (no gap-closing, to avoid racing concurrent creates).
- Every demo employee has a salary, so the dashboard Attention card is empty for demo data. It only flags employees you add without a salary.
- The seed runs inside one HTTP request (about 8 s); fine for a demo, a job queue would be needed beyond that.
- Hand-created employees keep working; legacy 4-digit IDs stay as they are.
- Export is capped at 50,000 rows. Real-browser click-through, deployment and the demo video are still to do.

## Next
CSV import, an audit log, user management, then responsive layout.
