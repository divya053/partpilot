import { ReactNode, useState } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { AssistantDock } from "./AssistantDock";
import { Icon } from "./Icon";

const NAV = [
  { to: "/", icon: "grid", label: "Dashboard", end: true },
  { to: "/builder", icon: "sliders", label: "Part Number Builder" },
  { to: "/library", icon: "list", label: "Part Number Library" },
  { group: "Catalog" },
  { to: "/companies", icon: "building", label: "Companies" },
  { to: "/products", icon: "box", label: "Products" },
  { to: "/categories", icon: "tag", label: "Categories" },
  { group: "Configuration" },
  { to: "/attributes", icon: "adjust", label: "Attributes" },
  { to: "/values", icon: "rows", label: "Units & Values" },
  { to: "/model-config", icon: "box", label: "Model Config" },
  { to: "/templates", icon: "template", label: "Templates" },
  { group: "System" },
  { to: "/reports", icon: "bar", label: "Reports" },
  { to: "/import-export", icon: "swap", label: "Import / Export" },
  { to: "/users", icon: "users", label: "User Management", cap: "manage_users" },
  { to: "/audit", icon: "clock", label: "Audit Log" },
  { to: "/settings", icon: "gear", label: "Settings" },
];

export function Layout({ title, subtitle, actions, children }: {
  title: string; subtitle?: string; actions?: ReactNode; children: ReactNode;
}) {
  const { user, logout, can } = useAuth();
  const initials = (user?.displayName || "U").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const [navOpen, setNavOpen] = useState(false);
  const close = () => setNavOpen(false);

  return (
    <div className="app">
      <div className={"scrim" + (navOpen ? " show" : "")} onClick={close} />
      <aside className={"sidebar" + (navOpen ? " open" : "")}>
        <div className="brand">
          <div className="logo">PART<span>PILOT</span></div>
          <div className="tag">IKIO LED Lighting</div>
        </div>
        <nav className="nav">
          {NAV.map((item, i) =>
            "group" in item ? (
              <div key={i} className="group-label">{item.group}</div>
            ) : item.cap && !can(item.cap) ? null : (
              <NavLink key={item.to} to={item.to!} end={(item as any).end} onClick={close}
                className={({ isActive }) => (isActive ? "active" : "")}>
                <span className="ico"><Icon name={item.icon!} size={17} /></span>{item.label}
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
          <button title="Sign out" onClick={logout}><Icon name="power" size={17} /></button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="hamburger" aria-label="Open menu" onClick={() => setNavOpen(true)}><Icon name="menu" size={22} /></button>
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
