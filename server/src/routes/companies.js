import { crudRouter } from "./crud.js";

export default crudRouter({
  table: "companies",
  module: "Company",
  columns: ["name", "type", "contact_name", "email", "phone", "status", "notes"],
  searchColumn: "name",
  label: (r) => r.name,
});
