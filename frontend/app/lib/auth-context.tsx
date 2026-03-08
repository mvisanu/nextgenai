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
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
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
