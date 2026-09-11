import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "../hooks/useAuth.jsx";
import { Badge } from "../components/ui/index.jsx";
import { facilityKind } from "../utils/facilityKinds.js";

const NAV = {
  DOCTOR: [
    ["Dashboard", "/app"],
    ["Appointments", "/app/appointments"],
    ["Queue", "/app/queue"],
    ["Patients", "/app/patients"],
    ["Consultations", "/app/consultations"],
    ["Prescriptions", "/app/prescriptions"],
    ["Referrals", "/app/referrals"],
    ["Follow-ups", "/app/follow-ups"],
    ["Schedule", "/app/schedule"],
    ["Messages", "/app/messages"],
    ["Profile", "/app/profile"],
    ["Settings", "/app/settings"],
  ],
  FACILITY_ADMIN: [
    ["Dashboard", "/app"],
    ["Appointments", "/app/appointments"],
    ["Queue", "/app/queue"],
    ["Doctors", "/app/doctors"],
    ["Staff", "/app/staff"],
    ["Patients", "/app/patients"],
    ["Prescriptions", "/app/prescriptions"],
    ["Referrals", "/app/referrals"],
    ["Services", "/app/services"],
    ["Medicine Orders", "/app/medicine-orders"],
    ["Facility Profile", "/app/facility"],
    ["Analytics", "/app/analytics"],
    ["Settings", "/app/settings"],
  ],
  DIAGNOSTIC: [
    ["Dashboard", "/app"],
    ["Test Orders", "/app/lab-orders"],
    ["Patients", "/app/patients"],
    ["Tests", "/app/lab-tests"],
    ["Medicine Orders", "/app/medicine-orders"],
    ["Staff", "/app/staff"],
    ["Referrals", "/app/referrals"],
    ["Messages", "/app/messages"],
    ["Profile", "/app/facility"],
    ["Settings", "/app/settings"],
  ],
  PHARMACY: [
    ["Dashboard", "/app"],
    ["Orders", "/app/pharmacy-orders"],
    ["Medicine Orders", "/app/pharmacy-requests"],
    ["Medicines", "/app/medicines"],
    ["Patients", "/app/patients"],
    ["Staff", "/app/staff"],
    ["Referrals", "/app/referrals"],
    ["Messages", "/app/messages"],
    ["Profile", "/app/facility"],
    ["Settings", "/app/settings"],
  ],
  MAIN_ADMIN: [
    ["Dashboard", "/app"],
    ["Facilities", "/app/facilities"],
    ["Doctors", "/app/network-doctors"],
    ["Verification", "/app/verification"],
    ["Network", "/app/network"],
    ["Referrals", "/app/referrals"],
    ["Analytics", "/app/gov-analytics"],
    ["Audit Logs", "/app/audit"],
    ["Medicine Orders", "/app/admin-medicine-orders"],
    ["System Settings", "/app/settings"],
  ],
};

export default function AppShell() {
  const { user, facilities, facilityId, setFacilityId, logout, network } = useAuth();
  const [open, setOpen] = useState(true);
  const [mobileNav, setMobileNav] = useState(false);
  const navigate = useNavigate();
  const current = facilities.find((f) => String(f._id) === String(facilityId)) || facilities[0];
  const kind = facilityKind(current?.type);
  const navKey =
    user?.role === "MAIN_ADMIN"
      ? "MAIN_ADMIN"
      : user?.role === "DOCTOR"
        ? "DOCTOR"
        : kind === "diagnostic"
          ? "DIAGNOSTIC"
          : kind === "pharmacy"
            ? "PHARMACY"
            : "FACILITY_ADMIN";
  const items = NAV[navKey] || [];

  return (
    <div className="flex min-h-screen">
      <aside
        className={`${open ? "w-64" : "w-[76px]"} sticky top-0 hidden h-screen shrink-0 border-r border-line bg-teal-950 text-teal-100 transition-[width] duration-300 md:flex md:flex-col`}
      >
        <div className="flex items-center gap-3 px-4 py-5">
          <div className="grid h-9 w-9 place-items-center rounded-full border border-teal-500/40 text-xs tracking-widest">MC</div>
          {open && (
            <div>
              <div className="text-[10px] tracking-[0.22em] uppercase opacity-70">Provider portal</div>
              <div className="font-display text-lg text-white">MediConnect</div>
            </div>
          )}
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
          {items.map(([label, to]) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/app"}
              className={({ isActive }) =>
                `flex min-h-10 items-center rounded-xl px-3 text-sm ${isActive ? "bg-white/10 text-white" : "text-teal-100/80 hover:bg-white/5"}`
              }
            >
              {open ? label : label.slice(0, 1)}
            </NavLink>
          ))}
        </nav>
        <button className="m-3 rounded-xl border border-white/10 py-2 text-xs" onClick={() => setOpen((v) => !v)}>
          {open ? "Collapse" : "›"}
        </button>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-line bg-paper/90 px-4 py-3 backdrop-blur md:px-8">
          <div className="flex items-center gap-3">
            <button
              className="rounded-xl border border-line px-3 py-2 text-sm md:hidden"
              onClick={() => setMobileNav((v) => !v)}
              aria-expanded={mobileNav}
              aria-label="Open navigation"
            >
              Menu
            </button>
            <span className="font-display text-xl md:hidden">MediConnect</span>
            {user?.role === "DOCTOR" && facilities.length > 0 && (
              <label className="text-sm">
                <span className="mr-2 text-ink-soft">Current facility</span>
                <select
                  className="min-h-10 rounded-xl border border-line bg-paper-2 px-3"
                  value={facilityId}
                  onChange={(e) => setFacilityId(e.target.value)}
                >
                  {facilities.map((f) => (
                    <option key={f._id} value={f._id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {user?.role !== "DOCTOR" && user?.role !== "MAIN_ADMIN" && facilities[0] && (
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium">{facilities[0].name}</span>
                {facilities[0].status === "VERIFIED" ? (
                  <Badge tone="ok">✓ Verified Facility</Badge>
                ) : (
                  <Badge tone="warn">{facilities[0].status?.replaceAll("_", " ")}</Badge>
                )}
              </div>
            )}
            {user?.role === "MAIN_ADMIN" && (
              <div className="flex items-center gap-2 text-sm">
                {network?.name && <span className="font-medium">{network.name}</span>}
                <Badge tone="gold">Healthcare Network Command</Badge>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3 text-sm">
            {user?.photoUrl ? (
              <img src={user.photoUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
            ) : null}
            <span className="text-ink-soft">{user?.name}</span>
            <button
              className="rounded-xl border border-line px-3 py-2"
              onClick={async () => {
                await logout();
                navigate("/login");
              }}
            >
              Sign out
            </button>
          </div>
        </header>
        {mobileNav && (
          <nav className="border-b border-line bg-paper-2 px-4 py-3 md:hidden" aria-label="Mobile">
            <ul className="grid gap-1">
              {items.map(([label, to]) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={to === "/app"}
                    className={({ isActive }) => `block rounded-xl px-3 py-2 text-sm ${isActive ? "bg-teal-100 text-teal-900" : ""}`}
                    onClick={() => setMobileNav(false)}
                  >
                    {label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        )}
        <main className="enter flex-1 px-4 py-6 md:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
