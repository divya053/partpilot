import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Layers, PlusSquare, LayoutDashboard, Settings, Boxes, Users as UsersIcon, LogOut, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { AssistantDock } from "@/components/ai/assistant-dock";
import { useAuth, ROLE_LABELS, type Capability } from "@/lib/auth";
import { Button } from "@/components/ui/button";

interface LayoutProps {
  children: React.ReactNode;
}

const NAV: Array<{ name: string; href: string; icon: typeof Layers; cap: Capability }> = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard, cap: "view" },
  { name: "Part Builder", href: "/builder", icon: PlusSquare, cap: "create" },
  { name: "Library", href: "/library", icon: Layers, cap: "view" },
  { name: "Segments", href: "/segments", icon: Settings, cap: "view" },
  { name: "Users", href: "/users", icon: UsersIcon, cap: "manageUsers" },
];

const ROLE_BADGE: Record<string, string> = {
  master: "bg-primary/20 text-primary",
  creator: "bg-emerald-500/20 text-emerald-400",
  viewer: "bg-sidebar-foreground/15 text-sidebar-foreground/70",
};

export function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const { user, can, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setMobileOpen(false);
  }, [location]);

  const navigation = NAV.filter((item) => can(item.cap));
  const initials = (user?.displayName || user?.username || "?")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="min-h-screen flex bg-background w-full">
      {/* Mobile top bar */}
      <header className="lg:hidden fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-3 border-b border-sidebar-border bg-sidebar px-4">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
          className="-ml-1 p-1 text-sidebar-foreground"
        >
          <Menu className="h-6 w-6" />
        </button>
        <Boxes className="h-5 w-5 text-sidebar-primary" />
        <span className="font-bold tracking-tight text-sidebar-foreground">PartPilot</span>
      </header>

      {/* Backdrop for the mobile drawer */}
      {mobileOpen ? (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      ) : null}

      {/* Sidebar — static on desktop, slide-in drawer on mobile */}
      <div
        className={cn(
          "w-64 flex flex-col bg-sidebar border-r border-sidebar-border h-screen shrink-0",
          "fixed inset-y-0 left-0 z-50 transition-transform duration-200 lg:static lg:z-auto",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        <div className="h-16 flex items-center px-6 border-b border-sidebar-border shrink-0">
          <Boxes className="w-6 h-6 text-sidebar-primary mr-3" />
          <span className="font-bold text-lg tracking-tight text-sidebar-foreground">PartPilot</span>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
            className="ml-auto lg:hidden text-sidebar-foreground/70 hover:text-sidebar-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex-1 py-6 px-4 space-y-1 overflow-y-auto">
          {navigation.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link key={item.name} href={item.href}>
                <div
                  className={cn(
                    "flex items-center px-3 py-2.5 rounded-md text-sm font-medium transition-colors cursor-pointer group",
                    isActive
                      ? "bg-sidebar-primary text-sidebar-primary-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  )}
                >
                  <item.icon
                    className={cn(
                      "mr-3 flex-shrink-0 h-5 w-5",
                      isActive ? "text-sidebar-primary-foreground" : "text-sidebar-foreground group-hover:text-sidebar-accent-foreground"
                    )}
                    aria-hidden="true"
                  />
                  {item.name}
                </div>
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-sidebar-border">
          <div className="flex items-center">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-violet-500 flex items-center justify-center text-white font-bold text-sm shrink-0">
              {initials}
            </div>
            <div className="ml-3 min-w-0 flex-1">
              <p className="text-sm font-medium text-sidebar-foreground truncate">{user?.displayName ?? "—"}</p>
              {user ? (
                <span className={cn("mt-0.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide", ROLE_BADGE[user.role] ?? ROLE_BADGE.viewer)}>
                  {ROLE_LABELS[user.role]}
                </span>
              ) : null}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-sidebar-foreground/60 hover:bg-white/10 hover:text-white"
              onClick={() => void logout()}
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <main className="flex-1 h-screen overflow-y-auto bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.08),transparent_22%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.95))] min-w-0 pt-14 lg:pt-0">
        <div className="w-full px-4 py-4 sm:px-6 sm:py-6 xl:px-8 2xl:px-10">
          {children}
        </div>
      </main>
      <AssistantDock />
    </div>
  );
}
