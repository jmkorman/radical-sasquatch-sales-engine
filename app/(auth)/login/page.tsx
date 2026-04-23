"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const response = await fetch("/api/app-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        setError("Wrong password.");
        return;
      }

      const next = new URLSearchParams(window.location.search).get("next") || "/";
      router.replace(next);
      router.refresh();
    } catch {
      setError("Could not sign in. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-rs-bg px-4 py-12 text-rs-cream">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl border border-rs-border/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.03))] p-5 shadow-[0_18px_50px_rgba(9,4,26,0.35)]"
      >
        <div className="mb-5">
          <div className="text-[10px] uppercase tracking-[0.42em] text-rs-sunset/85">
            Radical Sasquatch
          </div>
          <h1 className="mt-1 text-xl font-black uppercase tracking-[0.2em] text-rs-gold">
            Sales Engine
          </h1>
          <p className="mt-2 text-sm text-[#d8ccfb]">Enter the team password to continue.</p>
        </div>

        <label className="block space-y-1 text-sm">
          <span className="text-[#af9fe6]">Password</span>
          <input
            autoFocus
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-xl border border-rs-border/80 bg-black/20 px-3 py-2.5 text-rs-cream outline-none transition-colors focus:border-rs-gold/70"
          />
        </label>

        {error && (
          <div className="mt-3 rounded-xl border border-rs-punch/50 bg-rs-punch/10 px-3 py-2 text-sm text-[#ffd6e8]">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || !password}
          className="mt-4 w-full rounded-xl bg-rs-gold px-4 py-2.5 text-sm font-black text-rs-bg transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Unlocking..." : "Unlock"}
        </button>
      </form>
    </main>
  );
}
