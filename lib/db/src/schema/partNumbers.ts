import { pgTable, serial, text, integer, boolean, timestamp, jsonb, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ─── Part Numbers ────────────────────────────────────────────────────────────

export const partNumbersTable = pgTable("part_numbers", {
  id: serial("id").primaryKey(),

  // Generated composite part number (computed from segments)
  partNumber: text("part_number").notNull().unique(),

  // Product metadata
  productCategory: text("product_category").notNull(),
  productName: text("product_name").notNull(),
  sku: text("sku"),
  productDescription: text("product_description"),
  internalNotes: text("internal_notes"),

  // Core required segments
  company: text("company").notNull().default("IK"),
  productModel: text("product_model").notNull(),      // UHB, RHB, LHB, etc.
  versionVariant: text("version_variant").notNull(),   // 1, 2, 0A, AB, etc.
  sizeVariant: text("size_variant").notNull(),         // 01, 02, etc.
  powerType: text("power_type").notNull(),             // F or S
  maxPower: text("max_power").notNull(),               // 0240, 0150, etc.
  voltageRange: text("voltage_range").notNull(),       // LV, MV, HV, MS
  dimming: text("dimming").notNull(),                  // D or N
  cct: text("cct").notNull(),                         // CCT, 30K, 40K, etc.
  lightDistribution: text("light_distribution").notNull(), // ND, WD, UD, T2-T5
  driver: text("driver").notNull(),                   // 00-14
  finish: text("finish").notNull(),                   // BK, WH, BR, GR, SL, BN
  manufacturer: text("manufacturer").notNull(),        // BFU

  // Optional add-on segments
  lensType: text("lens_type"),                        // L: SC, SF, SM
  emergencyOption: text("emergency_option"),           // X: EM, EM2, EM5, etc.
  sensorOption: text("sensor_option"),                 // Y: MWS, PIR, PC
  surgeProtection: text("surge_protection"),           // S: 10SP, 20SP
  reflectorCover: text("reflector_cover"),             // R: PCR, ALR
  mountingOption: text("mounting_option"),             // M: SM, PM, YM, SLF, POM, FM
  photocontrolOption: text("photocontrol_option"),     // P: 3RP, 3NP, 5RP, etc.
  connectableOption: text("connectable_option"),       // C: CN, N, XL, 2L-6L
  base: text("base"),                                 // B: E39, EX39, G24, GX23, E26

  // Status lifecycle
  status: text("status").notNull().default("draft"), // draft | active | deprecated

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertPartNumberSchema = createInsertSchema(partNumbersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPartNumber = z.infer<typeof insertPartNumberSchema>;
export type PartNumber = typeof partNumbersTable.$inferSelect;

// ─── Segment Values ───────────────────────────────────────────────────────────

export const segmentValuesTable = pgTable("segment_values", {
  id: serial("id").primaryKey(),
  segmentKey: text("segment_key").notNull(),   // e.g. "productModel", "cct"
  code: text("code").notNull(),                // e.g. "UHB", "40K"
  description: text("description").notNull(),  // e.g. "UFO High Bay"
  applicableProducts: jsonb("applicable_products").$type<string[]>().default([]),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
}, (table) => [
  unique("segment_values_key_code_unique").on(table.segmentKey, table.code),
]);

export const insertSegmentValueSchema = createInsertSchema(segmentValuesTable).omit({
  id: true,
});

export type InsertSegmentValue = z.infer<typeof insertSegmentValueSchema>;
export type SegmentValue = typeof segmentValuesTable.$inferSelect;
