import { useState } from "react";
import type { FormEvent } from "react";
import { Eye, EyeOff } from "lucide-react";
import background from "../assets/Calpulli_Login_Background.jpg";
import logo from "../assets/Calpulli_Logo.png";
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
    <main className="login-page">
      <div className="login-panel">
        <div className="login-identity">
          <img src={logo} alt="" />
          <span>Calpulli Tonalehqueh</span>
        </div>
        <div className="login-layout">
          <section className="login-card" aria-labelledby="login-title">
            <h1 id="login-title">Welcome back.</h1>
            <p>Log in to your workspace.</p>
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
              <div className="login-password">
                <div className="password-label-row">
                  <label htmlFor="login-password">Password</label>
                  <button
                    type="button"
                    className="forgot-password"
                    aria-disabled="true"
                    title="Password reset is not available yet"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="password-wrap">
                  <input
                    id="login-password"
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
              </div>
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              {!supabase && (
                <p className="notice">
                  Sign-in is unavailable. Please contact your administrator.
                </p>
              )}
              <button
                className="button primary full"
                disabled={busy || !supabase}
              >
                {busy ? "Logging in…" : "Log in"}
              </button>
            </form>
            {demoEnabled && (
              <>
                <div className="login-separator">or</div>
                <button className="button full" onClick={onDemo}>
                  Explore demo workspace
                </button>
              </>
            )}
          </section>
        </div>
      </div>
      <div className="login-background" aria-hidden="true">
        <img src={background} alt="" />
      </div>
    </main>
  );
}
