import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `npm run dev:fake` swaps Supabase for an in-memory stand-in, for testing the UI offline
  ...(process.env.FAKE_SUPABASE === "1"
    ? { turbopack: { resolveAlias: { "@/lib/supabase": "./test/fake-supabase.ts" } } }
    : {}),
};

export default nextConfig;
