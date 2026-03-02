import { useEffect, useState } from "react";

type MeResponse = {
  clientPrincipal?: {
    userId?: string;
    userDetails?: string;
    identityProvider?: string;
    userRoles?: string[];
  };
};

export function useAuth() {
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | undefined>();
  const [userDetails, setUserDetails] = useState<string | undefined>();
  const [identityProvider, setIdentityProvider] = useState<string | undefined>();
  const [userRoles, setUserRoles] = useState<string[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/.auth/me")
      .then((res) => res.json() as Promise<MeResponse>)
      .then((data) => {
        if (!active) return;
        const roles = data.clientPrincipal?.userRoles || [];
        setUserId(data.clientPrincipal?.userId);
        setUserDetails(data.clientPrincipal?.userDetails);
        setIdentityProvider(data.clientPrincipal?.identityProvider);
        setUserRoles(roles);
        setIsAdmin(roles.includes("administrator"));
      })
      .catch(() => {
        if (!active) return;
        setUserId(undefined);
        setUserDetails(undefined);
        setIdentityProvider(undefined);
        setUserRoles([]);
        setIsAdmin(false);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const isAuthenticated = Boolean(userId || userDetails);
  return { loading, isAdmin, isAuthenticated, userId, userDetails, identityProvider, userRoles };
}
