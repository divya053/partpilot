import { CrudPage, StatusBadge } from "../components/CrudPage";
import { Company } from "../lib/types";

const TYPE_LABEL: Record<string, string> = {
  contractor: "Contractor", distributor: "Distributor",
  manufacturer_rep: "Manufacturer Rep", other: "Other",
};

export default function Companies() {
  return (
    <CrudPage<Company>
      title="Companies" subtitle="Manage companies, customers and distributors." endpoint="/companies" singular="Company"
      columns={[
        { header: "Company Name", editKey: "name", render: (r) => <strong>{r.name}</strong> },
        { header: "Type", editKey: "type", render: (r) => TYPE_LABEL[r.type] || r.type },
        { header: "Contact", editKey: "contact_name", render: (r) => r.contact_name || "—" },
        { header: "Email", editKey: "email", render: (r) => <span className="muted">{r.email || "—"}</span> },
        { header: "Status", editKey: "status", render: (r) => <StatusBadge status={r.status} /> },
      ]}
      fields={[
        { key: "name", label: "Company Name", required: true },
        { key: "type", label: "Type", type: "select", default: "contractor",
          options: [
            { value: "contractor", label: "Contractor" },
            { value: "distributor", label: "Distributor" },
            { value: "manufacturer_rep", label: "Manufacturer Rep" },
            { value: "other", label: "Other" },
          ] },
        { key: "contact_name", label: "Contact Name" },
        { key: "email", label: "Email", type: "email" },
        { key: "phone", label: "Phone" },
        { key: "status", label: "Status", type: "select", default: "active",
          options: [{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }] },
        { key: "notes", label: "Notes", type: "textarea" },
      ]}
    />
  );
}
