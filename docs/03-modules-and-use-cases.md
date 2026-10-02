# Modules and Use Cases

## 1. Overview

The Employee Salary Management System is divided into functional modules. Each module is responsible for a specific part of the product and exposes functionality through the backend API and frontend interface.

The initial implementation focuses on the HR Manager's primary workflows:

1. Managing employees.
2. Managing employee compensation.
3. Viewing salary history.
4. Understanding compensation through dashboards and analytics.
5. Importing and exporting data.
6. Managing access and reviewing important changes.

## 2. Employee Management

### Purpose

Provide a centralized directory for managing employee information across the organization.

### Use Cases

#### UC-EMP-01: View Employees

**Actor:** HR Manager

**Description:** View the organization's employee directory.

**Sub-features:**
- Display employees in a paginated table.
- Show employee ID, name, department, designation, country and status.
- Sort employees by supported fields.
- Filter employees by department, country and employment status.
- Navigate between pages.

#### UC-EMP-02: Search Employees

**Actor:** HR Manager

**Description:** Find an employee using identifying information.

**Sub-features:**
- Search by employee ID.
- Search by employee name.
- Search by email.
- Combine search with supported filters.

#### UC-EMP-03: Add Employee

**Actor:** HR Manager

**Description:** Create a new employee record.

**Sub-features:**
- Enter employee ID and basic information.
- Enter department, designation and country.
- Enter joining date and employment status.
- Validate required fields.
- Prevent duplicate employee IDs and email addresses.
- Save the employee record.

#### UC-EMP-04: View Employee Profile

**Actor:** HR Manager

**Description:** View detailed information about an employee.

**Sub-features:**
- View employee information.
- View department and employment details.
- View current compensation.
- View salary revision history.
- View relevant changes recorded in the audit history.

#### UC-EMP-05: Update Employee

**Actor:** HR Manager

**Description:** Update an employee's information.

**Sub-features:**
- Edit employee details.
- Update department and designation.
- Update country and other supported employment information.
- Validate changes.
- Save the updated record.

#### UC-EMP-06: Change Employment Status

**Actor:** HR Manager

**Description:** Mark an employee as active or inactive.

**Sub-features:**
- View the current employment status.
- Change the status.
- Preserve employee and salary history.
- Exclude inactive employees from relevant active employee metrics.

## 3. Salary Management

### Purpose

Provide a structured way to create, update and review employee compensation records.

### Use Cases

#### UC-SAL-01: View Current Salary

**Actor:** HR Manager

**Description:** View the current compensation details of an employee.

**Sub-features:**
- View the current salary record.
- View salary components.
- View currency.
- View effective date.
- View the most recent salary revision.

#### UC-SAL-02: Create Initial Salary Record

**Actor:** HR Manager

**Description:** Add compensation details for an employee.

**Sub-features:**
- Select the employee.
- Enter the salary amount and currency.
- Add applicable salary components.
- Specify the effective date.
- Validate the salary information.
- Save the salary record.

#### UC-SAL-03: Revise Salary

**Actor:** HR Manager

**Description:** Record a change in an employee's compensation.

**Sub-features:**
- Select an employee.
- View the current salary.
- Enter revised salary details.
- Specify the effective date.
- Enter the reason for revision.
- Validate the revision.
- Save the new salary record without deleting previous records.
- Record the change in the audit history.

#### UC-SAL-04: View Salary History

**Actor:** HR Manager

**Description:** Review previous compensation records.

**Sub-features:**
- View all historical salary records.
- Display salary amount and currency.
- Display effective dates.
- Display revision reasons.
- Compare current and previous salary records.

#### UC-SAL-05: View Salary Components

**Actor:** HR Manager

**Description:** Review the components that make up an employee's compensation.

**Sub-features:**
- View basic salary.
- View applicable allowances.
- View bonuses.
- View deductions.
- View gross compensation and applicable calculated totals.

