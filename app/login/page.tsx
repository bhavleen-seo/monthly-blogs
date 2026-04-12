"use client";

import { useState } from "react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        window.location.href = "/admin/blog-agent";
      } else {
        const data = await res.json();
        setError(data.error || "Invalid password");
      }
    } catch {
      setError("Something went wrong");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[var(--color-background)] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-[var(--color-foreground)]">Monthly Blogs</h1>
          <p className="text-sm text-[var(--color-muted-foreground)] mt-1">CS Design Studios</p>
        </div>

        <form onSubmit={handleLogin} className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--color-muted-foreground)] mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter dashboard password"
              required
              autoFocus
              className="w-full bg-[var(--color-muted)] border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-sm text-[var(--color-foreground)] placeholder-[var(--color-muted-foreground)]"
            />
          </div>

          {error && (
            <p className="text-sm text-[var(--color-destructive)]">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[var(--color-primary)] text-[var(--color-primary-foreground)] py-2.5 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
