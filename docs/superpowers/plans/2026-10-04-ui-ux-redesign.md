# UI/UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the app with a light, professional MUI theme and restructure it so each page has one purpose: merge Salaries into Employees, turn create/edit into dialogs, slim the Dashboard.

**Architecture:** Frontend-only restructure on the existing React Router 8 + MUI 9 app, plus one additive backend change (two fields and one sort key on `GET /api/salaries`). A custom theme plus small shared components (toast, dialog shell, empty state, money) are used by every page. URL-driven list state is kept.

**Tech Stack:** React Router 8 (framework mode), MUI 9, react-hook-form + zod, recharts, vitest + Testing Library; backend Express + Prisma + vitest/supertest.

**Spec:** `docs/superpowers/specs/2026-10-04-ui-ux-redesign-design.md`

## Global Constraints

- No new dependencies. MUI only. Light theme only.
- Nav is exactly three items: Dashboard, Employees, Analytics.
- Old URLs redirect: `/salaries` to `/employees`; `/employees/new` to `/employees?add=1`; `/employees/:id/edit` to `/employees/:id?edit=1`.
- Employee ID is typed by the user on create and read-only on edit.
- No amount sorting; currencies are never converted.
- Backend change is additive only: `employee.designation`, `employee.joiningDate`, sort key `joiningDate`.
- Commands: frontend `cd frontend && npm test && npm run typecheck`; backend `cd backend && npm test` (check `backend/package.json` scripts and use its test script name).
- Commit after each task on branch `feature/ui-ux-redesign`. Never commit to `main`.

## Review Focus

- Visiting `/employees?add=1` or `/employees/:id?edit=1` opens the dialog; closing it removes the param and leaves filters intact (tests in Tasks 6, 7).
- Deep links with stale filters (`/salaries?status=ALL&salary=without`) keep their query string through the redirect (Task 6).
- Server field errors (duplicate email/ID) show on the matching field inside the dialog, and the dialog stays open (Task 5).
- Employee with no salary, and with a scheduled revision, render correctly in the list (Task 6).
- Inactive employees cannot get Set/Revise salary in the list menu or profile (Tasks 6, 7).
- Empty list with filters vs. empty system show different empty states (Task 6).

## File Structure

Create:
- `frontend/app/theme.ts` — MUI theme.
- `frontend/app/components/common/ToastProvider.tsx` — `useToast()` hook plus snackbar.
- `frontend/app/components/common/EmptyState.tsx`
- `frontend/app/components/common/FormDialog.tsx` — dialog shell (title, body, Cancel/primary).
- `frontend/app/components/common/Money.tsx`
- `frontend/app/components/employees/EmployeeFormDialog.tsx` — replaces `EmployeeForm.tsx` usage.
- `frontend/app/components/employees/EmployeeDirectoryTable.tsx` — merged table with row menu.
- `frontend/app/components/employees/EmployeeFilterBar.tsx` — search, status toggle, filters popover.

Modify: `root.tsx`, `routes.ts`, `components/layout/AppLayout.tsx`, `components/layout/PageHeader.tsx`, `routes/employees.tsx`, `routes/employee-profile.tsx`, `routes/dashboard.tsx`, `routes/analytics.tsx`, `routes/login.tsx`, `components/salary/SalaryFormDialog.tsx`, `components/salary/CompensationSection.tsx`, plus tests beside each.

Delete: `routes/salaries.tsx` (+ test), `routes/employee-new.tsx`, `routes/employee-edit.tsx` (+ tests), `components/employees/EmployeeTable.tsx`, `EmployeeFilters.tsx`, `components/salary/SalaryDirectoryTable.tsx`, `SalaryDirectoryFilters.tsx` (+ tests), once nothing imports them.

---

### Task 1: Backend — add designation, joiningDate and joiningDate sort to the salary directory

**Files:**
- Modify: `backend/src/modules/salaries/salary.directory.service.ts` (serializeRow ~L27-35, buildOrderBy ~L58-70)
- Modify: `backend/src/modules/salaries/salary.schema.ts:58` (`DIRECTORY_SORT_FIELDS`)
- Test: `backend/src/modules/salaries/salary.directory.test.ts`

**Interfaces:**
- Produces: row `employee` gains `designation: string` and `joiningDate: string` (`YYYY-MM-DD`); `sortBy` accepts `"joiningDate"`.

- [ ] **Step 1: Write failing tests** — append inside the existing describe structure of `salary.directory.test.ts`, using the file's `rowFor`/`list` helpers and seeded data:

```ts
describe("designation and joining date", () => {
  it("returns designation and joiningDate on each row", async () => {
    const res = await list({ status: "ALL" });
    const emp = (res.body.data as Row[])[0].employee;
    expect(typeof emp.designation).toBe("string");
    expect(emp.joiningDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("sorts by joiningDate", async () => {
    const asc = await list({ status: "ALL", sortBy: "joiningDate", sortOrder: "asc" });
    const dates = (asc.body.data as Row[]).map((r) => r.employee.joiningDate as string);
    expect(dates).toEqual([...dates].sort());
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && npm test -- salary.directory`
Expected: FAIL (`designation` undefined; `sortBy` 400).

- [ ] **Step 3: Implement**

