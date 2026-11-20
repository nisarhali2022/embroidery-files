import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Copy .env.example to .env.local and fill them in.");
}

// The publishable (anon) key is safe in the browser: the database rules in
// database/setup.sql decide who can see, upload and delete files.
export const supabase = createClient(url, key);

// Usernames "admin" and "embroider" sign in as admin@example.com / embroider@example.com
export const EMAIL_DOMAIN = "example.com";
export const BUCKET = "files";
