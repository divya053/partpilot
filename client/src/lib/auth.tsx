import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { api } from "./api";
import { Role, User } from "./types";

const ROLE_CAPS: Record<Role, Set<string>> = {
  master: new Set(["read", "write", "delete", "manage_users", "import", "settings"]),
  creator: new Set(["read", "write", "import"]),
  viewer: new Set(["read"]),
};

interface AuthCtx {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  can: (cap: string) => boolean;
}

const Ctx = createContext<AuthCtx>(null!);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<User>("/auth/me").then(setUser).catch(() => setUser(null)).finally(() => setLoading(false));
  }, []);

  const login = async (username: string, password: string) => {
    const u = await api.post<User>("/auth/login", { username, password });
    setUser(u);
  };
  const logout = async () => {
    await api.post("/auth/logout");
    setUser(null);
  };
  const can = (cap: string) => (user ? ROLE_CAPS[user.role]?.has(cap) ?? false : false);

  return <Ctx.Provider value={{ user, loading, login, logout, can }}>{children}</Ctx.Provider>;
}
