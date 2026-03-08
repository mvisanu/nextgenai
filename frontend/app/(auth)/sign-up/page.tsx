"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle } from "lucide-react";
import { supabase } from "../../lib/supabase";

export default function SignUp() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    setError("");
    setInfo("");

    try {
      const { data, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: (process.env.NEXT_PUBLIC_SITE_URL ?? "") + "/sign-in",
        },
      });

      if (authError) {
        const msg = authError.message;
        if (msg.includes("User already registered") || msg.includes("already been registered")) {
          setError("An account with this email already exists.");
        } else if (msg.includes("Password should be") || msg.includes("weak")) {
          setError("Password must be at least 8 characters.");
        } else {
          setError(msg);
        }
        return;
      }

      if (data.user && !data.session) {
        setInfo("Check your email for a confirmation link.");
      } else if (data.session) {
        router.push("/");
      }
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
            SIGN UP
          </span>
        </div>

        {/* Info / confirmation banner */}
        {info && (
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
            <span>{info}</span>
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
              autoComplete="new-password"
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

          {/* Confirm Password */}
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
              CONFIRM PASSWORD
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
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
              "CREATE ACCOUNT"
            )}
          </button>
        </form>

        {/* Footer link */}
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.65rem",
            color: "hsl(var(--text-dim))",
            textAlign: "center",
            margin: 0,
          }}
        >
          Already have an account?{" "}
          <a
            href="/sign-in"
            style={{
              color: "hsl(var(--col-green))",
              textDecoration: "none",
              letterSpacing: "0.05em",
            }}
          >
            SIGN IN
          </a>
        </p>
      </div>
    </div>
  );
}
