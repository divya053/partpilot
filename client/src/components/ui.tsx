import { ReactNode, useRef, useState } from "react";
import { Modal } from "./Modal";
import { uploadFile, fileUrl } from "../lib/api";
import { useToast } from "../lib/toast";

export function StatusBadge({ status }: { status?: string }) {
  const s = (status || "").toLowerCase();
  const cls = s === "active" ? "green" : s === "inactive" || s === "deprecated" ? "gray"
    : s === "draft" ? "amber" : s === "temporary" ? "blue" : "gray";
  return <span className={`badge ${cls} dot`}>{status || "—"}</span>;
}

export function Field({
  label, required, hint, children,
}: { label: string; required?: boolean; hint?: string; children: ReactNode }) {
  return (
    <div className="field">
      <label>{label}{required && <span className="req"> *</span>}</label>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

export function Spinner() {
  return <div className="center-load"><div className="spinner" /></div>;
}

export function Empty({ icon = "📭", title, sub }: { icon?: string; title: string; sub?: string }) {
  return <div className="empty"><div className="big">{icon}</div><div style={{ fontWeight: 600 }}>{title}</div>{sub && <div style={{ marginTop: 4 }}>{sub}</div>}</div>;
}

/** Simple imperative confirm dialog hook. */
export function useConfirm() {
  const [state, setState] = useState<{ message: string; resolve: (v: boolean) => void } | null>(null);
  const confirm = (message: string) => new Promise<boolean>((resolve) => setState({ message, resolve }));
  const node = state ? (
    <Modal title="Please confirm" onClose={() => { state.resolve(false); setState(null); }}
      footer={<>
        <button className="btn" onClick={() => { state.resolve(false); setState(null); }}>Cancel</button>
        <button className="btn danger" onClick={() => { state.resolve(true); setState(null); }}>Confirm</button>
      </>}>
      <p style={{ margin: 0 }}>{state.message}</p>
    </Modal>
  ) : null;
  return { confirm, node };
}

/** Upload-or-show file control. Stores the returned "uploads/…" ref via onChange. */
export function FileUpload({
  value, onChange, accept, image,
}: { value?: string | null; onChange: (v: string) => void; accept?: string; image?: boolean }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const inputId = useRef(`fu-${Math.random().toString(36).slice(2)}`).current;

  const pick = async (file?: File | null) => {
    if (!file) return;
    setBusy(true);
    try {
      const r = await uploadFile(file);
      onChange(r.url);
      toast("File uploaded", "success");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const url = fileUrl(value);
  return (
    <div className="file-upload">
      {value ? (
        <div className="flex" style={{ gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {image
            ? <img src={url} alt="preview" className="thumb" />
            : <a href={url} target="_blank" rel="noreferrer" className="badge green">Open ↗</a>}
          <a href={url} target="_blank" rel="noreferrer" className="muted" style={{ fontSize: 12, textDecoration: "underline", wordBreak: "break-all" }}>
            {image ? "View image" : "View file"}
          </a>
          <button type="button" className="icon-btn danger" onClick={() => onChange("")} title="Remove">✕</button>
        </div>
      ) : (
        <label className="btn" style={{ cursor: busy ? "wait" : "pointer" }} htmlFor={inputId}>
          {busy ? "Uploading…" : image ? "⬆ Upload image" : "⬆ Upload file"}
        </label>
      )}
      <input
        id={inputId}
        type="file"
        accept={accept}
        style={{ display: "none" }}
        disabled={busy}
        onChange={(e) => { void pick(e.target.files?.[0]); e.currentTarget.value = ""; }}
      />
    </div>
  );
}

export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const nums: number[] = [];
  const start = Math.max(1, Math.min(page - 2, pages - 4));
  for (let i = start; i <= Math.min(pages, start + 4); i++) nums.push(i);
  return (
    <div className="spread" style={{ marginTop: 16 }}>
      <span className="muted" style={{ fontSize: 12.5 }}>
        Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
      </span>
      <div className="pager">
        <button disabled={page <= 1} onClick={() => onPage(page - 1)}>‹</button>
        {nums.map((n) => <button key={n} className={n === page ? "active" : ""} onClick={() => onPage(n)}>{n}</button>)}
        <button disabled={page >= pages} onClick={() => onPage(page + 1)}>›</button>
      </div>
    </div>
  );
}