The initial system manages compensation records. It does not perform payroll processing or country-specific tax calculations.

## 4. Dashboard

### Purpose

Provide a summary of the organization's workforce and compensation information.

### Use Cases

#### UC-DASH-01: View Organization Overview

**Actor:** HR Manager

**Description:** View key workforce and salary metrics.

**Sub-features:**
- Total employee count.
- Active employee count.
- Total salary expenditure.
- Average salary.
- Median salary.
- Department count and country count where applicable.

#### UC-DASH-02: View Department Summary

**Actor:** HR Manager

**Description:** Understand workforce and compensation distribution across departments.

**Sub-features:**
- Employee count by department.
- Salary expenditure by department.
- Average salary by department.
- Compare department-level summaries.

#### UC-DASH-03: View Country Summary

**Actor:** HR Manager

**Description:** Understand workforce and compensation distribution across countries.

**Sub-features:**
- Employee count by country.
- Salary expenditure by country in the original currency.
- Average salary by country.
- Optional conversion into a common reporting currency when exchange-rate data is configured.

#### UC-DASH-04: View Recent Changes

**Actor:** HR Manager

**Description:** View recent employee and salary updates.

**Sub-features:**
- Recent salary revisions.
- Recently updated employee records.
- Change date and acting user where authorized.

## 5. Salary Analytics

### Purpose

Enable HR to explore how compensation is distributed throughout the organization.

### Use Cases

#### UC-ANA-01: Analyze Salary Distribution

**Actor:** HR Manager

**Description:** Understand how salaries are distributed across employees.

**Sub-features:**
- View salary ranges and employee counts.
- View salary distribution by department.
- View salary distribution by job title or level.
- Filter by country and department.

#### UC-ANA-02: Compare Salaries

**Actor:** HR Manager

**Description:** Compare compensation across organizational groups.

**Sub-features:**
- Compare average salaries across departments.
- Compare salaries across job roles.
- Compare salaries across countries.
- Compare compensation across selected periods where historical data is available.

#### UC-ANA-03: Analyze Salary Changes

**Actor:** HR Manager

**Description:** Understand how compensation changes over time.

**Sub-features:**
- View salary revisions during a selected period.
- Calculate salary changes between selected records.
- Summarize salary revision counts.
- Analyze changes by department and country.

#### UC-ANA-04: Filter Analytics

**Actor:** HR Manager

**Description:** Narrow analytics to a specific organizational group or period.

**Sub-features:**
- Filter by department.
- Filter by country.
- Filter by job title or level.
- Select a date range.
- Reset filters.

Analytics should respect currency differences and clearly identify the currency used in every monetary result.

## 6. Import and Export

### Purpose

Make it easier to migrate existing spreadsheet data into the application and extract information when needed.

### Use Cases

#### UC-IMP-01: Import Employees

**Actor:** HR Manager

**Description:** Upload employee data from a CSV file.

**Sub-features:**
- Upload a CSV file.
- Validate file format and required columns.
- Validate individual employee records.
- Identify duplicate employee IDs and email addresses.
- Preview valid and invalid records.
- Import valid records.
- Display an import summary and row-level errors.

#### UC-IMP-02: Import Salary Records

**Actor:** HR Manager

**Description:** Upload salary information from a CSV file.

**Sub-features:**
- Upload salary CSV.
- Validate employee references.
- Validate salary amounts, currencies and effective dates.
- Identify invalid or duplicate records.
- Preview data before import.
- Save valid records.
- Display an import summary.

#### UC-EXP-01: Export Employees

**Actor:** HR Manager

**Description:** Download employee data as a CSV file.

**Sub-features:**
- Export employee records.
- Export filtered employee records.
- Include relevant employee fields.
- Download the generated file.

#### UC-EXP-02: Export Salary Records

**Actor:** HR Manager

**Description:** Download salary information as a CSV file.

