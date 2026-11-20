export type Role = "admin" | "embroider";
export type TabKey = "images" | "embroidery";

// Allowed file types per tab. Keep in sync with the "upload to own tab" rule in database/setup.sql.
export const TYPES: Record<TabKey, string[]> = {
  images: ["jpg","jpeg","png","gif","webp","bmp","tif","tiff","svg","heic","pdf","ai","eps","psd","cdr"],
  embroidery: ["dst","pes","pec","emb","jef","exp","vp3","vip","hus","xxx","sew","csd","dsb","dsz","pxf","ofm","u01","tap","ksm","art","shv","jpx","10o"],
};

export const MAX_BYTES = 50 * 1024 * 1024; // Supabase free plan limit per file

// Who uploads / downloads in each tab
export const RULES: Record<TabKey, { title: string; uploader: Role; downloader: Role; modal: string }> = {
  images:     { title: "Images",           uploader: "admin",     downloader: "embroider", modal: "Upload images" },
  embroidery: { title: "Embroidery Files", uploader: "embroider", downloader: "admin",     modal: "Upload embroidery files" },
};

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
export const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};
export const extOf = (n: string) => { const i = n.lastIndexOf("."); return i > 0 ? n.slice(i + 1).toLowerCase() : ""; };
export const fmtSize = (b: number) => b >= 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB";
