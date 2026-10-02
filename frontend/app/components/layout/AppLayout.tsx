import { AppBar, Box, Button, Drawer, List, ListItemButton, ListItemText, Toolbar, Typography } from "@mui/material";
import { Form, Link, Outlet } from "react-router";

const DRAWER_WIDTH = 220;

const NAV_ITEMS = [
  { label: "Dashboard", to: "/dashboard" },
  { label: "Employees", to: "/employees" },
  { label: "Salaries", to: "/salaries" },
  { label: "Analytics", to: "/analytics" },
];

interface AppLayoutProps {
  user?: { name: string; role: string };
}

export default function AppLayout({ user }: AppLayoutProps = {}) {
  return (
    <Box sx={{ display: "flex" }}>
      <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <Toolbar>
          <Typography variant="h6" noWrap component="div">
            Salary Management
          </Typography>
          {user && (
            <>
              <Box sx={{ flexGrow: 1 }} />
              <Typography variant="body2" sx={{ mr: 2 }}>
                {user.name} ({user.role})
              </Typography>
              <Form method="post" action="/logout">
                <Button type="submit" color="inherit">
                  Logout
                </Button>
              </Form>
            </>
          )}
        </Toolbar>
      </AppBar>
      <Drawer
        variant="permanent"
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          [`& .MuiDrawer-paper`]: { width: DRAWER_WIDTH, boxSizing: "border-box" },
        }}
      >
        <Toolbar />
        <List>
          {NAV_ITEMS.map((item) => (
            <ListItemButton key={item.to} component={Link} to={item.to}>
              <ListItemText primary={item.label} />
            </ListItemButton>
          ))}
        </List>
      </Drawer>
      <Box component="main" sx={{ flexGrow: 1, p: 3 }}>
        <Toolbar />
        <Outlet />
      </Box>
    </Box>
  );
}
