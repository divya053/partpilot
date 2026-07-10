import { Link, useLocation } from "wouter";
import { Layers, PlusSquare, LayoutDashboard, Settings, Boxes } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [location] = useLocation();

  const navigation = [
    { name: "Dashboard", href: "/", icon: LayoutDashboard },
    { name: "Part Builder", href: "/builder", icon: PlusSquare },
    { name: "Library", href: "/library", icon: Layers },
    { name: "Segments", href: "/segments", icon: Settings },
  ];

  return (
    <div className="min-h-screen flex bg-background w-full overflow-hidden">
      <div className="w-64 flex flex-col bg-sidebar border-r border-sidebar-border h-screen shrink-0">
        <div className="h-16 flex items-center px-6 border-b border-sidebar-border shrink-0">
          <Boxes className="w-6 h-6 text-sidebar-primary mr-3" />
          <span className="font-bold text-lg tracking-tight text-sidebar-foreground">IK PORTAL</span>
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
            <div className="w-8 h-8 rounded-full bg-sidebar-accent flex items-center justify-center text-sidebar-accent-foreground font-bold text-sm shrink-0">
              IK
            </div>
            <div className="ml-3 overflow-hidden">
              <p className="text-sm font-medium text-sidebar-foreground truncate">Engineer</p>
              <p className="text-xs text-sidebar-foreground/60 truncate">Systems Admin</p>
            </div>
          </div>
        </div>
      </div>
      <main className="flex-1 h-screen overflow-y-auto bg-background">
        <div className="max-w-7xl mx-auto w-full">
          {children}
        </div>
      </main>
    </div>
  );
}
