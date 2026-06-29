"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "@/components/ui/icon";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (signInError) {
      setError("メールアドレスまたはパスワードが正しくありません。");
      setLoading(false);
      return;
    }
    const redirect = params.get("redirect") || "/dashboard";
    router.replace(redirect);
    router.refresh();
  }

  const field: React.CSSProperties = {
    width: "100%",
    height: 42,
    padding: "0 12px",
    fontSize: 14,
    borderRadius: "var(--r-md)",
    border: "1px solid var(--border)",
    background: "var(--surface)",
    color: "var(--text)",
    outline: "none",
  };
  const label: React.CSSProperties = {
    display: "block",
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-2)",
    marginBottom: 6,
  };

  return (
    <form
      onSubmit={onSubmit}
      style={{
        width: 360,
        maxWidth: "100%",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)",
        boxShadow: "var(--shadow-card)",
        padding: "28px 26px",
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 2 }}>
        <span
          style={{
            width: 34,
            height: 34,
            borderRadius: 9,
            display: "grid",
            placeItems: "center",
            background: "var(--primary)",
            color: "#fff",
          }}
        >
          <Icon name="BedDouble" size={19} />
        </span>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: "var(--text)" }}>Stay Analytics</div>
          <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>宿泊BI レポート</div>
        </div>
      </div>

      <div>
        <label htmlFor="email" style={label}>
          メールアドレス
        </label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={field}
          placeholder="you@example.com"
        />
      </div>

      <div>
        <label htmlFor="password" style={label}>
          パスワード
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={field}
          placeholder="••••••••"
        />
      </div>

      {error && (
        <div
          role="alert"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            fontSize: 12.5,
            color: "var(--danger)",
            background: "var(--danger-weak, rgba(220,38,38,.08))",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-md)",
            padding: "8px 10px",
          }}
        >
          <Icon name="TriangleAlert" size={14} />
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        style={{
          height: 42,
          borderRadius: "var(--r-md)",
          border: "none",
          background: "var(--primary)",
          color: "#fff",
          fontSize: 14,
          fontWeight: 700,
          cursor: loading ? "default" : "pointer",
          opacity: loading ? 0.7 : 1,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}
      >
        {loading ? "サインイン中…" : "サインイン"}
      </button>
    </form>
  );
}
