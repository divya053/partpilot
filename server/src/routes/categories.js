import { crudRouter } from "./crud.js";

export default crudRouter({
  table: "categories",
  module: "Category",
  columns: ["name", "code", "description", "status"],
  searchColumn: "name",
  label: (r) => r.name,
});
