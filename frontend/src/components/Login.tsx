import { useState } from "react";
import type { FormEvent } from "react";
import {
  ArrowRight,
  Eye,
  EyeOff,
  ShieldCheck,
  ArrowUpRight,
} from "lucide-react";
import { supabase, demoEnabled } from "../auth";
export function Login({ onDemo }: { onDemo: () => void }) {
  const [show, setShow] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function login(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: String(form.get("email")),
        password: String(form.get("password")),
      });
      if (error)
        setError(
          "Unable to sign in. Check your email and password and try again.",
        );
    } catch {
      setError("Unable to connect. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-page">
      <div className="login-brand">
        <span className="brand-symbol">c</span>
        <strong>calpulli</strong>
        <span>WORKSPACE</span>
      </div>
      <main className="login-layout">
        <section className="login-story">
          <span className="eyebrow">
            ROOTED IN CULTURE. CONNECTED BY COMMUNITY.
          </span>
          <h1>
            Good things happen
            <br />
            when we come
            <br />
            <em>together.</em>
          </h1>
          <p>
            A little less administration.
            <br />A little more connection.
          </p>
          <div className="woven-art" aria-hidden="true">
            <div />
            <div />
            <div />
            <div />
          </div>
          <small>Calpulli Tonalehqueh · San José, California</small>
        </section>
        <section className="login-card">
          <span className="brand-symbol dark">c</span>
          <h2>Welcome back.</h2>
          <p>Log in to your Calpulli workspace.</p>
          <form onSubmit={login}>
            <label>
              Email address
              <input
                name="email"
                type="email"
                autoComplete="username"
                placeholder="you@calpulli.org"
                required
              />
            </label>
            <label>
              Password
              <div className="password-wrap">
                <input
                  name="password"
                  aria-label="Password"
                  type={show ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  required
                />
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => setShow(!show)}
                  aria-label={show ? "Hide password" : "Show password"}
                >
                  {show ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </label>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            {!supabase && (
              <p className="notice">
                Supabase sign-in needs the public environment settings. You can
                explore the sample workspace below.
              </p>
            )}
            <button
              className="button primary full"
              disabled={busy || !supabase}
            >
              {busy ? "Logging in…" : "Log in"}
              <ArrowRight size={15} />
            </button>
          </form>
          <div className="login-separator">or take a look around</div>
          {demoEnabled && (
            <button className="button full" onClick={onDemo}>
              Explore demo workspace
              <ArrowUpRight size={15} />
            </button>
          )}
          <div className="login-secure">
            <ShieldCheck size={15} /> Staff access · Secured by Supabase
          </div>
          <p className="login-help">
            Need access? Contact your workspace administrator.
          </p>
        </section>
      </main>
      <footer>
        © {new Date().getFullYear()} Calpulli Tonalehqueh{" "}
        <span>Culture. Community. Connection.</span>
      </footer>
    </div>
  );
}