In `salary.schema.ts` change line 58 to:
```ts
export const DIRECTORY_SORT_FIELDS = ["name", "employeeCode", "department", "country", "joiningDate", "effectiveDate"] as const;
```
In `serializeRow` add after `email`:
```ts
      designation: employee.designation,
      joiningDate: isoDate(employee.joiningDate),
```
In `buildOrderBy` add a case beside `"country"`:
```ts
    case "joiningDate":
      return [{ joiningDate: order }, { id: "asc" }];
```
(If `buildOrderBy`'s parameter type is `Exclude<..., "effectiveDate">`, it already covers the new key.)

- [ ] **Step 4: Run backend tests**

Run: `cd backend && npm test`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add backend
git commit -m "feat(backend): add designation, joiningDate and joiningDate sort to salary directory"
```

---

### Task 2: Frontend data layer — employee directory params

The merged list uses `GET /api/salaries`. Keep `salary-directory-api.ts` as the single data module (rename-free, avoids churn) and extend it.

**Files:**
- Modify: `frontend/app/lib/salary-directory-api.ts`
- Modify: `frontend/app/lib/salary-directory-api.test.ts`

**Interfaces:**
- Produces: `SalarySortField` now includes `"joiningDate"`; `SalaryDirectoryRow.employee` has `designation: string; joiningDate: string`. Exports unchanged otherwise (`parseSalaryListParams`, `toSalarySearchParams`, `listSalaryDirectory`, `DEFAULT_SALARY_LIST_PARAMS`).

- [ ] **Step 1: Failing test** — add to `salary-directory-api.test.ts`:

```ts
it("accepts joiningDate as a sort field", () => {
  const params = parseSalaryListParams(new URLSearchParams("sortBy=joiningDate&sortOrder=desc"));
  expect(params.sortBy).toBe("joiningDate");
  expect(toSalarySearchParams(params).get("sortBy")).toBe("joiningDate");
});
```

- [ ] **Step 2: Run** `cd frontend && npx vitest run app/lib/salary-directory-api.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement** — in `salary-directory-api.ts` change the sort list and row type:

```ts
export const SALARY_SORT_FIELDS = ["name", "employeeCode", "department", "country", "joiningDate", "effectiveDate"] as const;
```
and in `SalaryDirectoryRow.employee` add `designation: string; joiningDate: string;`. Update any fixtures that construct rows (`components/salary/fixtures.ts`) with `designation: "Engineer", joiningDate: "2024-01-15"`.

- [ ] **Step 4: Run** `cd frontend && npm test && npm run typecheck` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/lib frontend/app/components/salary/fixtures.ts
git commit -m "feat(frontend): extend salary directory types with designation, joiningDate"
```

---

### Task 3: Theme and shared components

**Files:**
- Create: `frontend/app/theme.ts`, `components/common/ToastProvider.tsx`, `EmptyState.tsx`, `FormDialog.tsx`, `Money.tsx` (all under `frontend/app/`)
- Modify: `frontend/app/root.tsx`, `components/layout/PageHeader.tsx`, `components/common/StatusChip.tsx`
- Test: `components/common/ToastProvider.test.tsx`, `EmptyState.test.tsx`, `FormDialog.test.tsx`, `Money.test.tsx`, `components/layout/PageHeader.test.tsx`

**Interfaces:**
- Produces:
  - `theme` (default export of `~/theme`).
  - `ToastProvider({children})`, `useToast(): { success(text: string): void; error(text: string): void }`.
  - `EmptyState({ title: string; description?: string; action?: ReactNode })`.
  - `FormDialog({ open, title, onClose, onSubmit, submitLabel, submitting?, error?, maxWidth?, children })` — renders a `<form>`; submit button type="submit"; Esc/Cancel call `onClose` (disabled while `submitting`); `error` renders an `Alert` at top.
  - `Money({ amount: string; currency: string })` — renders `formatMoney` in a tabular-nums span.
  - `PageHeader({ title, subtitle?, breadcrumbs?: {label: string; to?: string}[], action? })`.

- [ ] **Step 1: Write failing tests**

`ToastProvider.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ToastProvider, useToast } from "./ToastProvider";

function Trigger() {
  const toast = useToast();
  return <button onClick={() => toast.success("Saved!")}>go</button>;
}

describe("ToastProvider", () => {
  it("shows a success message with status role", async () => {
    render(<ToastProvider><Trigger /></ToastProvider>);
    await userEvent.click(screen.getByText("go"));
    expect(await screen.findByRole("status")).toHaveTextContent("Saved!");
  });
});
```

`FormDialog.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import FormDialog from "./FormDialog";

