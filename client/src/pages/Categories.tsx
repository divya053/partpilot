import { CrudPage, StatusBadge } from "../components/CrudPage";
import { Category } from "../lib/types";

export default function Categories() {
  return (
    <CrudPage<Category>
      title="Categories" subtitle="Fixture categories used to classify part numbers." endpoint="/categories" singular="Category"
      columns={[
        { header: "Category", editKey: "name", render: (r) => <strong>{r.name}</strong> },
        { header: "Code", editKey: "code", render: (r) => <span className="mono">{r.code || "—"}</span> },
        { header: "Description", editKey: "description", render: (r) => <span className="muted">{r.description || "—"}</span> },
        { header: "Status", editKey: "status", render: (r) => <StatusBadge status={r.status} /> },
      ]}
      fields={[
        { key: "name", label: "Category Name", required: true },
        { key: "code", label: "Code", hint: "Short code, e.g. HB" },
        { key: "description", label: "Description", type: "textarea" },
        { key: "status", label: "Status", type: "select", default: "active",
          options: [{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }] },
      ]}
    />
  );
}
