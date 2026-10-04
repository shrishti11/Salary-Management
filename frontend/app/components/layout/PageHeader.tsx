import { Box, Breadcrumbs, Link as MuiLink, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { Link } from "react-router";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  breadcrumbs?: { label: string; to?: string }[];
  action?: ReactNode;
  /** Rendered before the title block, e.g. an avatar. */
  leading?: ReactNode;
  /** Rendered inline after the title, e.g. a status chip. */
  titleAdornment?: ReactNode;
}

export default function PageHeader({ title, subtitle, breadcrumbs, action, leading, titleAdornment }: PageHeaderProps) {
  return (
    <Box sx={{ mb: 3 }}>
      {breadcrumbs && (
        <Breadcrumbs aria-label="Breadcrumb" sx={{ mb: 1, fontSize: 14 }}>
          {breadcrumbs.map((crumb) =>
            crumb.to ? (
              <MuiLink key={crumb.label} component={Link} to={crumb.to} underline="hover" color="text.secondary">{crumb.label}</MuiLink>
            ) : (
              <Typography key={crumb.label} color="text.primary" sx={{ fontSize: "inherit" }}>{crumb.label}</Typography>
            ),
          )}
        </Breadcrumbs>
      )}
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2, minWidth: 0 }}>
          {leading}
          <Box sx={{ minWidth: 0 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
              <Typography variant="h4" component="h1">{title}</Typography>
              {titleAdornment}
            </Box>
            {subtitle && <Typography color="text.secondary">{subtitle}</Typography>}
          </Box>
        </Box>
        {action}
      </Box>
    </Box>
  );
}