describe("FormDialog", () => {
  it("submits, cancels, and shows an error", async () => {
    const onSubmit = vi.fn((e) => e.preventDefault());
    const onClose = vi.fn();
    render(
      <FormDialog open title="Add thing" submitLabel="Save" error="Boom" onSubmit={onSubmit} onClose={onClose}>
        <input aria-label="x" />
      </FormDialog>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Boom");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSubmit).toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("disables actions while submitting", () => {
    render(<FormDialog open title="T" submitLabel="Save" submitting onSubmit={vi.fn()} onClose={vi.fn()}><span /></FormDialog>);
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });
});
```

`EmptyState.test.tsx`, `Money.test.tsx`: render and assert title/description/action present; `Money` with `("1234.5","USD")` shows `$1,234.50`.

`PageHeader.test.tsx`: with `breadcrumbs=[{label:"Employees",to:"/employees"},{label:"Ada"}]` inside a memory router, expect a link "Employees" and plain text "Ada", and an `h1` with the title.

- [ ] **Step 2: Run** `cd frontend && npx vitest run app/components/common app/components/layout/PageHeader.test.tsx` — Expected: FAIL (modules missing).

- [ ] **Step 3: Implement**

`theme.ts`:
```ts
import { createTheme } from "@mui/material";

const ink = "#1f2937";
export default createTheme({
  palette: {
    mode: "light",
    primary: { main: "#2f5bea", dark: "#2447c0", light: "#e8eefe" },
    background: { default: "#f6f7f9", paper: "#ffffff" },
    text: { primary: ink, secondary: "#667085" },
    divider: "#e4e7ec",
    success: { main: "#127a4b", light: "#e6f4ec" },
    warning: { main: "#b25e09", light: "#fdf1e0" },
    error: { main: "#c0392b" },
  },
  shape: { borderRadius: 8 },
  typography: {
    fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
    h4: { fontSize: "1.5rem", fontWeight: 650 },
    h5: { fontSize: "1.25rem", fontWeight: 650 },
    h6: { fontSize: "1rem", fontWeight: 600 },
    subtitle2: { fontWeight: 600 },
    button: { textTransform: "none", fontWeight: 600 },
  },
  components: {
    MuiPaper: { defaultProps: { elevation: 0 }, styleOverrides: { root: { border: "1px solid #e4e7ec" } } },
    MuiButton: { defaultProps: { disableElevation: true } },
    MuiTableCell: {
      styleOverrides: {
        head: { fontWeight: 600, color: "#667085", backgroundColor: "#fafbfc", whiteSpace: "nowrap" },
        root: { borderColor: "#eef0f3" },
      },
    },
    MuiTextField: { defaultProps: { size: "small" } },
    MuiDialog: { styleOverrides: { paper: { borderRadius: 12 } } },
  },
});
```

`root.tsx`: replace the inline `createTheme` with `import theme from "./theme";` and wrap `<Outlet />` in `<ToastProvider>` inside `ThemeProvider`.

`ToastProvider.tsx`:
```tsx
import { Alert, Snackbar } from "@mui/material";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type Toast = { severity: "success" | "error"; text: string };
interface ToastApi { success(text: string): void; error(text: string): void }

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const success = useCallback((text: string) => setToast({ severity: "success", text }), []);
  const error = useCallback((text: string) => setToast({ severity: "error", text }), []);
  const api = useMemo(() => ({ success, error }), [success, error]);
  const close = () => setToast(null);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <Snackbar open={toast !== null} autoHideDuration={5000} onClose={close} anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
        {toast ? (
          <Alert severity={toast.severity} onClose={close} role={toast.severity === "error" ? "alert" : "status"} variant="filled">
            {toast.text}
          </Alert>
        ) : undefined}
      </Snackbar>
    </ToastContext.Provider>
  );
}
```

`FormDialog.tsx`:
```tsx
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle } from "@mui/material";
import type { FormEventHandler, ReactNode } from "react";

interface FormDialogProps {
  open: boolean;
  title: string;
  submitLabel: string;
  submitting?: boolean;
  error?: string | null;
  maxWidth?: "xs" | "sm" | "md";
  onClose: () => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  children: ReactNode;
}

export default function FormDialog({ open, title, submitLabel, submitting = false, error, maxWidth = "sm", onClose, onSubmit, children }: FormDialogProps) {
  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} fullWidth maxWidth={maxWidth} aria-labelledby="form-dialog-title">
      <form noValidate onSubmit={onSubmit}>
        <DialogTitle id="form-dialog-title">{title}</DialogTitle>
        <DialogContent dividers>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          {children}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={submitting}>{submitting ? "Saving…" : submitLabel}</Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
```

`EmptyState.tsx`:
```tsx
import { Box, Typography } from "@mui/material";
import type { ReactNode } from "react";

export default function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <Box sx={{ textAlign: "center", py: 8, px: 2 }}>
      <Typography variant="h6" gutterBottom>{title}</Typography>
      {description && <Typography color="text.secondary" sx={{ mb: action ? 2 : 0 }}>{description}</Typography>}
      {action}
    </Box>
  );
}
```

`Money.tsx`:
```tsx
import { formatMoney } from "~/lib/currencies";

export default function Money({ amount, currency }: { amount: string; currency: string }) {
  return <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatMoney(amount, currency)}</span>;
}
```

`PageHeader.tsx`:
```tsx
import { Box, Breadcrumbs, Link as MuiLink, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { Link } from "react-router";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  breadcrumbs?: { label: string; to?: string }[];
  action?: ReactNode;
}

export default function PageHeader({ title, subtitle, breadcrumbs, action }: PageHeaderProps) {
  return (
    <Box sx={{ mb: 3 }}>
      {breadcrumbs && (
        <Breadcrumbs aria-label="Breadcrumb" sx={{ mb: 1, fontSize: 14 }}>
          {breadcrumbs.map((crumb) =>
            crumb.to ? (
              <MuiLink key={crumb.label} component={Link} to={crumb.to} underline="hover" color="text.secondary">{crumb.label}</MuiLink>
            ) : (
              <Typography key={crumb.label} color="text.primary" fontSize="inherit">{crumb.label}</Typography>
            ),
          )}
        </Breadcrumbs>
      )}
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
        <Box>
          <Typography variant="h4" component="h1">{title}</Typography>
          {subtitle && <Typography color="text.secondary">{subtitle}</Typography>}
        </Box>
        {action}
      </Box>
    </Box>
  );
}
```

`StatusChip.tsx`: keep behavior; use `variant="outlined"` for both, `color="success"` for active, `"default"` for inactive (existing test must still pass; adjust only if it asserts the filled variant).

- [ ] **Step 4: Run** `cd frontend && npm test && npm run typecheck` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend
git commit -m "feat(frontend): add light theme and shared toast, dialog, empty state, money components"
```

