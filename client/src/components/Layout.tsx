import { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { AssistantDock } from "./AssistantDock";

const NAV = [
  { to: "/", icon: "▦", label: "Dashboard", end: true },
  { to: "/builder", icon: "⚙", label: "Part Number Builder" },
  { to: "/library", icon: "☰", label: "Part Number Library" },
  { group: "Catalog" },
  { to: "/companies", icon: "🏢", label: "Companies" },
  { to: "/products", icon: "📦", label: "Products" },
  { to: "/categories", icon: "🏷", label: "Categories" },
  { group: "Configuration" },
  { to: "/attributes", icon: "⛭", label: "Attributes" },
  { to: "/values", icon: "≣", label: "Units & Values" },
  { to: "/templates", icon: "▤", label: "Templates" },
  { group: "System" },
  { to: "/reports", icon: "📊", label: "Reports" },
  { to: "/import-export", icon: "⇅", label: "Import / Export" },
  { to: "/users", icon: "👤", label: "User Management", cap: "manage_users" },
  { to: "/audit", icon: "🕑", label: "Audit Log" },
  { to: "/settings", icon: "⚙", label: "Settings" },
];

export function Layout({ title, subtitle, actions, children }: {
  title: string; subtitle?: string; actions?: ReactNode; children: ReactNode;
}) {
  const { user, logout, can } = useAuth();
  const initials = (user?.displayName || "U").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="logo">PART<span>PILOT</span></div>
          <div className="tag">IKIO LED Lighting</div>
        </div>
        <nav className="nav">
          {NAV.map((item, i) =>
            "group" in item ? (
              <div key={i} className="group-label">{item.group}</div>
            ) : item.cap && !can(item.cap) ? null : (
              <NavLink key={item.to} to={item.to!} end={(item as any).end}
                className={({ isActive }) => (isActive ? "active" : "")}>
                <span className="ico">{item.icon}</span>{item.label}
              </NavLink>
            ),
          )}
        </nav>
        <div className="side-user">
          <div className="avatar">{initials}</div>
          <div>
            <div className="who">{user?.displayName}</div>
            <div className="role">{user?.role}</div>
          </div>
          <button title="Sign out" onClick={logout}>⏻</button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="title">
            <h1>{title}</h1>
            {subtitle && <p>{subtitle}</p>}
          </div>
          {actions && <div className="actions">{actions}</div>}
        </header>
        <main className="content">{children}</main>
      </div>

      <AssistantDock />
    </div>
  );
}