**Sub-features:**
- Export salary records.
- Filter by department, country or period.
- Include relevant salary fields and currencies.
- Download the generated file.

## 7. Authentication and Authorization

### Purpose

Ensure that only authorized users can access and modify employee and salary information.

### Use Cases

#### UC-AUTH-01: Login

**Actor:** HR Manager / Administrator

**Description:** Authenticate a registered user.

**Sub-features:**
- Enter login credentials.
- Validate credentials.
- Establish an authenticated session.
- Redirect to the dashboard.
- Display appropriate errors for invalid credentials.

#### UC-AUTH-02: Logout

**Actor:** Authenticated User

**Description:** End the user's authenticated session.

**Sub-features:**
- Invalidate the session.
- Clear authentication cookies.
- Redirect to the login page.

#### UC-AUTH-03: Manage Access

**Actor:** Administrator

**Description:** Manage application access and permissions.

**Sub-features:**
- View application users.
- Create or deactivate application users.
- Assign supported roles.
- Restrict protected actions based on permissions.

The initial role model should remain simple, with only the roles required by the product.

## 8. Audit History

### Purpose

Maintain a record of important operations, especially changes to sensitive salary information.

### Use Cases

#### UC-AUD-01: Record Salary Changes

**Actor:** System

**Description:** Automatically record important salary modifications.

**Sub-features:**
- Record the affected employee.
- Record the user who made the change.
- Record the operation and timestamp.
- Record relevant previous and updated values.
- Associate the change with the corresponding salary record.

#### UC-AUD-02: View Audit History

**Actor:** HR Manager / Administrator with permission

**Description:** Review historical system operations.

**Sub-features:**
- View audit records.
- Filter by employee.
- Filter by acting user.
- Filter by action type.
- Filter by date range.
- View change details based on access permissions.

Audit records should not be silently modified or deleted through normal application workflows.

## 9. Module Dependencies

| Module | Depends on |
|---|---|
| Employee Management | Database, Authentication |
| Salary Management | Employee Management, Database, Authentication, Audit |
| Dashboard | Employee Management, Salary Management |
| Salary Analytics | Employee Management, Salary Management |
| Import | Employee Management, Salary Management, Database |
| Export | Employee Management, Salary Management |
| Authentication | User and Role records |
| Audit History | Authentication, Database |

These are logical dependencies. Modules remain part of the same backend application and may share common infrastructure such as Prisma, validation and error handling.

## 10. Implementation Priority

> Current progress per module: see [04-implementation-status.md](04-implementation-status.md).

### Phase 1: Core Employee and Salary Management

- Employee directory.
- Employee profiles.
- Employee creation and updates.
- Salary records.
- Salary revisions.
- Salary history.

### Phase 2: Dashboard and Analytics

- Organization overview.
- Department-wise summaries.
- Country-wise summaries.
- Salary distribution.
- Salary comparisons and trends.

### Phase 3: Data Operations

- Employee CSV import.
- Salary CSV import.
- Import validation and error reporting.
- Employee and salary CSV export.

### Phase 4: Security and Audit

- Authentication.
- Role-based authorization.
- Salary access restrictions.
- Salary audit history.
- Important employee change tracking.

### Phase 5: Quality and Delivery

- Complete seed data for 10,000 employees.
- Core unit and integration tests.
- Frontend testing.
- Performance checks for employee listing and analytics.
- Deployment.
- Application documentation and demonstration.

## 11. General Use Case Rules

- All employee and salary operations must validate the relevant input.
- Employee IDs must be unique.
- Salary records must reference an existing employee.
- Salary revisions must preserve historical information.
- Sensitive operations must require appropriate permissions.
- Salary revisions and their audit records must be saved consistently.
- Inactive employees must retain their historical records.
- Analytics must respect currency and date filters.
- CSV imports must report validation failures clearly.
- All paginated list APIs must use consistent pagination conventions.