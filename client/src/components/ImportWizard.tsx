import { useMemo, useState } from "react";
import { Modal } from "./Modal";
import { api } from "../lib/api";
import { useToast } from "../lib/toast";
import type { FieldDef } from "./CrudPage";

type ImportResult = { created: number; updated: number; errors: { row: number; error: string }[] };

/**
 * Generic spreadsheet import with column mapping (Freshsales-style). Works for
 * any resource whose fields are described by FieldDef[]. Uploads a sheet, maps
 * each column to a field, previews, and posts to `${endpoint}/bulk`. Rows are
 * matched (update vs insert) on `keyColumn` (defaults to the "name" field).
 */
export function ImportWizard({ title, endpoint, singular, fields, keyColumn, onClose, onDone }: {
  title: string; endpoint: string; singular: string; fields: FieldDef[]; keyColumn?: string; onClose: () => void; onDone: () => void;
}) {
  const toast = useToast();
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [map, setMap] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const norm = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  const key = keyColumn || (fields.find((f) => f.key === "name") ? "name" : fields[0]?.key) || "";
  const keyLabel = fields.find((f) => f.key === key)?.label || key;
  const isList = (k: string) => fields.find((f) => f.key === k)?.type === "list";

  const autoMap = (hdrs: string[]) => {
    const m: Record<number, string> = {};
    hdrs.forEach((h, i) => {
      const n = norm(h);
      const f = fields.find((fd) => norm(fd.label) === n || norm(fd.key) === n || norm(fd.key.replace(/_/g, " ")) === n);
      m[i] = f ? f.key : "ignore";
    });
    setMap(m);
  };

  const onFile = async (file?: File | null) => {
    if (!file) return;
    setResult(null);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const grid = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "", raw: false, blankrows: false });
      const hdrs = (grid[0] || []).map((c: any) => String(c).trim());
      setHeaders(hdrs); setRows(grid.slice(1) as string[][]); setFileName(file.name); autoMap(hdrs);
    } catch { toast("Could not read that file. Use .xlsx or .csv.", "error"); }
  };

  // Template is pre-filled with the current records so you can edit any cell and
  // re-upload — rows are matched back by the key column and updated.
  const downloadTemplate = async () => {
    try {
      const XLSX = await import("xlsx");
      let existing: Record<string, unknown>[] = [];
      try { existing = await api.get<Record<string, unknown>[]>(endpoint); } catch { /* export headers only */ }
      const header = fields.map((f) => f.label);
      const body = existing.map((r) => fields.map((f) => {
        const v = r[f.key];
        return Array.isArray(v) ? v.join("|") : (v == null ? "" : String(v));
      }));
      const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
      ws["!cols"] = fields.map(() => ({ wch: 20 }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, singular);
      XLSX.writeFile(wb, `partpilot-${singular.toLowerCase()}-template.xlsx`);
      toast(`Template with ${existing.length} row(s) downloaded`, "success");
    } catch (e) { toast((e as Error).message, "error"); }
  };

  const built = useMemo(() => {
    const mapped = Object.entries(map).filter(([, t]) => t !== "ignore").map(([i, t]) => ({ idx: Number(i), key: t }));
    const out: Record<string, unknown>[] = [];
    for (const row of rows) {
      const obj: Record<string, unknown> = {};
      let any = false;
      for (const m of mapped) {
        const v = String(row[m.idx] ?? "").trim();
        if (!v) continue;
        obj[m.key] = isList(m.key) ? v.split(/[|,;]/).map((x) => x.trim()).filter(Boolean) : v;
        any = true;
      }
      if (any) out.push(obj);
    }
    return out;
  }, [map, rows]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasKey = Object.values(map).includes(key);
  const canImport = built.length > 0 && hasKey;

  const runImport = async () => {
    if (!canImport) return;
    setBusy(true); setResult(null);
    try {
      const res = await api.post<ImportResult>(`${endpoint}/bulk`, { rows: built, keyColumn: key });
      setResult(res);
      toast(`${res.created} added · ${res.updated} updated`, "success");
      onDone();
    } catch (e) { toast((e as Error).message, "error"); } finally { setBusy(false); }
  };

  return (
    <Modal title={`Import ${title}`} onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>Close</button>
        <button className="btn primary" onClick={runImport} disabled={busy || !canImport}>{busy ? "Importing…" : `Import ${built.length} row(s)`}</button>
      </>}>
      <div className="grid" style={{ gap: 14 }}>
        <div className="insight info">
          <div className="t">Bulk import with column mapping</div>
          <div className="d">Upload a spreadsheet and map each column to a field. Rows are matched by <span className="mono">{keyLabel}</span> — existing records are updated, new ones added.</div>
        </div>
        <div className="flex" style={{ gap: 8, flexWrap: "wrap" }}>
          <label className="btn primary" style={{ cursor: "pointer" }}>⬆ Choose file (.xlsx / .csv)
            <input type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={(e) => { void onFile(e.target.files?.[0]); e.currentTarget.value = ""; }} />
          </label>
          <button className="btn" onClick={downloadTemplate}>⬇ Download template</button>
        </div>

        {headers.length > 0 && (
          <div className="table-wrap" style={{ maxHeight: 320, overflowY: "auto" }}>
            <table className="tbl">
              <thead><tr><th>Column</th><th>Sample</th><th>Maps to field</th></tr></thead>
              <tbody>
                {headers.map((h, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{h || <span className="muted">(blank)</span>}</td>
                    <td className="muted" style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{String(rows.find((r) => String(r[i] ?? "").trim())?.[i] ?? "")}</td>
                    <td>
                      <select className="select" value={map[i] || "ignore"} onChange={(e) => setMap((m) => ({ ...m, [i]: e.target.value }))}>
                        <option value="ignore">Ignore</option>
                        {fields.map((f) => <option key={f.key} value={f.key}>{f.label}{f.key === key ? " (match key)" : ""}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {headers.length > 0 && (
          <div className={"insight " + (canImport ? "success" : "warning")}>
            <div className="d">{!hasKey ? `Map a column to ${keyLabel} (the match key) to continue.` : <><b>{built.length}</b> row(s) ready to import.</>}</div>
          </div>
        )}
        {result && <div className="insight success"><div className="t">Done</div><div className="d">{result.created} added · {result.updated} updated{result.errors.length ? ` · ${result.errors.length} error(s)` : ""}</div></div>}
      </div>
    </Modal>
  );
}
