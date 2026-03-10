"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle } from "lucide-react";
import { supabase } from "../../lib/supabase";
import type { AuthChangeEvent } from "@supabase/supabase-js";

export default function ResetPassword() {
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    // With PKCE flow (via /auth/callback), the code exchange completes before
    // the user lands on this page, so the session is already established.
    // Read it directly via getSession() rather than waiting for the event.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setReady(true);
      }
    });

    // Keep onAuthStateChange as a fallback for direct token-in-URL (implicit) links.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: AuthChangeEvent) => {
      if (event === "PASSWORD_RECOVERY") {
        setReady(true);
      } else if (event === "SIGNED_OUT" && !ready) {
        setExpired(true);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
    // ready intentionally excluded: we only want to capture the initial SIGNED_OUT
    // before the PASSWORD_RECOVERY event has fired
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const { error: authError } = await supabase.auth.updateUser({ password });

      if (authError) {
        const msg = authError.message;
        if (/expired|invalid/i.test(msg)) {
          setExpired(true);
        } else {
          setError(msg);
        }
        return;
      }

      router.push("/sign-in?message=password-updated");
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
            RESET PASSWORD
          </span>
        </div>

        {/* Expired state */}
        {expired ? (
          <>
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
              <span>This reset link has expired. Please request a new one.</span>
            </div>
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
                REQUEST NEW LINK
              </a>
            </p>
          </>
        ) : !ready ? (
          /* Waiting for PASSWORD_RECOVERY event */
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
            <span>Waiting for password reset confirmation...</span>
          </div>
        ) : (
          /* Ready: show new password form */
          <>
            <form
              onSubmit={handleSubmit}
              style={{ display: "flex", flexDirection: "column", gap: "16px" }}
            >
              {/* New password */}
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
                  NEW PASSWORD
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
                  "UPDATE PASSWORD"
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
              Back to{" "}
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
          </>
        )}
      </div>
    </div>
  );
}
