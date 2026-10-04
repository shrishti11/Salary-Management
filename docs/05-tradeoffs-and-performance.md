# Trade-offs, performance and how AI was used

## Key trade-offs
| Decision | Chosen | Alternative | Why |
|---|---|---|---|
| Salary history | Append-only records with components | Overwrite one salary column | History is a product requirement; it also makes "current salary" a query, not state. |
| Money | Decimal(14,2) per component, totals per currency | Convert to one currency | No honest conversion without a rate source; mixed totals would mislead. |
| Employee ID | Postgres sequence, `EMP-` + 5 digits | Typed by user, or app-side max+1 | Typed IDs are error-prone; max+1 races under concurrent creates. A sequence cannot collide. Gaps are fine. |
| Demo data | One idempotent endpoint that tops up to exactly 10,000 | Seed script run by hand, or 10k/20k/30k options | One click, never grows, safe to double click (advisory lock, one transaction). |
| Seed data | Pure deterministic generator, then `createMany` batches | Row-by-row inserts | The generator is unit-tested without a database; batching loads 10,000 employees and about 22,000 salary records (72,000 components) in about 8 s. Ids are random so reseeding can never collide. |
| Reseed | Deletes only the demo-domain rows, then seeds again, in one transaction | Wipe all employees | Never destroys hand-entered data. |
| Seed role | ADMIN only | HR too | It is a bulk write. HR can see status but not trigger it. |
| Employees list | Reuses the current-salary directory endpoint | Separate list plus lookups | One query shape for list, search and export. |
| Sort by effective date | Sorted in memory for the matching ids | SQL window function | Simple, and fast enough at 10,000 (below). Revisit past about 100,000. |
| CSV | Streamed through a frontend route, formula-safe | Direct link to the API | Works whenever the session cookie works; names starting with `=`, `+`, `-`, `@` cannot run as spreadsheet formulas. |

## Performance at 10,000 employees
Measured locally (Postgres in Docker, 10,006 employees, about 22,600 salary records), single request, warm:

| Request | Time |
|---|---|
| Employees list page (default) | 30 ms |
| Search `q=smith` | 53 ms |
| Sort by department | 15 ms |
| Sort by current effective date | 128 ms |
| Without-salary filter | 13 ms |
| Dashboard | 134 ms |
| Analytics summary / groups / distribution | 75-84 ms |
| Analytics trends | 134 ms |
| CSV export of all 10,006 rows (1.4 MB) | 415 ms |

No index changes were needed. Existing indexes cover status, department, country and name; salary records are unique per employee and effective date.

## How AI was used
Claude Code did the building; the human set direction and approved every stage.
- **Process:** each feature went brainstorm, written spec, written plan, then implementation in small commits. The specs and plans are committed as the thinking record: `docs/superpowers/specs/` and `docs/superpowers/plans/`. Per-module summaries are in `docs/implementation/`.
- **Prompts that steered it:** project rules live in `CLAUDE.md` (plan first and wait for approval, build incrementally, write a summary per module). The Git rule was never to commit to main: branch, pull request, merge.
- **Review:** larger work used a fresh implementer per task and a separate reviewer per task, then a whole-branch review. Reviews caught real bugs (a revalidation race that left stale data after saves, accessibility gaps, a dropped regression test).
- **Guardrails:** tests first for behaviour, typecheck and full suites before every commit, and a real run against the live database (seeding 10,000 rows and timing the endpoints).

## Known gaps
No audit log or CSV import yet, no mobile layout, no browser end-to-end tests, and deployment and the demo video are done outside the repo.
