import { IconButton, InputAdornment, SvgIcon, TextField, type TextFieldProps } from "@mui/material";
import { useRef, type Ref } from "react";

function setRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === "function") ref(value);
  else if (ref) (ref as { current: T | null }).current = value;
}

/**
 * A date input with an always-visible calendar button. The browser's own picker indicator is easy to miss
 * (and invisible in some themes), so this opens the native picker explicitly. Values stay `YYYY-MM-DD`.
 */
export default function DateField({ inputRef, slotProps, ...props }: TextFieldProps) {
  const element = useRef<HTMLInputElement | null>(null);
  const input = (slotProps?.input ?? {}) as Record<string, unknown>;

  return (
    <TextField
      {...props}
      type="date"
      inputRef={(node: HTMLInputElement | null) => {
        element.current = node;
        setRef(inputRef, node);
      }}
      slotProps={{
        ...slotProps,
        inputLabel: { shrink: true, ...(slotProps?.inputLabel as object) },
        input: {
          ...input,
          endAdornment: (
            <InputAdornment position="end">
              <IconButton
                size="small"
                edge="end"
                aria-label={`Open calendar for ${typeof props.label === "string" ? props.label : "date"}`}
                disabled={props.disabled}
                onClick={() => {
                  const node = element.current;
                  if (!node) return;
                  node.focus();
                  if (typeof node.showPicker === "function") {
                    try {
                      node.showPicker();
                    } catch {
                      /* the browser refused (e.g. no user gesture); the field is still typeable */
                    }
                  }
                }}
              >
                <SvgIcon fontSize="small">
                  <path d="M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2m0 16H5V10h14zM5 8V6h14v2z" />
                </SvgIcon>
              </IconButton>
            </InputAdornment>
          ),
        },
      }}
      sx={{
        ...(props.sx as object),
        // Our button replaces the browser's own indicator so there is exactly one calendar icon.
        "& input::-webkit-calendar-picker-indicator": { display: "none" },
      }}
    />
  );
}
