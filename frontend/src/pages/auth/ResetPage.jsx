import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../../services/api.js";
import { Button, Input } from "../../components/ui/index.jsx";

export default function ResetPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [email, setEmail] = useState(params.get("email") || "");
  const [token, setToken] = useState(params.get("token") || "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setError("");
    try {
      await api("/api/auth/reset-password", { method: "POST", body: { email, token, password } });
      navigate("/login");
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <h2 className="font-display text-3xl">Set a new password</h2>
      <p className="mt-2 text-sm text-ink-soft">Use the token from your reset email. Links expire after one hour.</p>
      {error && (
        <p className="mt-3 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
      <form className="mt-6 space-y-4" onSubmit={submit}>
        <Input label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input label="Reset token" required value={token} onChange={(e) => setToken(e.target.value)} />
        <Input label="New password" type="password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />
        <Button type="submit" className="w-full">
          Update password
        </Button>
      </form>
      <Link className="mt-6 inline-block text-sm text-teal-800" to="/login">
        Back to sign in
      </Link>
    </div>
  );
}