---

### Task 4: App shell — sidebar, nav, user menu

**Files:**
- Modify: `frontend/app/components/layout/AppLayout.tsx`, `AppLayout.test.tsx`

**Interfaces:**
- Consumes: theme (Task 3).
- Produces: `AppLayout({ user? })` with nav links Dashboard, Employees, Analytics (in that order); user menu button labelled with the user name opens a menu with "Log out" (a `<form method="post" action="/logout">` submit button named "Logout" must remain reachable for the existing logout contract).

- [ ] **Step 1: Update tests** — in `AppLayout.test.tsx`: remove the two Salaries tests; replace the Analytics-order test with:

```tsx
it("shows exactly Dashboard, Employees, Analytics in order", () => {
  const router = createMemoryRouter([{ path: "/", Component: AppLayout, children: [{ index: true, Component: () => <div /> }] }]);
  render(<RouterProvider router={router} />);
  expect(screen.getAllByRole("link").map((l) => l.textContent)).toEqual(["Dashboard", "Employees", "Analytics"]);
});

it("highlights Analytics on /analytics", () => {
  const router = createMemoryRouter(
    [{ path: "/", Component: AppLayout, children: [{ path: "analytics", Component: () => <div>a</div> }] }],
    { initialEntries: ["/analytics?basis=net"] },
  );
  render(<RouterProvider router={router} />);
  expect(screen.getByRole("link", { name: "Analytics" })).toHaveClass("Mui-selected");
});
```
Update the user test: after `userEvent.click(screen.getByRole("button", { name: /Alice/ }))`, expect `screen.getByRole("button", { name: "Logout" })` to have `type="submit"`. Keep the brand text assertion `"Salary Management"`.

- [ ] **Step 2: Run** `npx vitest run app/components/layout/AppLayout.test.tsx` — Expected: FAIL.

- [ ] **Step 3: Implement** — rewrite `AppLayout.tsx`: a permanent 240px `Drawer` (white, right border `divider`, no AppBar). Top: brand "Salary Management" (h6). Middle: `List` of `ListItemButton component={Link}` with an MUI icon-free label (no icon dependency), `selected` computed as today; selected style `bgcolor: primary.light, color: primary.main`. Bottom (pinned with `mt: "auto"`): a `Button` showing `user.name` and role caption that toggles a `Menu`; the menu item contains `<Form method="post" action="/logout"><Button type="submit">Logout</Button></Form>`. Main area: `Box component="main"` with `bgcolor: background.default`, `minHeight: 100vh`, `p: 4`, content `maxWidth: 1200`. Nav items constant becomes:

```ts
const NAV_ITEMS = [
  { label: "Dashboard", to: "/dashboard" },
  { label: "Employees", to: "/employees" },
  { label: "Analytics", to: "/analytics" },
];
```

- [ ] **Step 4: Run** `cd frontend && npm test && npm run typecheck` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/components/layout
git commit -m "feat(frontend): light sidebar shell with three-item nav and user menu"
```

---

### Task 5: Employee form dialog

**Files:**
- Create: `frontend/app/components/employees/EmployeeFormDialog.tsx`, `EmployeeFormDialog.test.tsx`
- Modify (later deleted in Task 6): leave `EmployeeForm.tsx` untouched for now

**Interfaces:**
- Consumes: `FormDialog`, `employeeFormSchema`, `localToday`, `EmployeeFormValues`, `Department`, `FormError`.
- Produces:
```ts
interface EmployeeFormDialogProps {
  open: boolean;
  mode: "create" | "edit";
  departments: Department[];
  defaultValues?: Partial<EmployeeFormValues>;
  submitting: boolean;
  serverError?: FormError | null;
  onClose: () => void;
  onSubmit: (values: EmployeeFormValues) => void;
}
```

- [ ] **Step 1: Write failing tests** — port the cases from `EmployeeForm.test.tsx` (required-field errors, server field error on `email`, Employee ID disabled in edit mode) to the dialog: render with `open`, query by label ("First name", "Employee ID", ...), assert dialog title "Add employee"/"Edit employee", and:

```tsx
it("shows a duplicate-email server error on the email field and stays open", () => {
  render(<EmployeeFormDialog open mode="create" departments={[]} submitting={false}
    serverError={{ message: "Email already exists", field: "email" }} onClose={vi.fn()} onSubmit={vi.fn()} />);
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(screen.getByText("Email already exists")).toBeInTheDocument();
});

it("blocks submit and shows errors when fields are empty", async () => {
  const onSubmit = vi.fn();
  render(<EmployeeFormDialog open mode="create" departments={[]} submitting={false} onClose={vi.fn()} onSubmit={onSubmit} />);
  await userEvent.click(screen.getByRole("button", { name: "Add employee" }));
  expect(onSubmit).not.toHaveBeenCalled();
  expect(await screen.findAllByText(/required/i)).not.toHaveLength(0);
});
```

- [ ] **Step 2: Run** `npx vitest run app/components/employees/EmployeeFormDialog.test.tsx` — Expected: FAIL.

- [ ] **Step 3: Implement** — copy `EmployeeForm.tsx`'s `useForm` setup, `text`/`select` helpers and `serverError` effect into `EmployeeFormDialog.tsx`, but render:

```tsx
<FormDialog
  open={open}
  title={mode === "create" ? "Add employee" : "Edit employee"}
  submitLabel={mode === "create" ? "Add employee" : "Save changes"}
  submitting={submitting}
  error={serverError && !serverError.field ? serverError.message : null}
  onClose={onClose}
  onSubmit={handleSubmit(onSubmit)}
  maxWidth="sm"
