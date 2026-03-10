"use client";

// ============================================================
// AuthContext — shared Supabase auth state across the app
// ============================================================

import React, { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { supabase } from "./supabase";

interface AuthContextValue {
  user: User | null;
  accessToken: string | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Populate initial auth state from the current session.
    // Wrapped in try/catch because the Supabase JS client internally decodes
    // the JWT to read its payload. When NEXT_PUBLIC_SUPABASE_ANON_KEY is the
    // placeholder value (malformed signature), decode throws a TypeError
    // ("Cannot read properties of undefined (reading 'payload')") which
    // would otherwise surface as an uncaught promise rejection.
    Promise.all([
      supabase.auth.getUser(),
      supabase.auth.getSession(),
    ]).then(([{ data: userData }, { data: sessionData }]) => {
      const verifiedUser = userData.user ?? null;
      setUser(verifiedUser);
      // Only use the access token when getUser() confirmed the session is valid.
      // getSession() reads from local storage without server validation and can
      // return a stale/expired token after a page refresh. Sending that expired
      // token to the backend triggers 401 even on get_optional_user endpoints.
      setAccessToken(verifiedUser ? (sessionData.session?.access_token ?? null) : null);
      setLoading(false);
    }).catch(() => {
      // Auth unavailable (misconfigured Supabase env vars or network error).
      // Resolve loading so the app renders in anonymous mode.
      setUser(null);
      setLoading(false);
    });

    // Keep state in sync with Supabase auth events.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      switch (event) {
        case "SIGNED_IN":
        case "TOKEN_REFRESHED":
        case "PASSWORD_RECOVERY":
          setUser(session?.user ?? null);
          setAccessToken(session?.access_token ?? null);
          break;
        case "SIGNED_OUT":
          setUser(null);
          setAccessToken(null);
          break;
        default:
          break;
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    router.push("/sign-in");
  };

  return (
    <AuthContext.Provider value={{ user, accessToken, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * useAuth — consume the shared auth state.
 * Must be called inside a component wrapped by AuthProvider.
 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (ctx === null) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
