// @ts-nocheck
// In-memory stand-in for lib/supabase.ts, used only when running `npm run dev:fake`.
// Logins: admin / a and embroider / e
const users = { "admin@example.com": { id: "u-admin", pw: "a" }, "embroider@example.com": { id: "u-emb", pw: "e" } };
const db = {
  profiles: [{ id: "u-admin", username: "admin", role: "admin" }, { id: "u-emb", username: "embroider", role: "embroider" }],
  files: [{ id: 1, tab: "images", name: "seed_logo.png", path: "images/seed", uploaded_at: "2026-11-14T10:00:00Z" }],
};
let nextId = 2, session = null;
const storage = {};
if (typeof window !== "undefined") window.__fake = { storage, db, get lastDownload() { return window.__lastDownload; } };

function q(table) {
  let filters = [], order = null, op = "select", payload = null, single = false;
  const b = {
    select() { return b; }, eq(k, v) { filters.push([k, v]); return b; },
    order(k, o) { order = [k, o.ascending]; return b; },
    insert(p) { op = "insert"; payload = p; return b; }, delete() { op = "delete"; return b; },
    single() { single = true; return b; }, maybeSingle() { single = true; return b; },
    then(res, rej) { return Promise.resolve(run()).then(res, rej); },
  };
  function run() {
    const t = db[table];
    if (op === "insert") { const r = { id: nextId++, uploaded_at: new Date().toISOString(), ...payload }; t.push(r); return { data: r, error: null }; }
    let out = t.filter(r => filters.every(([k, v]) => r[k] === v));
    if (op === "delete") { out.forEach(r => t.splice(t.indexOf(r), 1)); return { data: null, error: null }; }
    if (order) out = [...out].sort((a, c) => (a[order[0]] < c[order[0]] ? -1 : 1) * (order[1] ? 1 : -1));
    return { data: single ? (out[0] || null) : out, error: null };
  }
  return b;
}

export const supabase = {
  auth: {
    async getSession() { return { data: { session } }; },
    async getUser() { return { data: { user: session && session.user } }; },
    async signInWithPassword({ email, password }) {
      const u = users[email]; if (!u || u.pw !== password) return { error: { message: "bad" } };
      session = { user: { id: u.id, email } }; return { error: null };
    },
    async signOut() { session = null; return {}; },
  },
  from: q,
  storage: { from: () => ({
    async upload(path, file) { storage[path] = file.name; return { error: null }; },
    async remove(paths) { paths.forEach(p => delete storage[p]); return { error: null }; },
    async createSignedUrl(path, s, o) { window.__lastDownload = { path, name: o.download }; return { data: { signedUrl: "#dl" }, error: null }; },
  }) },
};
export const EMAIL_DOMAIN = "example.com";
export const BUCKET = "files";