>
  <Typography variant="subtitle2" sx={{ mb: 1.5 }}>Basic</Typography>
  <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, mb: 3 }}>
    {text("firstName", "First name")}
    {text("lastName", "Last name")}
    {text("email", "Work email", { type: "email" })}
    {text("phone", "Phone (optional)")}
  </Box>
  <Typography variant="subtitle2" sx={{ mb: 1.5 }}>Job</Typography>
  <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
    {text("employeeCode", "Employee ID", { disabled: mode === "edit", helperText: mode === "edit" ? "Cannot be changed" : errors.employeeCode?.message })}
    {select("departmentId", "Department", ...)}
    {text("designation", "Designation")}
    {select("country", "Country", ...)}
    {text("joiningDate", "Joining date", { type: "date", slotProps: { inputLabel: { shrink: true }, htmlInput: { max: localToday() } } })}
  </Box>
</FormDialog>
```
The field-level `serverError` (with `field`) is applied through `setError` as in the existing form, so the dialog stays open and the error appears under the field. Reset the form when the dialog reopens (`useEffect` on `open` calling `reset({ ...EMPTY, ...defaultValues })`).

- [ ] **Step 4: Run** `cd frontend && npm test && npm run typecheck` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/components/employees
git commit -m "feat(frontend): add employee form dialog"
```

---

### Task 6: Employees page (merged directory) with add dialog and redirects

**Files:**
- Create: `components/employees/EmployeeFilterBar.tsx`, `EmployeeDirectoryTable.tsx` + tests (all under `frontend/app/`)
- Modify: `routes/employees.tsx`, `routes/employees.test.tsx`, `routes.ts`, `routes.test.ts`
- Create: `routes/salaries-redirect.tsx` (loader-only), `routes/employee-new-redirect.tsx`, `routes/employee-edit-redirect.tsx`
- Delete: `routes/salaries.tsx`, `salaries.test.tsx`, `employee-new.tsx`, `employee-new.test.tsx`, `employee-edit.tsx`, `employee-edit.test.tsx`, `components/employees/EmployeeTable.tsx`(+test), `EmployeeFilters.tsx`(+test), `components/salary/SalaryDirectoryTable.tsx`(+test), `SalaryDirectoryFilters.tsx`(+test) — after moving any still-useful assertions into new tests.

**Interfaces:**
- Consumes: Task 2 data layer, Task 3 components, Task 5 dialog, existing `SalaryFormDialog`, `ConfirmDialog`.
- Produces:
  - `EmployeeFilterBar({ values: { q; status; departmentId; country; salary }, departments, onChange(patch: Partial<SalaryListParams>), onClear() })`.
  - `EmployeeDirectoryTable({ rows: SalaryDirectoryRow[]; sortBy; sortOrder; onSort(field: SalarySortField); onAction(action: "edit" | "salary" | "deactivate" | "reactivate", row: SalaryDirectoryRow) })`.
  - Route actions on `/employees`: `intent=create` (JSON body with employee values, returns `{ error: FormError }` or `{ message }`), `intent=status` (`employeeId`, `status`), `intent=update` (`employeeId` + JSON), `intent=salary` (`employeeId` + JSON salary payload). Use a single `action` that reads `request.json()` and a top-level `intent` property: `{ intent: "create" | "update" | "status" | "salary", ... }`.
  - Redirect routes return `redirect()` preserving the query string.

- [ ] **Step 1: Write failing tests**

`routes.test.ts`: replace the employee/salary route tests with:
```ts
it("registers employees, profile, analytics, and redirects for retired pages", async () => {
  const config = await routes;
  const layout = config.find((r) => r.file === `${AUTHENTICATED_ROUTE_ID}.tsx`);
  const paths = layout?.children?.map((c) => c.path);
  expect(paths).toEqual(expect.arrayContaining(["dashboard", "employees", "employees/:id", "analytics", "salaries", "employees/new", "employees/:id/edit"]));
  expect(layout?.children?.find((c) => c.path === "salaries")?.file).toBe("routes/salaries-redirect.tsx");
});
```
A redirect-loader test (`routes/redirects.test.ts`):
```ts
import { loader as salaries } from "./salaries-redirect";
import { loader as newEmp } from "./employee-new-redirect";
import { loader as edit } from "./employee-edit-redirect";

const res = (r: unknown) => r as Response;
it("keeps the query string when redirecting /salaries", () => {
  const r = res(salaries({ request: new Request("http://x/salaries?status=ALL&salary=without") } as never));
  expect(r.headers.get("Location")).toBe("/employees?status=ALL&salary=without");
});
it("opens the add dialog", () => {
  expect(res(newEmp()).headers.get("Location")).toBe("/employees?add=1");
});
it("opens the edit dialog on the profile", () => {
  expect(res(edit({ params: { id: "e1" } } as never)).headers.get("Location")).toBe("/employees/e1?edit=1");
});
```
`employees.test.tsx` (rewrite using a memory router with a stubbed loader like the existing tests): cases —
1. renders rows with name, email, designation, `USD 120,000`-style salary, "No salary" chip for null `current`, "Revision scheduled" for `hasScheduled`;
2. default shows status "Active" selected;
3. typing in search updates the URL `q`;
4. `?add=1` opens the "Add employee" dialog and Cancel removes `add` while keeping `q`;
5. empty with filters shows "No employees match your filters" and a "Clear filters" button; empty without filters shows "No employees yet" and an "Add employee" button;
6. the kebab menu for an INACTIVE row has no "Set salary"/"Revise salary" item, and shows "Reactivate".

