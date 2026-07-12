import type { Request, Response, NextFunction } from "express";
import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { eq } from "drizzle-orm";
import { db, usersTable, type Role } from "@workspace/db";

const scryptAsync = promisify(scrypt);

// ─── Session config ──────────────────────────────────────────────────────────

export const SESSION_COOKIE = "sid";
export const SESSION_SECRET =
  process.env.SESSION_SECRET?.trim() || "dev-insecure-secret-change-in-production";
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// When the app is mounted under a subpath (e.g. behind CloudPanel at
// /partpilot), scope the session cookie to that prefix so it doesn't collide
// with cookies from other apps on the same domain. Defaults to "/" (root/
// subdomain deploys). Must match the front-end base path.
const SESSION_COOKIE_PATH = process.env.SESSION_COOKIE_PATH?.trim() || "/";

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  signed: true,
  maxAge: SESSION_MAX_AGE_MS,
  path: SESSION_COOKIE_PATH,
};

// ─── Password hashing (scrypt, no external deps) ─────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1], "hex");
  const expected = Buffer.from(parts[2], "hex");
  const derived = (await scryptAsync(password, salt, expected.length)) as Buffer;
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

// ─── Roles & capabilities ────────────────────────────────────────────────────

export type Capability =
  | "view"
  | "create"
  | "edit"
  | "delete"
  | "duplicate"
  | "manageSegments"
  | "import"
  | "manageUsers";

const ROLE_CAPS: Record<Role, Capability[]> = {
  master: ["view", "create", "edit", "delete", "duplicate", "manageSegments", "import", "manageUsers"],
  creator: ["view", "create", "edit", "duplicate"],
  viewer: ["view"],
};

export function isRole(value: unknown): value is Role {
  return value === "master" || value === "creator" || value === "viewer";
}

export function can(role: Role | undefined | null, capability: Capability): boolean {
  if (!role) return false;
  return ROLE_CAPS[role]?.includes(capability) ?? false;
}

export interface AuthUser {
  id: number;
  username: string;
  displayName: string;
  role: Role;
}

// Make req.user available to route handlers.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser | null;
    }
  }
}

// ─── Middleware ──────────────────────────────────────────────────────────────

/** Reads the signed session cookie, loads the user, and attaches req.user. */
export async function attachUser(req: Request, _res: Response, next: NextFunction): Promise<void> {
  req.user = null;
  const raw = req.signedCookies?.[SESSION_COOKIE];
  const id = Number(raw);
  if (raw && Number.isInteger(id) && id > 0) {
    try {
      const [row] = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
      if (row && isRole(row.role)) {
        req.user = {
          id: row.id,
          username: row.username,
          displayName: row.displayName,
          role: row.role,
        };
      }
    } catch {
      req.user = null;
    }
  }
  next();
}

/** Blocks unauthenticated requests. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }
  next();
}

/** Blocks requests whose role lacks the given capability. */
export function requireCap(capability: Capability) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required." });
      return;
    }
    if (!can(req.user.role, capability)) {
      res.status(403).json({
        error: `Your role (${req.user.role}) is not allowed to ${capability}.`,
      });
      return;
    }
    next();
  };
}
