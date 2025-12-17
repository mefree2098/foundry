import { useEffect, useState } from "react";

type MeResponse = {
  clientPrincipal?: {
    userId?: string;
    userDetails?: string;
    userRoles?: string[];
  };
};

export function useAuth() {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/.auth/me")
      .then((res) => res.json() as Promise<MeResponse>)
      .then((data) => {
        if (!active) return;
        const roles = data.clientPrincipal?.userRoles || [];
        setIsAdmin(roles.includes("administrator"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return { loading, isAdmin };
}
