const cfg = window.APP_CONFIG;
const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
const BUCKET = "files";

// Allowed file types per tab. Keep in sync with the "upload to own tab" rule in setup.sql.
const TYPES = {
  images: ["jpg","jpeg","png","gif","webp","bmp","tif","tiff","svg","heic","pdf","ai","eps","psd","cdr"],
  embroidery: ["dst","pes","pec","emb","jef","exp","vp3","vip","hus","xxx","sew","csd","dsb","dsz","pxf","ofm","u01","tap","ksm","art","shv","jpx","10o"]
};
const MAX_BYTES = 50 * 1024 * 1024; // Supabase free plan limit per file

// Who uploads / downloads in each tab
const RULES = {
  images:     { title: "Images",           uploader: "admin",     downloader: "embroider", modal: "Upload images" },
  embroidery: { title: "Embroidery Files", uploader: "embroider", downloader: "admin",     modal: "Upload embroidery files" }
};

let me = null;               // { username, role }
let tab = "images";
let files = { images: [], embroidery: [] };
let pending = [];            // [{ file, ok, reason }]
let highlightId = null;
let uploading = false;

const $ = id => document.getElementById(id);
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const fmtDate = iso => { const d = new Date(iso); return `${String(d.getDate()).padStart(2,"0")} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };
const extOf = n => { const i = n.lastIndexOf("."); return i > 0 ? n.slice(i + 1).toLowerCase() : ""; };
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
const fmtSize = b => b >= 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB";

function toast(msg) {
  const t = $("toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => (t.hidden = true), 3000);
}

/* ---------- Login ---------- */
function showLogin(errMsg) {
  me = null;
  $("appView").hidden = true; $("loginView").hidden = false;
  $("pass").value = "";
  $("loginErr").textContent = errMsg || ""; $("loginErr").hidden = !errMsg;
}

async function loadProfile() {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return showLogin();
  const { data, error } = await sb.from("profiles").select("username, role").eq("id", user.id).maybeSingle();
  if (error || !data) { await sb.auth.signOut(); return showLogin("This account has no access."); }
  me = data;
  $("loginView").hidden = true; $("appView").hidden = false;
  $("whoName").textContent = me.username;
  tab = "images";
  render();
  await loadFiles();
}

$("loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  const u = $("user").value.trim().toLowerCase();
  const p = $("pass").value;
  if (!u || !p) return showLogin("Enter your username and password.");
  $("loginBtn").disabled = true; $("loginBtn").textContent = "Signing in…";
  const { error } = await sb.auth.signInWithPassword({ email: `${u}@${cfg.EMAIL_DOMAIN}`, password: p });
  $("loginBtn").disabled = false; $("loginBtn").textContent = "Sign in";
  if (error) return showLogin("Wrong username or password.");
  await loadProfile();
});

$("logout").onclick = async () => { await sb.auth.signOut(); showLogin(); $("user").focus(); };

/* ---------- Files ---------- */
async function loadFiles() {
  const { data, error } = await sb.from("files").select("id, tab, name, path, uploaded_at").order("uploaded_at", { ascending: true });
  if (error) { toast("Couldn't load the file list. Check your connection and refresh."); return; }
  files = { images: [], embroidery: [] };
  data.forEach(f => files[f.tab] && files[f.tab].push(f));
  render();
}

function render() {
  if (!me) return;
  const r = RULES[tab];
  const canUp = me.role === r.uploader, canDown = me.role === r.downloader, canDel = me.role === "admin";
  document.querySelectorAll(".tab").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === tab));
  $("c-images").textContent = files.images.length;
  $("c-embroidery").textContent = files.embroidery.length;
  $("panelTitle").textContent = r.title;
  $("panelSub").textContent = canUp ? `You upload here. ${r.downloader} downloads.` : `${r.uploader} uploads here. You download.`;
  $("panelAction").innerHTML = canUp
    ? `<button class="btn" id="openModal" type="button"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></svg>Upload</button>`
    : `<span class="readonly-note">Only ${r.uploader} can upload here</span>`;
  if (canUp) $("openModal").onclick = openModal;

  $("headRow").innerHTML = `<th class="sn">S.No</th><th>File Name</th><th>Upload Date</th><th class="act">Download</th>${canDel ? '<th class="del">Delete</th>' : ""}`;
  const list = files[tab];
  $("rows").innerHTML = list.length ? list.map((f, i) => `<tr class="${f.id === highlightId ? "new" : ""}">
      <td class="sn">${i + 1}</td>
      <td><div class="fname"><span class="ext ${tab === "embroidery" ? "emb" : ""}">${esc(extOf(f.name) || "file")}</span>${esc(f.name)}</div></td>
      <td class="date">${fmtDate(f.uploaded_at)}</td>
      <td class="act">${canDown ? `<button class="btn small" data-dl="${f.id}" type="button">Download</button>` : `<span class="dash" title="${esc(r.downloader)} downloads these">—</span>`}</td>
      ${canDel ? `<td class="del"><button class="btn danger small" data-del="${f.id}" type="button" aria-label="Delete ${esc(f.name)}">Delete</button></td>` : ""}
    </tr>`).join("")
    : `<tr><td colspan="${canDel ? 5 : 4}" class="empty">No files yet.</td></tr>`;

  document.querySelectorAll("[data-dl]").forEach(b => b.onclick = () => download(list.find(f => f.id === +b.dataset.dl), b));
  document.querySelectorAll("[data-del]").forEach(b => b.onclick = () => remove(list.find(f => f.id === +b.dataset.del), b));
}

document.querySelectorAll(".tab").forEach(b => b.onclick = () => { tab = b.dataset.tab; highlightId = null; render(); loadFiles(); });
window.addEventListener("focus", () => { if (me) loadFiles(); });

async function download(f, btn) {
  btn.disabled = true;
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(f.path, 60, { download: f.name });
  btn.disabled = false;
  if (error) return toast("Download failed. Try again.");
  const a = document.createElement("a");
  a.href = data.signedUrl; a.rel = "noopener";
  document.body.appendChild(a); a.click(); a.remove();
}

async function remove(f, btn) {
  if (!confirm(`Delete "${f.name}"? This can't be undone.`)) return;
  btn.disabled = true;
  const { error: rowErr } = await sb.from("files").delete().eq("id", f.id);
  if (rowErr) { btn.disabled = false; return toast("Couldn't delete the file. Try again."); }
  await sb.storage.from(BUCKET).remove([f.path]);
  toast(`Deleted "${f.name}".`);
  await loadFiles();
}

