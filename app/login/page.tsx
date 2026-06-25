import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "ログイン — Stay Analytics" };

export default function LoginPage() {
  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        background: "var(--bg)",
        padding: 20,
      }}
    >
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
