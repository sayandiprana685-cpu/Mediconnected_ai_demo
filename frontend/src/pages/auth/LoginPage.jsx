import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../services/api.js";
import { useAuth } from "../../hooks/useAuth.jsx";
import { useToast } from "../../components/ui/Toast.jsx";
import { Button, Input } from "../../components/ui/index.jsx";

export default function LoginPage() {
  const [mode, setMode] = useState("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { setSession } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  async function onPassword(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = await api("/api/auth/login", { method: "POST", body: { email, password } });
      await setSession(data);
      toast("Signed in securely.");
      navigate("/app");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function sendOtp(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/auth/otp/request", { method: "POST", body: { email } });
      setSent(true);
      toast("If the account exists, a verification code was sent to your email.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function onOtp(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = await api("/api/auth/otp/login", { method: "POST", body: { email, code: otp } });
      await setSession(data);
      navigate("/app");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="enter">
      <p className="text-xs tracking-[0.2em] text-teal-800 uppercase">Secure sign-in</p>
      <h2 className="mt-2 font-display text-4xl text-teal-950">Provider Portal</h2>
      <p className="mt-2 text-sm text-ink-soft">One login. Your role determines what you can see and do.</p>

      <div className="mt-6 flex gap-2 rounded-full border border-line bg-paper p-1 text-sm">
        <button className={`flex-1 rounded-full py-2 ${mode === "password" ? "bg-teal-900 text-white" : ""}`} onClick={() => setMode("password")}>
          Password
        </button>
        <button className={`flex-1 rounded-full py-2 ${mode === "otp" ? "bg-teal-900 text-white" : ""}`} onClick={() => setMode("otp")}>
          OTP
        </button>
      </div>

      {error && (
        <p className="mt-4 rounded-xl border border-danger/30 bg-red-50 px-3 py-2 text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      {mode === "password" ? (
        <form className="mt-6 space-y-4" onSubmit={onPassword}>
          <Input label="Email or work address" name="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Input label="Password" name="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <div className="flex justify-between text-sm">
            <Link className="text-teal-800" to="/forgot-password">
              Forgot password
            </Link>
            <span className="text-ink-soft">Passkeys / SSO — coming soon</span>
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Signing in…" : "Continue"}
          </Button>
        </form>
      ) : (
        <form className="mt-6 space-y-4" onSubmit={sent ? onOtp : sendOtp}>
          <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          {sent && <Input label="One-time code" inputMode="numeric" value={otp} onChange={(e) => setOtp(e.target.value)} required />}
          <Button type="submit" className="w-full" disabled={busy}>
            {sent ? "Verify and sign in" : "Send code"}
          </Button>
        </form>
      )}

      <p className="mt-8 text-sm text-ink-soft">
        Register a hospital, clinic, or nursing home?{" "}
        <Link className="font-semibold text-teal-800" to="/register">
          Register healthcare facility
        </Link>
      </p>
    </div>
  );
}
