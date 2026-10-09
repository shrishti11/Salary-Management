import type { Config } from "@react-router/dev/config";

export default {
  // Config options...
  // Server-side render by default, to enable SPA mode set this to `false`
  ssr: true,
  // Behind Railway's proxy the Host header differs from the browser Origin, which trips
  // React Router's CSRF check on form actions. Allow the public Railway domains.
  allowedActionOrigins: ["*.up.railway.app"],
} satisfies Config;
