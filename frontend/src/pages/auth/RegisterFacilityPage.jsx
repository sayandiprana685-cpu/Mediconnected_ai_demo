import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../services/api.js";
import { Button, Input, Select } from "../../components/ui/index.jsx";

export default function RegisterFacilityPage() {
  const [form, setForm] = useState({
    name: "",
    type: "HOSPITAL",
    address: "",
    city: "",
    district: "",
    state: "Maharashtra",
    pin: "",
    lat: "19.0760",
    lng: "72.8777",
    contactNumber: "",
    officialEmail: "",
    licenceNumber: "",
    licenceAuthority: "State Public Health Department",
    adminName: "",
    adminEmail: "",
    adminPhone: "",
    adminPassword: "",
    departments: "General Medicine, Emergency",
    services: "Outpatient consultation",
    documentName: "Facility licence scan",
    emergencyAvailable: true,
    consultationAvailable: true,
    diagnosticAvailable: false,
    medicineAvailable: false,
  });
  const [done, setDone] = useState(null);
  const [error, setError] = useState("");

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    try {
      const data = await api("/api/facilities/register", {
        method: "POST",
        body: {
          ...form,
          departments: form.departments.split(",").map((s) => s.trim()).filter(Boolean),
          services: form.services.split(",").map((s) => s.trim()).filter(Boolean),
          geo: { lat: Number(form.lat), lng: Number(form.lng) },
          documents: form.documentName ? [{ name: form.documentName, kind: "LICENCE" }] : [],
        },
      });
      setDone(data);
    } catch (err) {
      setError(err.message);
    }
  }

  if (done) {
    return (
      <div>
        <h2 className="font-display text-3xl">Submitted for verification</h2>
        <p className="mt-3 text-ink-soft">
          {done.facility?.name} is under review. You will receive an email when a government administrator verifies the
          facility. Operational tools stay limited until then.
        </p>
        <Link className="mt-6 inline-block font-semibold text-teal-800" to="/login">
          Return to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="enter max-h-[80vh] overflow-y-auto pr-1">
      <h2 className="font-display text-3xl">Register healthcare facility</h2>
      <p className="mt-2 text-sm text-ink-soft">Hospitals, clinics, nursing homes, diagnostic centres, laboratories, pharmacies, and medicine shops register here. Doctors join later by invitation.</p>
      {error && (
        <p className="mt-3 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
      <form className="mt-5 grid gap-3" onSubmit={submit}>
        <Input label="Facility name" required value={form.name} onChange={(e) => set("name", e.target.value)} />
        <Select label="Facility type" value={form.type} onChange={(e) => set("type", e.target.value)}>
          <option value="HOSPITAL">Hospital</option>
          <option value="NURSING_HOME">Nursing Home</option>
          <option value="CLINIC">Clinic</option>
          <option value="DIAGNOSTIC_CENTRE">Diagnostic Center</option>
          <option value="LABORATORY">Laboratory</option>
          <option value="PHARMACY">Pharmacy</option>
          <option value="MEDICINE_SHOP">Medicine Shop</option>
        </Select>
        <Input label="Legal / registered name" value={form.legalName || ""} onChange={(e) => set("legalName", e.target.value)} />
        <Input label="Address" required value={form.address} onChange={(e) => set("address", e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="City" required value={form.city} onChange={(e) => set("city", e.target.value)} />
          <Input label="District" required value={form.district} onChange={(e) => set("district", e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="State" value={form.state} onChange={(e) => set("state", e.target.value)} />
          <Input label="PIN" required value={form.pin} onChange={(e) => set("pin", e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Latitude" value={form.lat} onChange={(e) => set("lat", e.target.value)} />
          <Input label="Longitude" value={form.lng} onChange={(e) => set("lng", e.target.value)} />
        </div>
        <Input label="Contact number" required value={form.contactNumber} onChange={(e) => set("contactNumber", e.target.value)} />
        <Input label="Official email" type="email" required value={form.officialEmail} onChange={(e) => set("officialEmail", e.target.value)} />
        <Input label="Registration / licence number" required value={form.licenceNumber} onChange={(e) => set("licenceNumber", e.target.value)} />
        <Input label="Licensing authority" value={form.licenceAuthority} onChange={(e) => set("licenceAuthority", e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Licence issue date" type="date" value={form.licenceIssuedAt || ""} onChange={(e) => set("licenceIssuedAt", e.target.value)} />
          <Input label="Licence expiry date" type="date" value={form.licenceExpiresAt || ""} onChange={(e) => set("licenceExpiresAt", e.target.value)} />
        </div>
        <Input label="Accreditation (optional)" value={form.accreditation || ""} onChange={(e) => set("accreditation", e.target.value)} />
        <Input label="Website" value={form.website || ""} onChange={(e) => set("website", e.target.value)} />
        <Input label="Country" value={form.country || "India"} onChange={(e) => set("country", e.target.value)} />
        <Input label="Supporting document label" value={form.documentName} onChange={(e) => set("documentName", e.target.value)} hint="Upload storage is not enabled in this MVP; the label is recorded for review." />
        <Input label="Departments (comma separated)" value={form.departments} onChange={(e) => set("departments", e.target.value)} />
        <Input label="Services (comma separated)" value={form.services} onChange={(e) => set("services", e.target.value)} />
        <p className="pt-2 text-xs tracking-wide text-ink-soft uppercase">Authorized administrator</p>
        <Input label="Administrator name" required value={form.adminName} onChange={(e) => set("adminName", e.target.value)} />
        <Input label="Designation" value={form.adminDesignation || ""} onChange={(e) => set("adminDesignation", e.target.value)} />
        <Input label="Administrator email" type="email" required value={form.adminEmail} onChange={(e) => set("adminEmail", e.target.value)} />
        <Input label="Administrator phone" value={form.adminPhone} onChange={(e) => set("adminPhone", e.target.value)} />
        <Input label="Administrator password" type="password" minLength={8} required value={form.adminPassword} onChange={(e) => set("adminPassword", e.target.value)} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.emergencyAvailable} onChange={(e) => set("emergencyAvailable", e.target.checked)} />
          Emergency availability
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.consultationAvailable} onChange={(e) => set("consultationAvailable", e.target.checked)} />
          Consultation availability
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.diagnosticAvailable} onChange={(e) => set("diagnosticAvailable", e.target.checked)} />
          Diagnostic availability
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.medicineAvailable} onChange={(e) => set("medicineAvailable", e.target.checked)} />
          Medicine / pharmacy availability
        </label>
        <Button type="submit">Submit for verification</Button>
        <Link className="text-center text-sm text-teal-800" to="/login">
          Back to sign in
        </Link>
      </form>
    </div>
  );
}
