import { useAuth } from "../../hooks/useAuth.jsx";
import DoctorDashboard from "../doctor/DoctorDashboard.jsx";
import FacilityDashboard from "../facility/FacilityDashboard.jsx";
import GovernmentDashboard from "../admin/GovernmentDashboard.jsx";
import DiagnosticDashboard from "../diagnostic/DiagnosticDashboard.jsx";
import PharmacyDashboard from "../pharmacy/PharmacyDashboard.jsx";
import { facilityKind } from "../../utils/facilityKinds.js";

export default function RoleHome() {
  const { user, facilities, facilityId } = useAuth();
  if (user?.role === "MAIN_ADMIN") return <GovernmentDashboard />;
  if (user?.role === "DOCTOR") return <DoctorDashboard />;
  const current = facilities.find((f) => String(f._id) === String(facilityId)) || facilities[0];
  const kind = facilityKind(current?.type);
  if (kind === "diagnostic") return <DiagnosticDashboard />;
  if (kind === "pharmacy") return <PharmacyDashboard />;
  return <FacilityDashboard />;
}
