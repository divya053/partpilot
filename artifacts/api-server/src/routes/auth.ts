import { Router } from "express";
import { eq, and, ne, count } from "drizzle-orm";
import { db, usersTable, type UserRow, type Role } from "@workspace/db";
import {
  LoginUserBody,
  CreateUserBody,
  UpdateUserBody,
  type AuthUser,
  type AuthMeResponse,
  type OkResponse,
} from "@workspace/api-zod";
import {
  hashPassword,
  verifyPassword,
  requireCap,
  isRole,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "../lib/auth";

const router = Router();

function toAuthUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    role: (isRole(row.role) ? row.role : "viewer") as Role,
  };
}

async function masterCount(): Promise<number> {
  const [{ c }] = await db
    .select({ c: count() })
    .from(usersTable)
    .where(eq(usersTable.role, "master"));
  return Number(c);
}

// ─── Session ─────────────────────────────────────────────────────────────────

router.post("/login", async (req, res) => {
  const parsed = LoginUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { username, password } = parsed.data;
  const [row] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.username, username))
    .limit(1);

  // Always run a hash comparison to avoid trivial user-enumeration timing.
  const ok = row ? await verifyPassword(password, row.passwordHash) : false;
  if (!row || !ok) {
    res.status(401).json({ error: "Invalid username or password." });
    return;
  }

  res.cookie(SESSION_COOKIE, String(row.id), sessionCookieOptions);
  res.json(toAuthUser(row));
});

router.post("/logout", (_req, res) => {
  res.clearCookie(SESSION_COOKIE, { ...sessionCookieOptions, maxAge: undefined });
  const payload: OkResponse = { ok: true };
  res.json(payload);
});

router.get("/me", (req, res) => {
  const payload: AuthMeResponse = { user: req.user ?? null };
  res.json(payload);
});

// ─── User management (master only) ───────────────────────────────────────────

router.get("/users", requireCap("manageUsers"), async (_req, res) => {
  const rows = await db.select().from(usersTable).orderBy(usersTable.id);
  res.json(rows.map(toAuthUser));
});

router.post("/users", requireCap("manageUsers"), async (req, res) => {
  const parsed = CreateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { username, displayName, password, role } = parsed.data;

  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.username, username))
    .limit(1);
  if (existing) {
    res.status(409).json({ error: `Username "${username}" already exists.` });
    return;
  }

  const passwordHash = await hashPassword(password);
  const [{ id }] = await db
    .insert(usersTable)
    .values({ username, displayName, role, passwordHash })
    .$returningId();
  const [created] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  res.status(201).json(toAuthUser(created));
});

router.patch("/users/:id", requireCap("manageUsers"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = UpdateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
  if (!existing) {
    res.status(404).json({ error: "User not found." });
    return;
  }

  const updates: Partial<typeof usersTable.$inferInsert> = {};
  if (parsed.data.displayName) updates.displayName = parsed.data.displayName;
  if (parsed.data.password) updates.passwordHash = await hashPassword(parsed.data.password);
  if (parsed.data.role) {
    // Don't let the last master be demoted (would lock out user management).
    if (existing.role === "master" && parsed.data.role !== "master" && (await masterCount()) <= 1) {
      res.status(400).json({ error: "Cannot demote the last master." });
      return;
    }
    updates.role = parsed.data.role;
  }

  if (Object.keys(updates).length === 0) {
    res.json(toAuthUser(existing));
    return;
  }

  await db.update(usersTable).set({ ...updates, updatedAt: new Date() }).where(eq(usersTable.id, id));
  const [updated] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  res.json(toAuthUser(updated));
});

router.delete("/users/:id", requireCap("manageUsers"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  if (req.user && req.user.id === id) {
    res.status(400).json({ error: "You cannot delete your own account." });
    return;
  }

  const [existing] = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
  if (!existing) {
    res.status(404).json({ error: "User not found." });
    return;
  }
  if (existing.role === "master" && (await masterCount()) <= 1) {
    res.status(400).json({ error: "Cannot delete the last master." });
    return;
  }

  // `and`/`ne` imported to keep intent explicit even for the simple delete.
  await db.delete(usersTable).where(and(eq(usersTable.id, id), ne(usersTable.id, req.user!.id)));
  res.status(204).send();
});

export default router;
