import express from "express";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { requireCap } from "../auth.js";
import { logAudit } from "../audit.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.resolve(__dirname, "../../uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const router = express.Router();

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB per file
const EXT_BY_MIME = {
  "application/pdf": ".pdf",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/svg+xml": ".svg",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "application/vnd.ms-excel": ".xls",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
};

// Keep only safe characters from the original name for the stored suffix.
function safeName(name) {
  return String(name || "file")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .slice(-60);
}

// Upload a single file as a base64 data URL. Returns a served URL the client
// stores on the part number (ikioSpecSheet / vendorSpecSheet / image).
router.post("/", requireCap("write"), async (req, res) => {
  const { filename, dataUrl } = req.body || {};
  if (!dataUrl || typeof dataUrl !== "string") {
    return res.status(400).json({ error: "dataUrl is required" });
  }
  const match = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl);
  if (!match) return res.status(400).json({ error: "Invalid data URL" });

  const mime = match[1];
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length === 0) return res.status(400).json({ error: "Empty file" });
  if (buffer.length > MAX_BYTES) return res.status(413).json({ error: "File exceeds 20 MB limit" });

  const original = safeName(filename);
  const hasExt = /\.[a-z0-9]{1,5}$/i.test(original);
  const ext = hasExt ? "" : (EXT_BY_MIME[mime] || "");
  const stored = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}-${original}${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, stored), buffer);

  await logAudit(req, "Upload", "Created", `Uploaded file ${original} (${Math.round(buffer.length / 1024)} KB)`);
  // Relative URL so it works under a subpath deploy (/partpilot/api/uploads/…).
  res.status(201).json({ url: `uploads/${stored}`, name: original, size: buffer.length, mime });
});

// Serve stored files (GET /api/uploads/<file>). Behind requireAuth like all /api.
router.use(express.static(UPLOAD_DIR));

export default router;
