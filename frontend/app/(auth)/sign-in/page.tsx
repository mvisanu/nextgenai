"use client";

import React, { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, CheckCircle } from "lucide-react";
import { supabase } from "../../lib/supabase";

function SignInInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (searchParams.get("message") === "password-updated") {
      setMessage("Your password has been updated.");
    }
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        const msg = authError.message;
        if (msg.includes("Invalid login credentials")) {
          setError("Invalid email or password.");
        } else if (msg.includes("Email not confirmed")) {
          setError("Please confirm your email before signing in.");
        } else if (/rate limit|too many/i.test(msg)) {
          setError("Too many attempts. Please wait before trying again.");
        } else {
          setError(msg);
        }
        return;
      }

      const next = searchParams.get("next");
      const validNext =
        next && next.startsWith("/") && !next.includes("://") && !next.startsWith("//")
          ? next
          : null;
      router.push(validNext ?? "/");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        height: "calc(100vh - 46px)",
        background: "hsl(var(--bg-void))",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
    >
      <div
        style={{
          background: "hsl(var(--bg-surface))",
          border: "1px solid hsl(var(--border-base))",
          borderRadius: "2px",
          width: "100%",
          maxWidth: "420px",
          padding: "32px",
          display: "flex",
          flexDirection: "column",
          gap: "24px",
        }}
      >
        {/* Heading */}
        <div className="panel-hdr">
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "0.75rem",
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "hsl(var(--col-green))",
            }}
          >
            SIGN IN
          </span>
        </div>

        {/* Info / success banner */}
        {message && (
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "8px",
              padding: "10px 12px",
              background: "hsl(var(--col-cyan) / 0.1)",
              border: "1px solid hsl(var(--col-cyan) / 0.3)",
              borderRadius: "2px",
              color: "hsl(var(--col-cyan))",
              fontFamily: "var(--font-mono)",
              fontSize: "0.72rem",
              lineHeight: 1.5,
            }}
          >
            <CheckCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{message}</span>
          </div>
        )}

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          style={{ display: "flex", flexDirection: "column", gap: "16px" }}
        >
          {/* Email */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.65rem",
                letterSpacing: "0.1em",
                color: "hsl(var(--text-dim))",
                textTransform: "uppercase",
              }}
            >
              EMAIL
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.8rem",
                background: "hsl(var(--bg-void))",
                border: "1px solid hsl(var(--border-base))",
                borderRadius: "2px",
                padding: "8px 10px",
                color: "inherit",
                width: "100%",
                outline: "none",
              }}
              onFocus={(e) => (e.target.style.borderColor = "hsl(var(--col-green))")}
              onBlur={(e) => (e.target.style.borderColor = "hsl(var(--border-base))")}
            />
          </div>

          {/* Password */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.65rem",
                letterSpacing: "0.1em",
                color: "hsl(var(--text-dim))",
                textTransform: "uppercase",
              }}
            >
              PASSWORD
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.8rem",
                background: "hsl(var(--bg-void))",
                border: "1px solid hsl(var(--border-base))",
                borderRadius: "2px",
                padding: "8px 10px",
                color: "inherit",
                width: "100%",
                outline: "none",
              }}
              onFocus={(e) => (e.target.style.borderColor = "hsl(var(--col-green))")}
              onBlur={(e) => (e.target.style.borderColor = "hsl(var(--border-base))")}
            />
          </div>

          {/* Error banner */}
          {error && (
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "8px",
                padding: "10px 12px",
                background: "hsl(var(--col-red) / 0.1)",
                border: "1px solid hsl(var(--col-red) / 0.3)",
                borderRadius: "2px",
                color: "hsl(var(--col-red))",
                fontFamily: "var(--font-mono)",
                fontSize: "0.72rem",
                lineHeight: 1.5,
              }}
            >
              <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{error}</span>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            style={{
              background: loading
                ? "hsl(var(--col-green) / 0.08)"
                : "hsl(var(--col-green) / 0.15)",
              border: "1px solid hsl(var(--col-green))",
              borderRadius: "2px",
              padding: "10px 16px",
              width: "100%",
              color: "hsl(var(--col-green))",
              fontFamily: "var(--font-display)",
              fontSize: "0.6rem",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              cursor: loading ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
            }}
          >
            {loading ? (
              <>
                <span
                  style={{
                    width: 12,
                    height: 12,
                    border: "2px solid hsl(var(--col-green) / 0.3)",
                    borderTopColor: "hsl(var(--col-green))",
                    borderRadius: "50%",
                    display: "inline-block",
                    animation: "spin 0.8s linear infinite",
                  }}
                />
                LOADING...
              </>
            ) : (
              "SIGN IN"
            )}
          </button>
        </form>

        {/* Footer links */}
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <p
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.65rem",
              color: "hsl(var(--text-dim))",
              textAlign: "center",
              margin: 0,
            }}
          >
            Don&apos;t have an account?{" "}
            <a
              href="/sign-up"
              style={{
                color: "hsl(var(--col-green))",
                textDecoration: "none",
                letterSpacing: "0.05em",
              }}
            >
              SIGN UP
            </a>
          </p>
          <p
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.65rem",
              color: "hsl(var(--text-dim))",
              textAlign: "center",
              margin: 0,
            }}
          >
            <a
              href="/forgot-password"
              style={{
                color: "hsl(var(--col-green))",
                textDecoration: "none",
                letterSpacing: "0.05em",
              }}
            >
              Forgot password?
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function SignIn() {
  return (
    <React.Suspense fallback={null}>
      <SignInInner />
    </React.Suspense>
  );
}
