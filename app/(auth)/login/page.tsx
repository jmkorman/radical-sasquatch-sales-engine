"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/app-auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (res.ok) {
      router.push("/");
    } else {
      setError("Invalid password");
      setLoading(false);
    }
  };

  return (
    <div className="bg-rs-surface border border-rs-border rounded-xl p-8 w-full max-w-sm">
      <div className="text-center mb-6">
        <h1 className="text-rs-gold font-bold text-xl">Radical Sasquatch</h1>
        <p className="text-gray-400 text-sm mt-1">Sales Engine</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          type="password"
          placeholder="Enter password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
        />
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <Button type="submit" disabled={loading || !password} className="w-full">
          {loading ? "Signing in..." : "Sign In"}
        </Button>
      </form>
    </div>
  );
}