- [ ] **Step 2: Run** `cd frontend && npm test` — Expected: FAIL.

- [ ] **Step 3: Implement**

`routes.ts` inside the authenticated layout:
```ts
route("dashboard", "routes/dashboard.tsx"),
route("employees", "routes/employees.tsx"),
route("employees/new", "routes/employee-new-redirect.tsx"),
route("employees/:id", "routes/employee-profile.tsx"),
route("employees/:id/edit", "routes/employee-edit-redirect.tsx"),
route("salaries", "routes/salaries-redirect.tsx"),
route("analytics", "routes/analytics.tsx"),
```
Redirect files:
```ts
// salaries-redirect.tsx
import { redirect } from "react-router";
export function loader({ request }: { request: Request }) {
  return redirect(`/employees${new URL(request.url).search}`);
}
export default function SalariesRedirect() { return null; }
```
```ts
// employee-new-redirect.tsx
import { redirect } from "react-router";
export function loader() { return redirect("/employees?add=1"); }
export default function EmployeeNewRedirect() { return null; }
```
```ts
// employee-edit-redirect.tsx
import { redirect } from "react-router";
export function loader({ params }: { params: { id: string } }) { return redirect(`/employees/${params.id}?edit=1`); }
export default function EmployeeEditRedirect() { return null; }
```

`routes/employees.tsx`: start from the current Salaries route (same loader/redirect-to-last-page logic using `parseSalaryListParams`, `listSalaryDirectory`, `listDepartments`, base path `/employees`). Changes:
- `PageHeader title="Employees" subtitle="{pagination.total} people"`, action `Button` "Add employee" that sets `add=1` in the URL (`setSearchParams(p => { p.set("add","1"); return p; })`).
- `EmployeeFilterBar` above the table; `EmployeeDirectoryTable` inside a `Paper`; keep `TablePagination` and loading `LinearProgress` + reduced opacity.
- `action({ request })`: read `await request.json()`; switch on `intent`:
  - `create` → `createEmployee(request, values)`; on failure `{ error: toFormError(result) }`; on success `{ message: "Employee added", createdId: result.data.employee.id }`.
  - `update` → `updateEmployee(request, employeeId, valuesWithoutCode)`; same shape; message "Employee updated".
  - `status` → `setEmployeeStatus`; message "Employee deactivated"/"Employee activated".
  - `salary` → `createSalary(request, employeeId, toPayload(values))`; failure `{ error: message, ...toSalaryFormError(result) }`; success `{ message: "Salary saved" }`.
- Component: one `useFetcher<typeof action>()`. A local `dialog` state `{ kind: "edit" | "salary" | "deactivate"; row } | null` plus `?add=1` for the add dialog. After `fetcher.data` arrives: `message` → `toast.success`, close dialog, drop `add` param; `error` with `field` → pass to the dialog as `serverError`; other errors → dialog `error`/`toast.error` for status changes. For "salary", fetch the employee's salary overview lazily is NOT needed: pass `current` as `null` for initial and for revise build a minimal `Salary`-like from the row only if `SalaryFormDialog` requires it; if it needs full history, navigate to `/employees/:id?salary=revise` instead (see Task 7, which handles `?salary=initial|revise`). **Decision:** to keep one code path for salary editing, the list's "Set salary"/"Revise salary" menu items link to `/employees/:id?salary=initial|revise`; the profile opens the dialog. Remove the `intent=salary` branch from the list action accordingly.
- Empty states via `EmptyState` (two variants as in the test).

`EmployeeFilterBar.tsx`: a row with a search `TextField` (debounced 300ms like the current `EmployeeFilters.tsx` — copy its debounce logic), a `ToggleButtonGroup` (exclusive; Active / Inactive / All → values `ACTIVE`/`INACTIVE`/`ALL`), a "Filters" `Button` with `Badge` of active count (department, country, salary) opening a `Popover` containing Department select, Country select, Salary select (Any `""` / Has salary `with` / No salary `without`), and a "Clear" text button shown when any filter or search is active.

`EmployeeDirectoryTable.tsx`: columns per spec; sortable headers (`TableSortLabel`) for name, department, country, joiningDate; salary column header is not sortable. Name cell: `MuiLink component={Link} to={/employees/${id}}` plus caption `email · employeeCode`. Salary cell: `current ? <Money amount={current.gross} currency={current.currency}/> : <Chip size="small" label="No salary" variant="outlined"/>`, plus `hasScheduled && <Chip size="small" color="warning" label="Revision scheduled"/>`. Last cell `IconButton aria-label="Actions for {name}"` opening a `Menu` with items: "View" (Link), "Edit" (`onAction("edit")`), and if `status==="ACTIVE"`: "Set salary" (when `current===null`) or "Revise salary" (Link to `?salary=...`), then "Deactivate"; if INACTIVE: "Reactivate". Row `onClick` navigates to the profile, but clicks inside the menu cell must `stopPropagation`.

