import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../services/api.js";
import { Button, Input } from "../../components/ui/index.jsx";

export default function ForgotPage() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  async function submit(e) {
    e.preventDefault();
    await api("/api/auth/forgot-password", { method: "POST", body: { email } });
    setDone(true);
  }
  return (
    <div>
      <h2 className="font-display text-3xl">Account recovery</h2>
      <p className="mt-2 text-sm text-ink-soft">We will send a time-limited reset link if the email is registered.</p>
      {done ? (
        <p className="mt-6 text-sm">If an account exists, check email (and the API console in development).</p>
      ) : (
        <form className="mt-6 space-y-4" onSubmit={submit}>
          <Input label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button type="submit" className="w-full">
            Send reset link
          </Button>
        </form>
      )}
      <Link className="mt-6 inline-block text-sm text-teal-800" to="/login">
        Back to sign in
      </Link>
    </div>
  );
}
