import { Link, useLocation } from "wouter";
import { Layers, PlusSquare, LayoutDashboard, Settings, Boxes, Users as UsersIcon, LogOut } from "lucide-react";
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

  const navigation = NAV.filter((item) => can(item.cap));
  const initials = (user?.displayName || user?.username || "?")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="min-h-screen flex bg-background w-full overflow-hidden">
      <div className="w-64 flex flex-col bg-sidebar border-r border-sidebar-border h-screen shrink-0">
        <div className="h-16 flex items-center px-6 border-b border-sidebar-border shrink-0">
          <Boxes className="w-6 h-6 text-sidebar-primary mr-3" />
          <span className="font-bold text-lg tracking-tight text-sidebar-foreground">PartPilot</span>
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
      <main className="flex-1 h-screen overflow-y-auto bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.08),transparent_22%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.95))] min-w-0">
        <div className="w-full px-6 py-6 xl:px-8 2xl:px-10">
          {children}
        </div>
      </main>
      <AssistantDock />
    </div>
  );
}
