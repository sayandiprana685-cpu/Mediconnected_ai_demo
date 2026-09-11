import { Link, Outlet } from "react-router-dom";

export default function AuthLayout() {
  return (
    <div className="network-bg grid min-h-screen lg:grid-cols-2">
      <aside className="relative hidden flex-col justify-between p-12 text-teal-50 lg:flex" style={{ background: "linear-gradient(165deg,#072830,#0b3d4a 55%,#125564)" }}>
        <div>
          <p className="text-xs tracking-[0.28em] uppercase opacity-70">MediConnect AI</p>
          <h1 className="mt-6 max-w-md font-display text-5xl leading-tight">Connected care, controlled access.</h1>
          <p className="mt-6 max-w-md text-base text-teal-100/80">
            One provider portal for hospitals, nursing homes, clinics, and doctors — with a government layer for network stewardship.
          </p>
        </div>
        <div className="space-y-3 text-sm text-teal-100/70">
          <div className="flex items-center gap-3">
            <span className="h-px w-10 bg-teal-500" />
            Patient → Facility → Doctor → Referral → Follow-up
          </div>
          <p>Minimum-necessary access. Role-based authorization. Audit-ready operations.</p>
        </div>
      </aside>
      <div className="flex items-center justify-center p-6 md:p-12">
        <div className="w-full max-w-md">
          <Link to="/login" className="mb-8 block font-display text-2xl text-teal-900 lg:hidden">
            MediConnect AI
          </Link>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