/* ---------- Upload pop-up ---------- */
function openModal() {
  pending = []; drawQueue();
  $("modalTitle").textContent = RULES[tab].modal;
  $("typesNote").textContent = `Allowed: ${TYPES[tab].map(t => "." + t).join(" ")} · up to 50 MB each`;
  $("fileInput").accept = TYPES[tab].map(t => "." + t).join(",");
  $("modal").hidden = false; $("browse").focus();
}
function closeModal() { if (!uploading) $("modal").hidden = true; }
$("closeModal").onclick = closeModal; $("cancel").onclick = closeModal;
$("modal").addEventListener("click", e => { if (e.target.id === "modal") closeModal(); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("modal").hidden) closeModal(); });
$("browse").onclick = () => $("fileInput").click();
$("fileInput").onchange = e => { addFiles(e.target.files); e.target.value = ""; };

const drop = $("drop");
["dragenter", "dragover"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("over"); }));
drop.addEventListener("drop", e => addFiles(e.dataTransfer.files));
// Stop the browser from opening a file dropped outside the box
["dragover", "drop"].forEach(ev => window.addEventListener(ev, e => e.preventDefault()));

function addFiles(list) {
  if (uploading) return;
  for (const file of list) {
    let reason = "";
    if (!TYPES[tab].includes(extOf(file.name))) reason = "type not allowed";
    else if (file.size > MAX_BYTES) reason = "over 50 MB";
    pending.push({ file, ok: !reason, reason });
  }
  drawQueue();
}

function drawQueue(status = {}) {
  $("queue").innerHTML = pending.map((p, i) =>
    `<div class="${p.ok ? "" : "bad"}"><span>${esc(p.file.name)}</span><em>${p.ok ? (status[i] || fmtSize(p.file.size)) : p.reason}</em></div>`
  ).join("");
  const n = pending.filter(p => p.ok).length;
  $("doUpload").disabled = !n || uploading;
  if (!uploading) $("doUpload").textContent = n ? `Upload ${n} file${n > 1 ? "s" : ""}` : "Upload";
}

$("doUpload").onclick = async () => {
  const todo = pending.map((p, i) => ({ ...p, i })).filter(p => p.ok);
  if (!todo.length) return;
  uploading = true;
  const status = {};
  let done = 0, failed = 0, lastId = null;
  for (const p of todo) {
    $("doUpload").textContent = `Uploading ${done + failed + 1} of ${todo.length}…`;
    status[p.i] = "uploading…"; drawQueue(status);
    const safe = p.file.name.replace(/[^A-Za-z0-9._-]+/g, "_");
    const path = `${tab}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`;
    const up = await sb.storage.from(BUCKET).upload(path, p.file, { contentType: p.file.type || "application/octet-stream" });
    if (up.error) { failed++; status[p.i] = "failed"; drawQueue(status); continue; }
    const ins = await sb.from("files").insert({ tab, name: p.file.name, path }).select("id").single();
    if (ins.error) { await sb.storage.from(BUCKET).remove([path]); failed++; status[p.i] = "failed"; drawQueue(status); continue; }
    lastId = ins.data.id; done++; status[p.i] = "done"; drawQueue(status);
  }
  uploading = false;
  highlightId = lastId;
  await loadFiles();
  if (failed) {
    // Keep only the files that failed, so "Upload" retries just those
    pending = pending.filter((p, i) => status[i] !== "done");
    drawQueue();
    toast(`${done} uploaded, ${failed} failed. Try the failed ones again.`); }
  else { $("modal").hidden = true; toast(`${done} file${done > 1 ? "s" : ""} added to ${RULES[tab].title}.`); }
};

/* ---------- Start ---------- */
(async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (session) await loadProfile(); else showLogin();
})();
