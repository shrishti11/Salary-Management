import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, Box, Button, Paper, TextField, Typography } from "@mui/material";
import { Controller, useForm } from "react-hook-form";
import { redirect, useNavigation, useSubmit } from "react-router";
import { z } from "zod";

import { apiFetch } from "~/lib/api-client";
import type { Route } from "./+types/login";

const loginFormSchema = z.object({
  email: z.string().min(1, "Enter a valid email").email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormValues = z.infer<typeof loginFormSchema>;

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const response = await apiFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    return { error: "Invalid credentials" };
  }

  // Relay every backend Set-Cookie header so the browser stores the session.
  const headers = new Headers();
  for (const cookie of response.headers.getSetCookie()) {
    headers.append("Set-Cookie", cookie);
  }

  return redirect("/dashboard", { headers });
}

export default function Login({ actionData }: Pick<Route.ComponentProps, "actionData">) {
  const submit = useSubmit();
  const navigation = useNavigation();
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = (values: LoginFormValues) => {
    const formData = new FormData();
    formData.set("email", values.email);
    formData.set("password", values.password);
    submit(formData, { method: "post" });
  };

  return (
    <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
      <Paper sx={{ p: 4, width: 360 }} component="form" method="post" onSubmit={handleSubmit(onSubmit)}>
        <Typography variant="h5" component="h1" gutterBottom>
          Sign in
        </Typography>

        {actionData?.error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {actionData.error}
          </Alert>
        )}

        <Controller
          name="email"
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              label="Email"
              fullWidth
              margin="normal"
              error={!!errors.email}
              helperText={errors.email?.message}
            />
          )}
        />

        <Controller
          name="password"
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              label="Password"
              type="password"
              fullWidth
              margin="normal"
              error={!!errors.password}
              helperText={errors.password?.message}
            />
          )}
        />

        <Button
          type="submit"
          variant="contained"
          fullWidth
          sx={{ mt: 2 }}
          disabled={navigation.state === "submitting"}
        >
          Sign in
        </Button>
      </Paper>
    </Box>
  );
}
