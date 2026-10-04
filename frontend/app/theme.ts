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
