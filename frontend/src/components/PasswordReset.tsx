import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { recoveryLink, supabase } from "../auth";
import logo from "../assets/Calpulli_Logo.png";

function PasswordPage({ children }: { children: ReactNode }) {
  return (
    <main className="login-page password-page">
      <div className="login-panel">
        <a className="login-identity" href="/login">
          <img src={logo} alt="" />
          <span>Calpulli Tonalehqueh</span>
        </a>
        <div className="login-layout">
          <section className="login-card" aria-labelledby="password-title">
            {children}
          </section>
        </div>
      </div>
    </main>
  );
}

type RecoveryState = "checking" | "invalid" | "ready" | "saving" | "success";

export function PasswordReset() {
  const [state, setState] = useState<RecoveryState>("checking");
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function verifyRecovery() {
      try {
        if (!supabase) {
          if (!cancelled) setState("invalid");
          return;
        }
        const { data, error } = await supabase.auth.getSession();
        if (error || !recoveryLink || !data.session) {
          if (!cancelled) setState("invalid");
          return;
        }
        const user = await supabase.auth.getUser();
        if (!cancelled)
          setState(user.error || !user.data.user ? "invalid" : "ready");
      } catch {
        if (!cancelled) setState("invalid");
      } finally {
        if (!cancelled) history.replaceState(null, "", "/reset-password");
      }
    }
    void verifyRecovery();
    return () => {
      cancelled = true;
    };
  }, []);

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || state !== "ready") return;
    if (password.length < 8) {
      setError("Use at least 8 characters for your new password.");
      return;
    }
    if (password !== confirmation) {
      setError("Your passwords do not match.");
      return;
    }
    setState("saving");
    setError("");
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        const user = await supabase.auth.getUser();
        if (user.error || !user.data.user) {
          setState("invalid");
          setPassword("");
          setConfirmation("");
          return;
        }
        setState("ready");
        setError(
          error.code === "weak_password" || error.code === "same_password"
            ? "Choose a stronger password you have not used before."
            : "Unable to update your password. Please try again.",
        );
        return;
      }
      setPassword("");
      setConfirmation("");
      setState("success");
      await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    } catch {
      setError("Unable to connect. Please try again.");
      setState("ready");
    }
  }

  return (
    <PasswordPage>
      <h1 id="password-title">
        {state === "success" ? "Password updated." : "Set a new password."}
      </h1>
      {state === "checking" ? (
        <p role="status">Checking your reset link…</p>
      ) : state === "invalid" ? (
        <>
          <p role="alert">This reset link is invalid or has expired.</p>
          <a className="button primary full" href="/forgot-password">
            Request a new link
          </a>
        </>
      ) : state === "success" ? (
        <>
          <p role="status">
            Your password has been changed. You can now log in.
          </p>
          <a className="button primary full" href="/login">
            Back to login
          </a>
        </>
      ) : (
        <>
          <p>Choose a new password for your account.</p>
          <form onSubmit={updatePassword}>
            <label>
              New password
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-describedby="password-hint"
                disabled={state === "saving"}
              />
            </label>
            <p className="password-hint" id="password-hint">
              Use at least 8 characters.
            </p>
            <label>
              Confirm new password
              <input
                name="confirmation"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                disabled={state === "saving"}
              />
            </label>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button
              className="button primary full"
              disabled={state === "saving"}
            >
              {state === "saving" ? "Updating password…" : "Update password"}
            </button>
          </form>
        </>
      )}
      {state !== "success" && (
        <a className="password-back" href="/login">
          Back to login
        </a>
      )}
    </PasswordPage>
  );
}

type RequestState = "ready" | "sending" | "sent";

export function ForgotPassword() {
  const [state, setState] = useState<RequestState>("ready");
  const [error, setError] = useState("");

  async function sendReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || state !== "ready") return;
    const email = String(new FormData(event.currentTarget).get("email")).trim();
    setState("sending");
    setError("");
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${location.origin}/reset-password`,
      });
      if (error) {
        setState("ready");
        setError(
          error.status === 429
            ? "Too many requests. Please wait a few minutes and try again."
            : "Unable to send a reset link. Please try again later.",
        );
        return;
      }
      setState("sent");
    } catch {
      setState("ready");
      setError("Unable to connect. Please try again.");
    }
  }

  return (
    <PasswordPage>
      <h1 id="password-title">Reset your password.</h1>
      {state === "sent" ? (
        <p role="status">
          If an account exists for that email, you will receive a reset link
          shortly. Open it to choose a new password.
        </p>
      ) : (
        <>
          <p>Enter your email and we will send you a reset link.</p>
          <form onSubmit={sendReset}>
            <label>
              Email address
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                disabled={state === "sending"}
              />
            </label>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            {!supabase && (
              <p className="notice">
                Password reset is unavailable. Please contact your
                administrator.
              </p>
            )}
            <button
              className="button primary full"
              disabled={!supabase || state === "sending"}
            >
              {state === "sending" ? "Sending link…" : "Send reset link"}
            </button>
          </form>
        </>
      )}
      <a className="password-back" href="/login">
        Back to login
      </a>
    </PasswordPage>
  );
}
