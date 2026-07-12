import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getCurrentUser,
  loginUser,
  logoutUser,
  type AuthUser,
  type Role,
} from "@workspace/api-client-react";

export type Capability =
  | "view"
  | "create"
  | "edit"
  | "delete"
  | "duplicate"
  | "manageSegments"
  | "import"
  | "manageUsers";

// Mirror of the server-side permission matrix (server still enforces it).
const ROLE_CAPS: Record<Role, Capability[]> = {
  master: ["view", "create", "edit", "delete", "duplicate", "manageSegments", "import", "manageUsers"],
  creator: ["view", "create", "edit", "duplicate"],
  viewer: ["view"],
};

export const ROLE_LABELS: Record<Role, string> = {
  master: "Master",
  creator: "Creator",
  viewer: "Viewer",
};

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  can: (capability: Capability) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await getCurrentUser();
      setUser(res.user ?? null);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await getCurrentUser();
        if (active) setUser(res.user ?? null);
      } catch {
        if (active) setUser(null);
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(
    async (username: string, password: string) => {
      const authed = await loginUser({ username, password });
      setUser(authed);
      // Drop any cached anonymous/401 responses so pages refetch as this user.
      queryClient.clear();
      return authed;
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    try {
      await logoutUser();
    } finally {
      setUser(null);
      queryClient.clear();
    }
  }, [queryClient]);

  const can = useCallback(
    (capability: Capability) => (user ? (ROLE_CAPS[user.role]?.includes(capability) ?? false) : false),
    [user],
  );

  const value = useMemo(
    () => ({ user, isLoading, login, logout, refresh, can }),
    [user, isLoading, login, logout, refresh, can],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