Deviation from spec (to be confirmed by the user): the list's kebab Edit and Set/Revise salary items link to the profile with `?edit=1` / `?salary=...`, which opens the dialog there. This avoids loading full employee and salary history for every row. Add employee and Deactivate/Reactivate stay in place on the list.

- [ ] **Step 4: Run** `cd frontend && npm test && npm run typecheck` — Expected: PASS. Delete the retired files listed above before this step and make sure nothing imports them (`grep -rn "EmployeeTable\|EmployeeFilters\|SalaryDirectory" frontend/app` returns only the new `salary-directory-api` lib).

- [ ] **Step 5: Commit**

```bash
git add -A frontend
git commit -m "feat(frontend): merge salaries into employees directory with add dialog and redirects"
```

---

### Task 7: Employee profile — tabs, edit and salary dialogs from the URL

**Files:**
- Modify: `routes/employee-profile.tsx`, `employee-profile.test.tsx`, `components/salary/CompensationSection.tsx` (+test), `components/salary/SalaryFormDialog.tsx` (+test)

**Interfaces:**
- Consumes: Tasks 3-5 and the list's links `?edit=1`, `?salary=initial|revise`.
- Produces: profile route action accepts JSON `{ intent: "update" | "salary" | "status", ... }` (salary keeps today's JSON payload under `intent: "salary"`; status keeps form data or moves to JSON — use JSON for all and update tests).

- [ ] **Step 1: Failing tests** — extend `employee-profile.test.tsx`:
1. header shows breadcrumb "Employees" link and the name as plain text, initials avatar, status chip, "designation · department · country";
2. Tabs "Overview" and "Compensation" exist; Overview is selected by default and shows Email/Phone/Joining date; clicking Compensation shows the current salary card;
3. `?edit=1` opens the "Edit employee" dialog with Employee ID disabled; Cancel removes `edit` from the URL;
4. `?salary=revise` opens the salary dialog in revise mode; `?salary=initial` in initial mode;
5. for an INACTIVE employee, "Set salary"/"Revise salary" buttons are absent and `?salary=revise` does not open the dialog;
6. Deactivate opens a confirm; Reactivate does not;
7. successful update shows toast "Employee updated" and closes the dialog.

- [ ] **Step 2: Run** `npx vitest run app/routes/employee-profile.test.tsx` — Expected: FAIL.

- [ ] **Step 3: Implement**
- Replace the local `Snackbar` state with `useToast()`; drop the `notice` search-param effect (creation now happens on the list).
- Header: `PageHeader` with `breadcrumbs=[{label:"Employees",to:"/employees"},{label:fullName}]`, title `fullName`, subtitle `"{designation} · {department.name} · {countryName}"`, actions: Edit (sets `edit=1`), Set/Revise salary (hidden when inactive), and an `IconButton` "More actions" menu with Deactivate/Reactivate. Put a `StatusChip` next to the title via a small flex wrapper above the header or in the subtitle line.
- Tabs: `Tabs value={tab}` with `Tab` Overview/Compensation, tab state in local `useState` (not URL). Overview: two `Paper` cards, "Contact" (Email, Phone) and "Employment" (Employee ID, Department, Designation, Country, Joining date) using the existing `Detail` helper. Compensation: existing `CompensationSection`, restyled (Paper with outlined cards; history rendered as a table or simple list ordered newest first; scheduled-change `Alert severity="info"`).
- URL-driven dialogs: derive `editOpen = searchParams.get("edit") === "1"` and `salaryMode = searchParams.get("salary")` (`"initial" | "revise"`). Opening/closing mutates the params with `replace: true`. When `salaryMode` is set and the employee is `ACTIVE`, call the existing `openSalaryDialog(mode)` logic once (guard with an effect + ref so it doesn't re-open after close), then clear the param. Inactive employees: ignore the param.
- Edit dialog: `EmployeeFormDialog mode="edit"` with `defaultValues` from the employee, submit via `fetcher.submit({ intent: "update", ...values }, { method: "post", encType: "application/json" })`. The action strips `employeeCode` before `updateEmployee`.
- `SalaryFormDialog`: restyle using `FormDialog`'s title/actions pattern (it already is a dialog; keep logic). Group fields under subheadings "Amount" and "When and why"; keep the live Gross/Deductions/Net summary and the currency-change note. Keep all existing tests green.
- Action: parse JSON once; `switch (intent)`; keep today's messages: "Salary saved", "Employee updated", "Employee activated", "Employee deactivated".

- [ ] **Step 4: Run** `cd frontend && npm test && npm run typecheck` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A frontend
git commit -m "feat(frontend): redesign employee profile with tabs and URL-driven dialogs"
```

---

### Task 8: Dashboard — attention-first

**Files:**
- Modify: `routes/dashboard.tsx`, `dashboard.test.tsx`, `components/analytics/MetricCard.tsx`, `RecentActivity.tsx` (+tests)

**Interfaces:**
- Consumes: `getDashboard` response (`metrics.activeEmployees`, `departmentCount`, `countryCount`, `withoutSalary`, `recentEmployees`, `recentRevisions`). No API change.

- [ ] **Step 1: Failing tests** — rewrite `dashboard.test.tsx` expectations:
1. four tiles: "Active employees", "Departments", "Countries", "Without salary" with their values; no "Total employees" tile;
2. when `withoutSalary > 0` an "Attention" card shows "{n} employees have no salary" as a link to `/employees?salary=without`; when `0` it shows "Nothing needs your attention";
3. no "Salary overview", "By department" or "By country" headings;
4. "Recent hires" and "Recent salary changes" sections render; links to employees remain;
5. no "Signed in as" paragraph.

- [ ] **Step 2: Run** `npx vitest run app/routes/dashboard.test.tsx` — Expected: FAIL.

- [ ] **Step 3: Implement** — remove the salary overview, department and country blocks, the "Signed in as" paragraph and the "Open salary analytics" button (Analytics is in the nav). Keep `useRouteLoaderData` only if still needed (remove it and its import/throw if unused). Layout: `PageHeader title="Dashboard" subtitle="As of {asOf}"`; tiles in a 4-column grid; below, a two-column grid with the Attention card (left) and `RecentActivity` (right, restyled into two stacked lists inside Paper). Attention row:

```tsx
{metrics.withoutSalary > 0 ? (
  <MuiLink component={Link} to="/employees?salary=without">
    {metrics.withoutSalary} {metrics.withoutSalary === 1 ? "employee has" : "employees have"} no salary
  </MuiLink>
) : (
  <Typography color="text.secondary">Nothing needs your attention.</Typography>
)}
```
Note: the list's default status is Active, so `?salary=without` shows active employees without salary, matching the metric.

- [ ] **Step 4: Run** `cd frontend && npm test && npm run typecheck` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A frontend
git commit -m "feat(frontend): focus dashboard on attention items and recent activity"
```

---

### Task 9: Analytics, login and error pages restyle

**Files:**
- Modify: `routes/analytics.tsx`, `components/analytics/AnalyticsFilters.tsx`, `ChartCard.tsx`, `MetricCard.tsx`, `routes/login.tsx`, `root.tsx` (ErrorBoundary), and their tests only where markup assertions break.

- [ ] **Step 1: Check current behavior** — run `cd frontend && npx vitest run app/routes/analytics.test.tsx app/routes/login.test.tsx` — Expected: PASS (baseline).

- [ ] **Step 2: Implement (no behavior change)**
- Analytics: `PageHeader title="Analytics" subtitle="Company-wide compensation, per currency"` (update the heading text in `analytics.test.tsx` from "Salary analytics" to "Analytics" in both the happy path and error boundary). Put `AnalyticsFilters` in a single `Paper` bar at the top (`display:flex; flexWrap:wrap; gap:2; p:2`). `ChartCard`: `Paper` with `p:3`, title `h6`, subtitle `body2 text.secondary`. Chart colors: use `theme.palette.primary.main` for the first series and neutral grays for secondary series.
- Login: centered `Paper` card (`maxWidth: 400`) on `background.default` with the "Salary Management" brand heading, labelled Email/Password fields, a full-width primary "Sign in" button, and an inline `Alert` for errors. Keep field labels, names and the existing action untouched so `login.test.tsx` and `login.action.test.ts` still pass.
- `root.tsx` `ErrorBoundary`: replace the bare `<main>` with a centered `EmptyState`-style block: title ("Page not found" for 404, otherwise "Something went wrong"), description, and a "Go to dashboard" `Button component={Link} to="/dashboard"`; keep the DEV stack `<pre>`.

- [ ] **Step 3: Run** `cd frontend && npm test && npm run typecheck` — Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A frontend
git commit -m "feat(frontend): restyle analytics, login and error pages"
```

---

### Task 10: Docs, full verification, manual walkthrough

**Files:**
- Modify: `docs/04-implementation-status.md`, `docs/02-tech-stack-and-architecture.md` and `docs/03-modules-and-use-cases.md` (only where they describe the Salaries page, create/edit pages or dashboard contents), `README.md`/`frontend/README.md` if they list pages
- Create: `docs/implementation/2026-10-04-ui-ux-redesign-summary.md`

- [ ] **Step 1: Full checks**

Run: `cd backend && npm test` and `cd frontend && npm test && npm run typecheck && npm run build`
Expected: all PASS, build succeeds.

- [ ] **Step 2: Manual walkthrough** — start the stack per `README.md`, then in a browser verify: login; sidebar has 3 items; Employees list (search, status toggle, filters popover, sort, pagination, empty states); Add employee dialog (validation, duplicate email/ID server errors, success toast); row menu actions; profile tabs; edit dialog; set/revise salary; deactivate/reactivate; `/salaries?status=ALL`, `/employees/new`, `/employees/:id/edit` redirects; dashboard attention link; analytics; logout. Fix defects found, adding a test for each.

- [ ] **Step 3: Write docs** — the implementation summary must follow `CLAUDE.md`: key changes, decisions (merge of Salaries into Employees, dialogs, URL-driven dialogs, additive API change), APIs changed, tests, known limitations (Employee ID still typed, no mobile/dark mode, no amount sort), the original task prompt, what was completed, and what to do next. Update the status table (Salary directory row now notes it is folded into Employees; add a "UI/UX redesign" row) and set "Last updated".

- [ ] **Step 4: Commit**

```bash
git add docs README.md frontend/README.md
git commit -m "docs: document UI/UX redesign"
```

- [ ] **Step 5: Open PR** (ask the user before pushing): push `feature/ui-ux-redesign` and open a PR against `main`; do not merge without approval.
