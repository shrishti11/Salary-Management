# Requirements one-pager

**Product:** Salary management for ACME's HR team. **User:** the HR Manager. **Scale:** 10,000 employees across about 20 countries.

## Goal
Replace the spreadsheets. The HR manager can find any employee, see and change what they earn, keep a history of every change, and answer "how do we pay people?" in a few clicks.

## Scope (what is built)
| Area | What the HR manager can do |
|---|---|
| Employees | Add, edit, deactivate and reactivate. Search by name, email or ID. Filter by status, department, country and salary presence. Sort, page, and export the filtered list to CSV. Employee IDs are generated (`EMP-00001`). |
| Salary | Per employee: base plus allowances, bonuses and deductions, in any of 20 currencies, with an effective date and a reason. Changes are appended, never overwritten, so history is complete. Future-dated revisions are supported. |
| Dashboard | Headcount, departments, countries, employees without a salary (linked to the filtered list), recent hires and salary changes. |
| Analytics | Pay distribution, comparison by department, country or role, and trends over time, always per currency. |
| Access | Login, httpOnly session cookie, roles (ADMIN, HR_MANAGER) enforced on the backend. |
| Demo | One click on the dashboard loads 10,000 employees with salary history. |

## Deliberately left out, and why
- **Payroll, tax and statutory calculations.** Country rules change constantly and are a product of their own. We store gross, deductions and net as entered.
- **Currency conversion.** Rates move and need a source of truth. Totals are shown per currency so no number is misleading.
- **Approval workflows and self-service.** The user is one HR manager; workflows add process nobody asked for.
- **CSV import and audit log.** Valuable, but not needed to answer the core question. Salary records already keep who and why. Planned next.
- **Mobile layout and dark mode.** HR works on a desktop. Desktop and tablet only.
- **Sorting by salary amount.** Amounts in different currencies cannot be ordered honestly without conversion.

## Success looks like
An HR manager can find a person, record a raise, see the history, and explain pay by department or country, with 10,000 rows, without waiting. Key pages answer in well under half a second at 10,000 employees (see [trade-offs and performance](05-tradeoffs-and-performance.md)).
