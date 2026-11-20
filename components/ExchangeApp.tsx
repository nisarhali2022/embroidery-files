"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase, EMAIL_DOMAIN, BUCKET } from "@/lib/supabase";
import { RULES, TYPES, MAX_BYTES, fmtDate, extOf, fmtSize, type Role, type TabKey } from "@/lib/rules";

type Profile = { username: string; role: Role };
type FileRow = { id: number; tab: TabKey; name: string; path: string; uploaded_at: string };
type Pending = { file: File; ok: boolean; reason: string; status?: string };

function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" aria-hidden="true">
      <circle cx="17" cy="17" r="15" fill="none" stroke="var(--accent)" strokeWidth="2.5" />
      <path d="M8 17h18" stroke="var(--thread)" strokeWidth="2.5" strokeDasharray="3 3" strokeLinecap="round" />
      <path d="M17 8v18" stroke="var(--accent)" strokeWidth="2.5" strokeDasharray="3 3" strokeLinecap="round" />
    </svg>
  );
}

function UploadIcon({ size = 16, stroke = "currentColor", width = 2.2 }: { size?: number; stroke?: string; width?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
    </svg>
  );
}

export default function ExchangeApp() {
  const [booting, setBooting] = useState(true);
  const [me, setMe] = useState<Profile | null>(null);
  const [loginErr, setLoginErr] = useState("");
  const [tab, setTab] = useState<TabKey>("images");
  const [files, setFiles] = useState<Record<TabKey, FileRow[]>>({ images: [], embroidery: [] });
  const [highlightId, setHighlightId] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(""), 3000);
  }, []);

  const loadFiles = useCallback(async () => {
    const { data, error } = await supabase.from("files").select("id, tab, name, path, uploaded_at").order("uploaded_at", { ascending: true });
    if (error) { toast("Couldn't load the file list. Check your connection and refresh."); return; }
    const next: Record<TabKey, FileRow[]> = { images: [], embroidery: [] };
    (data as FileRow[]).forEach(f => next[f.tab]?.push(f));
    setFiles(next);
  }, [toast]);

  const loadProfile = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setMe(null); return; }
    const { data, error } = await supabase.from("profiles").select("username, role").eq("id", user.id).maybeSingle();
    if (error || !data) { await supabase.auth.signOut(); setMe(null); setLoginErr("This account has no access."); return; }
    setMe(data as Profile);
    setTab("images");
    await loadFiles();
  }, [loadFiles]);

  // Restore a saved session on first load
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) await loadProfile();
      setBooting(false);
    })();
  }, [loadProfile]);

  // Refresh the list when the window regains focus
  useEffect(() => {
    if (!me) return;
    const onFocus = () => { loadFiles(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [me, loadFiles]);

  // Stop the browser from opening a file dropped outside the upload box
  useEffect(() => {
    const stop = (e: DragEvent) => e.preventDefault();
    window.addEventListener("dragover", stop);
    window.addEventListener("drop", stop);
    return () => { window.removeEventListener("dragover", stop); window.removeEventListener("drop", stop); };
  }, []);

  async function signIn(username: string, password: string) {
    const u = username.trim().toLowerCase();
    if (!u || !password) { setLoginErr("Enter your username and password."); return false; }
    const { error } = await supabase.auth.signInWithPassword({ email: `${u}@${EMAIL_DOMAIN}`, password });
    if (error) { setLoginErr("Wrong username or password."); return false; }
    setLoginErr("");
    await loadProfile();
    return true;
  }

  async function signOut() {
    await supabase.auth.signOut();
    setMe(null);
    setFiles({ images: [], embroidery: [] });
    setLoginErr("");
  }

  async function download(f: FileRow) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(f.path, 60, { download: f.name });
    if (error || !data) { toast("Download failed. Try again."); return; }
    const a = document.createElement("a");
    a.href = data.signedUrl; a.rel = "noopener";
    document.body.appendChild(a); a.click(); a.remove();
  }

  async function remove(f: FileRow) {
    if (!confirm(`Delete "${f.name}"? This can't be undone.`)) return;
    const { error } = await supabase.from("files").delete().eq("id", f.id);
    if (error) { toast("Couldn't delete the file. Try again."); return; }
    await supabase.storage.from(BUCKET).remove([f.path]);
    toast(`Deleted "${f.name}".`);
    await loadFiles();
  }

  if (booting) return <div className="loading">Loading…</div>;
  if (!me) return <LoginView error={loginErr} onSubmit={signIn} />;

  const r = RULES[tab];
  const canUp = me.role === r.uploader, canDown = me.role === r.downloader, canDel = me.role === "admin";
  const list = files[tab];

  return (
    <>
      <div className="wrap">
        <header className="topbar">
          <div className="brand"><Logo size={28} /><h1>Embroidery File Exchange</h1></div>
          <div className="who">Signed in as <span className="role-pill">{me.username}</span>
            <button className="btn ghost small" type="button" onClick={signOut}>Sign out</button>
          </div>
        </header>

        <div className="tabs" role="tablist">
          {(Object.keys(RULES) as TabKey[]).map(k => (
            <button key={k} className="tab" role="tab" aria-selected={tab === k} type="button"
              onClick={() => { setTab(k); setHighlightId(null); loadFiles(); }}>
              {RULES[k].title} <span className="count">{files[k].length}</span>
            </button>
          ))}
        </div>

        <section className="panel" role="tabpanel">
          <div className="panel-head">
            <div>
              <h2>{r.title}</h2>
              <p>{canUp ? `You upload here. ${r.downloader} downloads.` : `${r.uploader} uploads here. You download.`}</p>
            </div>
            <div>
              {canUp
                ? <button className="btn" type="button" onClick={() => setModalOpen(true)}><UploadIcon />Upload</button>
                : <span className="readonly-note">Only {r.uploader} can upload here</span>}
            </div>
          </div>
          <div className="table-box">
            <table>
              <thead>
                <tr>
                  <th className="sn">S.No</th><th>File Name</th><th>Upload Date</th><th className="act">Download</th>
                  {canDel && <th className="del">Delete</th>}
                </tr>
              </thead>
              <tbody>
                {list.length === 0 && <tr><td colSpan={canDel ? 5 : 4} className="empty">No files yet.</td></tr>}
                {list.map((f, i) => (
                  <tr key={f.id} className={f.id === highlightId ? "new" : ""}>
                    <td className="sn">{i + 1}</td>
                    <td><div className="fname"><span className={`ext ${tab === "embroidery" ? "emb" : ""}`}>{extOf(f.name) || "file"}</span>{f.name}</div></td>
                    <td className="date">{fmtDate(f.uploaded_at)}</td>
                    <td className="act">
                      {canDown
                        ? <BusyButton className="btn small" onClick={() => download(f)}>Download</BusyButton>
                        : <span className="dash" title={`${r.downloader} downloads these`}>—</span>}
                    </td>
                    {canDel && <td className="del"><BusyButton className="btn danger small" aria-label={`Delete ${f.name}`} onClick={() => remove(f)}>Delete</BusyButton></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {modalOpen && (
        <UploadModal
          tab={tab}
          onClose={() => setModalOpen(false)}
          onUploaded={async (lastId, done, failed) => {
            setHighlightId(lastId);
            await loadFiles();
            if (failed) toast(`${done} uploaded, ${failed} failed. Try the failed ones again.`);
            else { setModalOpen(false); toast(`${done} file${done > 1 ? "s" : ""} added to ${RULES[tab].title}.`); }
          }}
        />
      )}

      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
    </>
  );
}

function BusyButton({ onClick, children, ...rest }: { onClick: () => Promise<void>; children: React.ReactNode; className?: string; "aria-label"?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button {...rest} type="button" disabled={busy} onClick={async () => { setBusy(true); try { await onClick(); } finally { setBusy(false); } }}>
      {children}
    </button>
  );
}

function LoginView({ error, onSubmit }: { error: string; onSubmit: (u: string, p: string) => Promise<boolean> }) {
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <section className="login">
      <form className="login-card" noValidate onSubmit={async e => {
        e.preventDefault(); setBusy(true);
        const ok = await onSubmit(user, pass);
        setBusy(false);
        if (!ok) setPass("");
      }}>
        <div className="brand"><Logo /><h1>Embroidery File Exchange</h1></div>
        <p>Sign in to share images and embroidery files.</p>
        <div className="field"><label htmlFor="user">Username</label>
          <input id="user" autoComplete="username" autoCapitalize="none" placeholder="admin or embroider" value={user} onChange={e => setUser(e.target.value)} /></div>
        <div className="field"><label htmlFor="pass">Password</label>
          <input id="pass" type="password" autoComplete="current-password" value={pass} onChange={e => setPass(e.target.value)} /></div>
        {error && <p className="err">{error}</p>}
        <button className="btn" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
    </section>
  );
}

function UploadModal({ tab, onClose, onUploaded }: {
  tab: TabKey;
  onClose: () => void;
  onUploaded: (lastId: number | null, done: number, failed: number) => Promise<void>;
}) {
  const [pending, setPending] = useState<Pending[]>([]);
  const [over, setOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const browseRef = useRef<HTMLButtonElement>(null);
  const r = RULES[tab];

  const close = useCallback(() => { if (!uploading) onClose(); }, [uploading, onClose]);

  useEffect(() => { browseRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close]);

  function addFiles(list: FileList | null) {
    if (!list || uploading) return;
    const added: Pending[] = Array.from(list).map(file => {
      let reason = "";
      if (!TYPES[tab].includes(extOf(file.name))) reason = "type not allowed";
      else if (file.size > MAX_BYTES) reason = "over 50 MB";
      return { file, ok: !reason, reason };
    });
    setPending(p => [...p, ...added]);
  }

  async function upload() {
    const todo = pending.filter(p => p.ok);
    if (!todo.length) return;
    setUploading(true);
    const items = pending.map(p => ({ ...p }));
    let done = 0, failed = 0, lastId: number | null = null;
    for (const p of items) {
      if (!p.ok) continue;
      setProgress(`Uploading ${done + failed + 1} of ${todo.length}…`);
      p.status = "uploading…"; setPending(items.map(x => ({ ...x })));
      const safe = p.file.name.replace(/[^A-Za-z0-9._-]+/g, "_");
      const path = `${tab}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`;
      const up = await supabase.storage.from(BUCKET).upload(path, p.file, { contentType: p.file.type || "application/octet-stream" });
      if (up.error) { failed++; p.status = "failed"; setPending(items.map(x => ({ ...x }))); continue; }
      const ins = await supabase.from("files").insert({ tab, name: p.file.name, path }).select("id").single();
      if (ins.error) { await supabase.storage.from(BUCKET).remove([path]); failed++; p.status = "failed"; setPending(items.map(x => ({ ...x }))); continue; }
      lastId = ins.data.id; done++; p.status = "done"; setPending(items.map(x => ({ ...x })));
    }
    setUploading(false); setProgress("");
    // Keep only the files that failed, so "Upload" retries just those
    if (failed) setPending(items.filter(p => p.status !== "done").map(p => ({ ...p, status: undefined })));
    await onUploaded(lastId, done, failed);
  }

  const okCount = pending.filter(p => p.ok).length;

  return (
    <div className="overlay" onClick={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
        <div className="modal-head">
          <h2 id="modalTitle">{r.modal}</h2>
          <button className="x" aria-label="Close" type="button" onClick={close}>×</button>
        </div>
        <div className={`drop ${over ? "over" : ""}`}
          onDragEnter={e => { e.preventDefault(); setOver(true); }}
          onDragOver={e => { e.preventDefault(); setOver(true); }}
          onDragLeave={e => { e.preventDefault(); setOver(false); }}
          onDrop={e => { e.preventDefault(); setOver(false); addFiles(e.dataTransfer.files); }}>
          <UploadIcon size={40} stroke="var(--accent)" width={1.8} />
          <strong>Drag and drop files here</strong>
          <span>or <button ref={browseRef} className="linkbtn" type="button" onClick={() => inputRef.current?.click()}>choose files</button> from your computer</span>
          <input ref={inputRef} type="file" multiple hidden accept={TYPES[tab].map(t => "." + t).join(",")}
            onChange={e => { addFiles(e.target.files); e.target.value = ""; }} />
        </div>
        <p className="types">Allowed: {TYPES[tab].map(t => "." + t).join(" ")} · up to 50 MB each</p>
        <div className="queue">
          {pending.map((p, i) => (
            <div key={i} className={p.ok ? "" : "bad"}>
              <span>{p.file.name}</span>
              <em>{p.ok ? (p.status || fmtSize(p.file.size)) : p.reason}</em>
            </div>
          ))}
        </div>
        <div className="modal-foot">
          <button className="btn ghost" type="button" onClick={close}>Cancel</button>
          <button className="btn" type="button" disabled={!okCount || uploading} onClick={upload}>
            {uploading ? progress : okCount ? `Upload ${okCount} file${okCount > 1 ? "s" : ""}` : "Upload"}
          </button>
        </div>
      </div>
    </div>
  );
}
