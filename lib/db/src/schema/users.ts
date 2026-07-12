import { mysqlTable, int, text, timestamp } from "drizzle-orm/mysql-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ─── Users & Roles ───────────────────────────────────────────────────────────
// Roles: master (full control), creator (build/edit parts), viewer (read only)

export const usersTable = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  username: text("username").notNull(), // unique enforced by DB migration (users_username_unique)
  displayName: text("display_name").notNull(),
  role: text("role").notNull().default("viewer"), // master | creator | viewer
  passwordHash: text("password_hash").notNull(), // scrypt$<saltHex>$<hashHex>
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type UserRow = typeof usersTable.$inferSelect;

export type Role = "master" | "creator" | "viewer";
