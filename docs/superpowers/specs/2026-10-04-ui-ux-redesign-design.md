# UI/UX Redesign — Design

Date: 2026-10-04. Branch: `feature/ui-ux-redesign`.

## Goal

Give HR users a clean, light, professional, simple UI with low cognitive load. Every page, feature and control has one clear purpose, with no overlap. Frontend restructure only: no new product features. One small additive backend change (below).

## Constraints

- Stay on MUI 9. No new UI dependencies. Light theme only. Desktop-first, usable on tablet.
- Keep URL-driven filters, sort and pagination.
- Existing tests are updated, not dropped. Typecheck and tests must pass.

## Information architecture

Nav (3 items): **Dashboard**, **Employees**, **Analytics**. One page per question:

| Page | Question it answers |
|---|---|
| Dashboard `/dashboard` | What needs my attention today? |
| Employees `/employees` | Who works here, and what do they earn now? |
| Employee profile `/employees/:id` | Everything about one person |
| Analytics `/analytics` | How does compensation look company-wide? |

Removed:
- `/salaries` page and nav item (merged into Employees).
- `/employees/new` and `/employees/:id/edit` as pages (become dialogs). Old URLs redirect: `/employees/new` to `/employees?add=1` (opens the add dialog), `/employees/:id/edit` to `/employees/:id?edit=1`.
- `/salaries` redirects to `/employees`.
- Salary breakdown charts on the Dashboard (they belong to Analytics).

## Backend change (additive)

`GET /api/salaries` rows gain `employee.designation` and `employee.joiningDate`. The Employees list uses this endpoint (employee plus current salary). `GET /api/employees` stays but the list UI no longer calls it. Backend tests updated.

## Visual system

- Custom MUI theme: neutral gray background, white surfaces, one calm accent, Inter, 8px spacing, 8px radius, 1px borders instead of heavy shadows. Semantic colors only for status.
- White top bar and sidebar. User name and logout sit in a user menu at the bottom of the sidebar.
- Shared components: `PageHeader` (breadcrumbs, title, actions), `FilterBar`, `DataTable` helpers, `EmptyState`, `FormDialog`, toast provider, `Money` display, `StatusChip`.
- Loading: skeleton rows in tables. Errors: inline `Alert` with retry. Empty states each have one next action.

## Employees list

- Columns: Name (link; email and Employee ID as captions), Department (designation caption), Country, Joined, Current salary, Status.
- Salary cell: gross with currency (`USD 120,000`); "No salary" chip when absent; small "Revision scheduled" marker when applicable.
- Filters: search always visible (name, email, ID). Status segmented control (Active default / Inactive / All). Department, Country and Salary presence (Any / Has / No salary) in a "Filters" popover with an active-count badge and Clear.
- Sort: name, department, country, joined, effective date. No amount sort (currencies are not converted).
- Row click opens the profile. Kebab menu: View, Edit, Set/Revise salary, Deactivate/Reactivate (each opens a dialog in place).
- "Add employee" opens a dialog.

## Add/Edit employee dialog

- Sections: Basic (first name, last name, work email, phone optional) and Job (Employee ID, department, designation, country, joining date).
- Employee ID is required and typed by the user on create (backend requirement), read-only on edit. Auto-generation would be a backend change and is out of scope.
- Joining date cannot be in the future. Country is a searchable select.
- After add: stay on the list, toast "Employee added" with a "Set salary" action.

## Profile

- Header: breadcrumb (Employees / Name), initials avatar, name, status chip, designation · department · country. Actions: Edit, Set/Revise salary, "⋯" menu with Deactivate (confirm) or Reactivate (no confirm).
- Tabs: Overview (Contact, Employment) and Compensation (current salary card with gross/net/deductions/components, scheduled-change banner, history timeline with reason and effective date).

## Salary dialog

Same fields and validation. Grouped as Amount (currency, base salary, components) and When and why (effective date, reason). Live Gross/Deductions/Net summary. Currency-change warning kept.

## Dashboard

- Stat tiles: Active employees, Departments, Countries, Without salary.
- Attention card: "N employees have no salary", linking to Employees with the Salary filter applied. Only data already in the metrics is used.
- Recent hires and Recent salary changes.

## Analytics

Content unchanged; restyled to the new system with filters in one top bar.

## Global UX rules

- Toast on every success, inline errors on forms.
- Dialogs close on Esc; primary action right, cancel secondary.
- Consistent labels and page titles across the app.

## Testing

- Update route and component tests for moved/merged pages, the new nav, redirects and dialogs.
- Add tests for new shared components and the redirects.
- Backend: test the two added fields.
- `npm run typecheck`, `npm test` (frontend) and backend tests must pass.
- Manual browser walkthrough of every page before completion.

## Docs

On completion: update `docs/04-implementation-status.md` and other affected docs, and add `docs/implementation/2026-10-04-ui-ux-redesign-summary.md`.

## Out of scope

Dark mode, mobile layout, Employee ID auto-generation, amount sorting, currency conversion, new analytics.
