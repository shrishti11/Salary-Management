import { Box, Button, Drawer, List, ListItemButton, ListItemText, Menu, MenuItem, Typography } from "@mui/material";
import { useId, useState } from "react";
import { Link, Outlet, useLocation, useSubmit } from "react-router";

const DRAWER_WIDTH = 240;

const NAV_ITEMS = [
  { label: "Dashboard", to: "/dashboard" },
  { label: "Employees", to: "/employees" },
  { label: "Analytics", to: "/analytics" },
];

interface AppLayoutProps {
  user?: { name: string; role: string };
}

export default function AppLayout({ user }: AppLayoutProps = {}) {
  const { pathname } = useLocation();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const submit = useSubmit();
  const menuId = useId();
  const menuOpen = Boolean(anchorEl);
  return (
    <Box sx={{ display: "flex" }}>
      <Drawer
        variant="permanent"
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          "& .MuiDrawer-paper": {
            width: DRAWER_WIDTH,
            boxSizing: "border-box",
            bgcolor: "background.paper",
            borderRight: 1,
            borderColor: "divider",
          },
        }}
      >
        <Typography variant="h6" component="div" noWrap sx={{ px: 3, py: 2.5 }}>
          Salary Management
        </Typography>
        <List sx={{ px: 1.5 }}>
          {NAV_ITEMS.map((item) => (
            <ListItemButton
              key={item.to}
              component={Link}
              to={item.to}
              selected={pathname === item.to || pathname.startsWith(`${item.to}/`)}
              sx={{
                borderRadius: 1,
                mb: 0.5,
                "&.Mui-selected, &.Mui-selected:hover": { bgcolor: "primary.light", color: "primary.main" },
              }}
            >
              <ListItemText primary={item.label} />
            </ListItemButton>
          ))}
        </List>
        {user && (
          <Box sx={{ mt: "auto", p: 1.5, borderTop: 1, borderColor: "divider" }}>
            <Button
              fullWidth
              color="inherit"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-controls={menuOpen ? menuId : undefined}
              onClick={(e) => setAnchorEl(e.currentTarget)}
              sx={{ justifyContent: "flex-start", textAlign: "left", textTransform: "none" }}
            >
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {user.name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {user.role}
                </Typography>
              </Box>
            </Button>
            <Menu anchorEl={anchorEl} open={menuOpen} onClose={() => setAnchorEl(null)} slotProps={{ list: { id: menuId } }}>
              <MenuItem
                onClick={() => {
                  setAnchorEl(null);
                  submit(null, { method: "post", action: "/logout" });
                }}
              >
                Logout
              </MenuItem>
            </Menu>
          </Box>
        )}
      </Drawer>
      <Box component="main" sx={{ flexGrow: 1, minWidth: 0, bgcolor: "background.default", minHeight: "100vh", p: 4 }}>
        <Box sx={{ maxWidth: 1200 }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}
