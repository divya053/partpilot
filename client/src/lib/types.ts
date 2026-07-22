export type Role = "master" | "creator" | "viewer";

export interface User {
  id: number;
  username: string;
  displayName: string;
  role: Role;
  status?: string;
  createdAt?: string;
}

export interface SegmentDef {
  key: string;
  label: string;
  help?: string;
  letter?: string;
  required?: boolean;
  valueCount?: number;
  activeCount?: number;
}

export interface SegmentValue {
  id: number;
  segment_key: string;
  code: string;
  description: string;
  applicable_products: string[];
  sort_order: number;
  is_active: number;
}

export interface Segment { label: string; value: string; }

export interface PartNumber {
  id: number;
  partNumber: string;
  productCategory: string;
  productName: string;
  sku?: string | null;
  productDescription?: string | null;
  internalNotes?: string | null;
  vendorName?: string | null;
  productStage?: string | null;
  vendorSpecSheet?: string | null;
  ikioSpecSheet?: string | null;
  companyId?: number | null;
  company_name?: string | null;
  status: string;
  createdBy?: string | null;
  created_at?: string;
  segments: Segment[];
  [key: string]: unknown;
}

export interface Company {
  id: number; name: string; type: string; contact_name?: string;
  email?: string; phone?: string; status: string; notes?: string; created_at?: string;
}
export interface Product {
  id: number; name: string; model_code?: string; category: string;
  description?: string; status: string; created_at?: string;
}
export interface Category {
  id: number; name: string; code?: string; description?: string; status: string; created_at?: string;
}
export interface Template {
  id: number; name: string; description?: string; segments: string[];
  created_by?: string; usage_count: number; created_at?: string;
}
export interface AuditEntry {
  id: number; user_name?: string; module: string; action: string;
  details?: string; ip_address?: string; created_at: string;
}
