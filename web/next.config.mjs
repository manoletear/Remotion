/** @type {import('next').NextConfig} */
const nextConfig = {
  // The access layer is a server-side Node package (in-memory stores, Twilio,
  // Supabase client). Keep it external so Next doesn't try to bundle it for the
  // browser — all access happens in server actions / server components.
  serverExternalPackages: ["gsm-gate-access-layer", "@supabase/supabase-js", "@supabase/ssr"],
};

export default nextConfig;
