import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./lib/auth";
import { Spinner } from "./components/ui";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Builder from "./pages/Builder";
import Library from "./pages/Library";
import PartDetail from "./pages/PartDetail";
import Companies from "./pages/Companies";
import Products from "./pages/Products";
import Categories from "./pages/Categories";
import Attributes from "./pages/Attributes";
import UnitsValues from "./pages/UnitsValues";
import Templates from "./pages/Templates";
import Reports from "./pages/Reports";
import ImportExport from "./pages/ImportExport";
import Users from "./pages/Users";
import AuditLog from "./pages/AuditLog";
import Settings from "./pages/Settings";

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center" }}><Spinner /></div>;
  if (!user) return <Login />;

  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/builder" element={<Builder />} />
      <Route path="/builder/:id" element={<Builder />} />
      <Route path="/library" element={<Library />} />
      <Route path="/part/:id" element={<PartDetail />} />
      <Route path="/companies" element={<Companies />} />
      <Route path="/products" element={<Products />} />
      <Route path="/categories" element={<Categories />} />
      <Route path="/attributes" element={<Attributes />} />
      <Route path="/values" element={<UnitsValues />} />
      <Route path="/templates" element={<Templates />} />
      <Route path="/reports" element={<Reports />} />
      <Route path="/import-export" element={<ImportExport />} />
      <Route path="/users" element={<Users />} />
      <Route path="/audit" element={<AuditLog />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
