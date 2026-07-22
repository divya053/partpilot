import { useState } from "react";
import { Layout } from "../components/Layout";
import { api } from "../lib/api";
import { useToast } from "../lib/toast";
import { useAuth } from "../lib/auth";
import { CORE_KEYS, OPTIONAL_KEYS } from "../lib/partNumber";

// Parse a CSV file into row objects keyed by header. Handles quoted fields.
function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim());
  if (!lines.length) return [];
  const parseLine = (line: string) => {
    const out: string[] = []; let cur = ""; let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
      else if (c === '"') q = true; else if (c === ",") { out.push(cur); cur = ""; } else cur += c;
    }
    out.push(cur); return out;
  };
  const headers = parseLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((l) => {
    const cells = parseLine(l);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => (obj[h] = (cells[i] ?? "").trim()));
    return obj;
  });
}

const snakeToCamel = (s: string) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

export default function ImportExport() {
  const toast = useToast();
  const { can } = useAuth();
  const [result, setResult] = useState<{ created: number; skipped: number; errors: any[] } | null>(null);
  const [busy, setBusy] = useState(false);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true); setResult(null);
    try {
      const text = await file.text();
      const raw = parseCsv(text);
      const rows = raw.map((r) => {
        const obj: Record<string, string> = {};
        for (const [k, v] of Object.entries(r)) obj[snakeToCamel(k)] = v;
        return obj;
      });
      const res = await api.post<{ created: number; skipped: number; errors: any[] }>("/import/parts", { rows });
      setResult(res);
      toast(`Imported ${res.created} parts (${res.skipped} skipped)`, "success");
    } catch (err) { toast((err as Error).message, "error"); }
    finally { setBusy(false); e.target.value = ""; }
  };

  const templateCsv = () => {
    const cols = ["productCategory", "productName", "sku", ...CORE_KEYS, ...OPTIONAL_KEYS, "status"];
    const sample = ["High Bay", "Sample UFO High Bay", "SKU-001", "IK", "UHB", "3", "02", "S", "0240", "MV", "D", "CCT", "WD", "03", "BK", "BFU", "", "", "MWS", "", "", "", "", "", "", "active"];
    const csv = cols.join(",") + "\n" + sample.join(",");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = "partpilot-import-template.csv"; a.click();
  };

  return (
    <Layout title="Import / Export" subtitle="Bulk-load part numbers or export the full registry.">
      <div className="row" style={{ alignItems: "flex-start" }}>
        <div className="card card-pad" style={{ flex: 1 }}>
          <h3 style={{ marginBottom: 6 }}>Export</h3>
          <p className="muted" style={{ marginTop: 0 }}>Download every part number in the registry.</p>
          <div className="flex wrap">
            <a className="btn primary" href="/api/export/parts.csv">⬇ Export CSV</a>
            <a className="btn" href="/api/export/parts.json">⬇ Export JSON</a>
          </div>
        </div>

        <div className="card card-pad" style={{ flex: 1 }}>
          <h3 style={{ marginBottom: 6 }}>Import</h3>
          <p className="muted" style={{ marginTop: 0 }}>Upload a CSV of part numbers. Columns use segment keys (camelCase or snake_case). The part number is generated automatically; duplicates are skipped.</p>
          <div className="flex wrap">
            <button className="btn" onClick={templateCsv}>⬇ Download template</button>
            {can("import") ? (
              <label className="btn primary" style={{ cursor: "pointer" }}>
                {busy ? "Importing…" : "⬆ Upload CSV"}
                <input type="file" accept=".csv" hidden onChange={onFile} disabled={busy} />
              </label>
            ) : <span className="muted">You don't have import permission.</span>}
          </div>

          {result && (
            <div className="insight success" style={{ marginTop: 16 }}>
              <div className="t">Import complete</div>
              <div className="d">{result.created} created · {result.skipped} skipped{result.errors.length ? ` · ${result.errors.length} errors` : ""}</div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
