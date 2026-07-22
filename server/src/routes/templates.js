import { crudRouter } from "./crud.js";

export default crudRouter({
  table: "templates",
  module: "Template",
  columns: ["name", "description", "segments", "created_by", "usage_count"],
  jsonColumns: ["segments"],
  searchColumn: "name",
  label: (r) => r.name,
});
