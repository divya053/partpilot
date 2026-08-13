import { CrudPage, StatusBadge } from "../components/CrudPage";
import { Product } from "../lib/types";

export default function Products() {
  return (
    <CrudPage<Product>
      title="Products" subtitle="Manage the product families behind your part numbers." endpoint="/products" singular="Product"
      columns={[
        { header: "Product Name", editKey: "name", render: (r) => <strong>{r.name}</strong> },
        { header: "Model Code", editKey: "model_code", render: (r) => <span className="mono">{r.model_code || "—"}</span> },
        { header: "Category", editKey: "category", render: (r) => r.category },
        { header: "Status", editKey: "status", render: (r) => <StatusBadge status={r.status} /> },
      ]}
      fields={[
        { key: "name", label: "Product Name", required: true },
        { key: "model_code", label: "Model Code", hint: "e.g. UHB, RHB, LHB" },
        { key: "category", label: "Category", required: true },
        { key: "description", label: "Description", type: "textarea" },
        { key: "status", label: "Status", type: "select", default: "active",
          options: [{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }] },
      ]}
    />
  );
}
