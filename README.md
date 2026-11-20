# Embroidery File Exchange

A simple one-page app for sharing files between an **admin** and an **embroiderer**.

| | Images tab | Embroidery Files tab |
|---|---|---|
| Upload | admin | embroider |
| Download | embroider | admin |
| Delete | admin | admin |

**Tech stack:**
- **Next.js 16** with React 19 and TypeScript, deployed on **Vercel**.
- **Supabase** for logins, the file list (Postgres with row-level security) and private file storage.

## Project layout

| Path | What it is |
|---|---|
| `app/` | Next.js App Router: `layout.tsx` (fonts, page title), `page.tsx`, `globals.css` (all styles) |
| `components/ExchangeApp.tsx` | The whole UI: login, tabs, table, upload pop-up |
| `lib/supabase.ts` | Supabase client, read from environment variables |
| `lib/rules.ts` | Who uploads and downloads in each tab, plus the allowed file types |
| `database/setup.sql` | One-time Supabase setup: tables, storage bucket, access rules |
| `test/fake-supabase.ts` | In-memory stand-in for Supabase, used by `npm run dev:fake` |
| `legacy-static/` | The earlier plain-HTML version and mock-up, kept for reference only |

## Run it on your computer

```bash
npm install
cp .env.example .env.local   # then fill in your Supabase URL and publishable key
npm run dev                  # open http://localhost:3000
```

`npm run dev:fake` runs the app on port 3001 with fake data and no Supabase connection. Its logins are `admin` / `a` and `embroider` / `e`.

## Supabase setup (one time)

1. Create a project at <https://supabase.com>.
2. Go to **Authentication → Sign In / Providers**:
   - Turn **off** "Allow new users to sign up".
   - Under **Email**, turn **off** "Confirm email".
3. Go to **Authentication → Users → Add user** and create `admin@example.com` and `embroider@example.com`, ticking **Auto Confirm User** for each. On the website, people sign in with just `admin` or `embroider`.
4. In the **SQL Editor**, paste the whole of `database/setup.sql` and run it. The result should list both users with their roles.
5. Copy the **Project URL** and the **publishable** (or legacy anon) key into your environment variables. ⚠️ Never use the secret or service_role key.

To change a password, go to **Authentication → Users**, click the user, and set a new one.

## Deploy on Vercel

1. Push this repo to GitHub.
2. At <https://vercel.com/new>, import the repo. Vercel detects Next.js automatically.
3. Under **Environment Variables**, add:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Click **Deploy**. Every later push to `main` redeploys the site automatically.

## Good to know

- **Allowed file types:** to change them, edit `TYPES` in `lib/rules.ts` **and** the matching lists in `database/setup.sql`, then run the SQL again.
- **Free plan limits:** each file can be up to 50 MB, with about 1 GB of storage in total.
- **Paused projects:** Supabase pauses free projects after 7 days with no activity. If the site stops loading, open the Supabase dashboard and click **Restore project**.
