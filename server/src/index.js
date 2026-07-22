import express from "express";
import "express-async-errors"; // makes thrown async route errors reach the error handler instead of crashing
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import "dotenv/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

import { pool } from "./db.js";
import { seed } from "./seed.js";
import { attachUser, requireAuth } from "./auth.js";

import authRoutes from "./routes/auth.js";
import partNumberRoutes from "./routes/partNumbers.js";
import segmentRoutes from "./routes/segments.js";
import companyRoutes from "./routes/companies.js";
import productRoutes from "./routes/products.js";
import categoryRoutes from "./routes/categories.js";
import templateRoutes from "./routes/templates.js";
import userRoutes from "./routes/users.js";
import auditRoutes from "./routes/audit.js";
import dashboardRoutes from "./routes/dashboard.js";
import aiRoutes from "./routes/ai.js";
import importExportRoutes from "./routes/importExport.js";
import uploadRoutes from "./routes/uploads.js";

const app = express();
const PORT = Number(process.env.PORT || 4000);

app.use(cors({ origin: true, credentials: true }));
// Larger limit so base64 file uploads (spec sheets / images) fit in the body.
app.use(express.json({ limit: "30mb" }));
app.use(cookieParser());
app.use(attachUser);

// Health check
app.get("/api/health", (_req, res) => res.json({ ok: true, service: "PartPilot API" }));

// Auth is open; everything else requires a session.
app.use("/api/auth", authRoutes);
app.use("/api", requireAuth);

app.use("/api/part-numbers", partNumberRoutes);
app.use("/api/segments", segmentRoutes);
app.use("/api/companies", companyRoutes);
app.use("/api/products", productRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/templates", templateRoutes);
app.use("/api/users", userRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/uploads", uploadRoutes);
app.use("/api", importExportRoutes);

// ─── Serve the built SPA in production (if client/dist exists) ───────────────
// nginx proxies /partpilot/ -> this server with the prefix stripped, so the
// app serves static assets at "/" and falls back to index.html for SPA routes.
const clientDist = path.resolve(__dirname, "../../client/dist");
if (fs.existsSync(path.join(clientDist, "index.html"))) {
  app.use(express.static(clientDist));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next(); // unknown API path -> JSON 404 below
    res.sendFile(path.join(clientDist, "index.html"));
  });
  console.log("✓ Serving built SPA from", clientDist);
}

// Error handler — return a clean message for DB/validation errors.
app.use((err, _req, res, _next) => {
  console.error("[error]", err.sqlMessage || err.message || err);
  const msg = err.code === "ER_DUP_ENTRY" ? "That record already exists."
    : err.sqlMessage || err.message || "Internal server error";
  res.status(err.status || 500).json({ error: msg });
});

// Last-resort guards so a stray rejection can never take the whole API down.
process.on("unhandledRejection", (reason) => console.error("[unhandledRejection]", reason));
process.on("uncaughtException", (err) => console.error("[uncaughtException]", err));

async function start() {
  try {
    await pool.query("SELECT 1");
    console.log("✓ Connected to MySQL database:", process.env.DB_NAME || "partpilot");
  } catch (err) {
    console.error("✗ Cannot connect to MySQL. Is XAMPP MySQL running and DB 'partpilot' created?");
    console.error("  ", err.message);
    process.exit(1);
  }

  const results = await seed();
  console.log("✓ Migrate + seed:");
  for (const r of results) console.log("   -", r);

  app.listen(PORT, () => {
    console.log(`\n🚀 PartPilot API listening on http://localhost:${PORT}`);
    console.log("   Demo logins: master/master123 · creator/creator123 · viewer/viewer123");
  });
}

start();
