import { crudRouter } from "./crud.js";

export default crudRouter({
  table: "products",
  module: "Product",
  columns: ["name", "model_code", "category", "description", "status"],
  searchColumn: "name",
  label: (r) => r.name,
});
