import { Link as MuiLink, Paper, Typography } from "@mui/material";
import { Link } from "react-router";

const PAGES: { to?: string; name: string; gist: string }[] = [
  { to: "/dashboard", name: "Dashboard", gist: "What needs attention today: headcount, employees without a salary, recent hires and salary changes." },
  { to: "/employees", name: "Employees", gist: "Everyone and what they earn now. Search, filter, sort, export to CSV, add people and set or revise salaries." },
  { name: "Employee profile", gist: "One person: contact and job details, current compensation, and the full salary history. Open it from the list." },
  { to: "/analytics", name: "Analytics", gist: "How pay is distributed company-wide, by department, country or role, over time." },
];

export default function AboutCard() {
  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
      <Typography variant="subtitle1" component="h2" sx={{ mb: 1 }}>
        About this app
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Salary management for HR: one place for employee records, salary history and pay insights.
      </Typography>
      <Typography component="ul" variant="body2" sx={{ m: 0, pl: 2.5, display: "grid", gap: 0.75 }}>
        {PAGES.map((page) => (
          <li key={page.name}>
            {page.to ? (
              <MuiLink component={Link} to={page.to} underline="hover" sx={{ fontWeight: 600 }}>
                {page.name}
              </MuiLink>
            ) : (
              <strong>{page.name}</strong>
            )}
            {": "}
            {page.gist}
          </li>
        ))}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1.5 }}>
        Good to know: salary changes are added as new records, so history is never overwritten. Amounts are shown per currency
        and never converted. People are deactivated, not deleted. Employee IDs are generated automatically.
      </Typography>
    </Paper>
  );
}
