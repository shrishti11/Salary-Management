# Demo data, auto Employee ID and extras — Plan

Spec: `docs/superpowers/specs/2026-10-04-demo-data-auto-id-design.md`. Build on `feature/demo-data-auto-id`, commit per task, tests first.

1. **Auto Employee ID (backend):** migration with sequence + setval; `createEmployee` takes the next value via `nextval`; drop `employeeCode` from `createEmployeeSchema`; update tests.
2. **Auto Employee ID (frontend):** remove the ID field from the add dialog, form schema and API types; update tests.
3. **Demo data service (backend):** deterministic generator, `seedDemoData`/`getDemoDataStatus`, routes, CLI script `db:seed:demo`; tests.
4. **Dashboard UI:** demo-data card with states, "About this app" card; tests.
5. **CSV export + page size:** backend export endpoint reusing the directory filters; frontend button and selector; tests.
6. **Verify at 10k:** seed through the API, time key endpoints, add an index only if needed.
7. **Docs:** one-pager, trade-offs/performance, implementation summary, status and READMEs.
