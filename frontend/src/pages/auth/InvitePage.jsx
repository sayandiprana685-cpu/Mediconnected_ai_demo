import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../services/api.js";
import { useAuth } from "../../hooks/useAuth.jsx";
import { Badge, Button, Card, Input } from "../../components/ui/index.jsx";

export default function InvitePage() {
  const { token } = useParams();
  const { user, setSession, refresh } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [activated, setActivated] = useState(false);

  useEffect(() => {
    api(`/api/doctors/invite/${token}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [token]);

  if (error) {
    return (
      <div className="network-bg flex min-h-screen items-center justify-center p-6">
        <Card className="max-w-lg p-8">
          <h1 className="font-display text-3xl">Invitation unavailable</h1>
          <p className="mt-3 text-ink-soft">{error}</p>
          <Link className="mt-6 inline-block text-teal-800" to="/login">
            Provider sign in
          </Link>
        </Card>
      </div>
    );
  }
  if (!data) return <div className="p-10">Opening invitation…</div>;

  const facility = data.invite.facilityId;
  const existing = data.existingUser;

  async function sendOtp() {
    await api(`/api/doctors/invite/${token}/otp`, { method: "POST" });
    setOtpSent(true);
  }

  async function activate(e) {
    e.preventDefault();
    try {
      const res = await api("/api/doctors/activate", {
        method: "POST",
        body: { token, password, otp },
      });
      setSession(res);
      setActivated(true);
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function accept() {
    try {
      await api(`/api/doctors/invite/${token}/accept`, { method: "POST" });
      await refresh();
      navigate("/app");
    } catch (err) {
      setError(err.message);
    }
  }

  async function decline() {
    await api(`/api/doctors/invite/${token}/decline`, { method: "POST" });
    navigate("/login");
  }

  return (
    <div className="network-bg min-h-screen px-4 py-12">
      <div className="mx-auto max-w-xl">
        <p className="text-xs tracking-[0.22em] text-teal-800 uppercase">Doctor invitation</p>
        <h1 className="mt-2 font-display text-4xl text-teal-950">{facility?.name} has invited you to join as {data.invite.name}</h1>
        <p className="mt-3 text-ink-soft">
          This link is unique and time-limited. It does not grant access to patient records until you accept and your association is active.
        </p>
        <Card className="mt-6 space-y-2 p-5 text-sm">
          <div className="flex justify-between">
            <span>Specialization</span>
            <strong>{data.invite.specialization}</strong>
          </div>
          <div className="flex justify-between">
            <span>Registration</span>
            <strong>{data.invite.registrationNumber}</strong>
          </div>
          <div className="flex justify-between">
            <span>Invitation</span>
            <Badge tone="warn">{data.invite.status}</Badge>
          </div>
        </Card>

        {error && <p className="mt-4 text-sm text-danger">{error}</p>}

        {user && user.email === data.invite.email ? (
          <div className="mt-6 flex gap-3">
            <Button onClick={accept}>Accept invitation</Button>
            <Button variant="outline" onClick={decline}>
              Decline
            </Button>
          </div>
        ) : existing ? (
          <div className="mt-6">
            <p className="text-sm">An existing MediConnect account was found. Sign in with {data.invite.email} to accept.</p>
            <Link className="mt-4 inline-block font-semibold text-teal-800" to="/login">
              Sign in to accept
            </Link>
          </div>
        ) : activated ? (
          <div className="mt-6">
            <p className="text-sm">Account activated. Accept to join {facility?.name}.</p>
            <Button className="mt-4" onClick={accept}>
              Accept invitation
            </Button>
          </div>
        ) : (
          <form className="mt-6 space-y-3" onSubmit={activate}>
            <p className="text-sm">Create your doctor account. OTP verification is required.</p>
            <Button type="button" variant="secondary" onClick={sendOtp}>
              {otpSent ? "Code sent" : "Send OTP to email"}
            </Button>
            <Input label="OTP" value={otp} onChange={(e) => setOtp(e.target.value)} required />
            <Input label="Create password" type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
            <Button type="submit">Verify and create account</Button>
          </form>
        )}
      </div>
    </div>
  );
}
