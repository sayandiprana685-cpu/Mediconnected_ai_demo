import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./hooks/useAuth.jsx";
import AuthLayout from "./layouts/AuthLayout.jsx";
import AppShell from "./layouts/AppShell.jsx";
import LoginPage from "./pages/auth/LoginPage.jsx";
import RegisterFacilityPage from "./pages/auth/RegisterFacilityPage.jsx";
import ForgotPage from "./pages/auth/ForgotPage.jsx";
import ResetPage from "./pages/auth/ResetPage.jsx";
import InvitePage from "./pages/auth/InvitePage.jsx";
import RoleHome from "./pages/shared/RoleHome.jsx";
import AppointmentsPage from "./pages/shared/AppointmentsPage.jsx";
import QueuePage from "./pages/shared/QueuePage.jsx";
import PatientsPage from "./pages/shared/PatientsPage.jsx";
import PatientDetailPage from "./pages/shared/PatientDetailPage.jsx";
import ReferralsPage from "./pages/shared/ReferralsPage.jsx";
import FollowUpsPage from "./pages/shared/FollowUpsPage.jsx";
import MessagesPage from "./pages/shared/MessagesPage.jsx";
import SettingsPage from "./pages/shared/SettingsPage.jsx";
import ConsultationsPage from "./pages/doctor/ConsultationsPage.jsx";
import PrescriptionsPage from "./pages/doctor/PrescriptionsPage.jsx";
import PrescriptionEditorPage from "./pages/doctor/PrescriptionEditorPage.jsx";
import SchedulePage from "./pages/doctor/SchedulePage.jsx";
import DoctorProfilePage from "./pages/doctor/DoctorProfilePage.jsx";
import DoctorsPage from "./pages/facility/DoctorsPage.jsx";
import StaffPage from "./pages/facility/StaffPage.jsx";
import ServicesPage from "./pages/facility/ServicesPage.jsx";
import FacilityProfilePage from "./pages/facility/FacilityProfilePage.jsx";
import FacilityAnalyticsPage from "./pages/facility/FacilityAnalyticsPage.jsx";
import FacilitiesPage from "./pages/admin/FacilitiesPage.jsx";
import FacilityAdminDetail from "./pages/admin/FacilityAdminDetail.jsx";
import VerificationPage from "./pages/admin/VerificationPage.jsx";
import NetworkDoctorsPage from "./pages/admin/NetworkDoctorsPage.jsx";
import NetworkPage from "./pages/admin/NetworkPage.jsx";
import AuditPage from "./pages/admin/AuditPage.jsx";
import GovAnalyticsPage from "./pages/admin/GovAnalyticsPage.jsx";
import LabTestsPage from "./pages/diagnostic/LabTestsPage.jsx";
import LabOrdersPage from "./pages/diagnostic/LabOrdersPage.jsx";
import LabOrderDetailPage from "./pages/diagnostic/LabOrderDetailPage.jsx";
import MedicinesPage from "./pages/pharmacy/MedicinesPage.jsx";
import PharmacyOrdersPage from "./pages/pharmacy/PharmacyOrdersPage.jsx";
import PharmacyOrderDetailPage from "./pages/pharmacy/PharmacyOrderDetailPage.jsx";
import MedicineOrdersPage from "./pages/facility/MedicineOrdersPage.jsx";
import MedicineOrderNewPage from "./pages/facility/MedicineOrderNewPage.jsx";
import MedicineOrderDetailPage from "./pages/facility/MedicineOrderDetailPage.jsx";
import PharmacyRequestsPage from "./pages/pharmacy/PharmacyRequestsPage.jsx";
import PharmacyRequestDetailPage from "./pages/pharmacy/PharmacyRequestDetailPage.jsx";
import AdminMedicineOrdersPage from "./pages/admin/AdminMedicineOrdersPage.jsx";
import AdminMedicineOrderDetailPage from "./pages/admin/AdminMedicineOrderDetailPage.jsx";

const FACILITY_STAFF = ["FACILITY_ADMIN", "LAB_TECH", "LAB_REVIEWER", "PHARMACIST", "PHARMACY_STAFF"];

function Guard({ children, roles }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-10 text-ink-soft">Restoring your session…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/app" replace />;
  return children;
}

function Guest({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/app" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route element={<Guest><AuthLayout /></Guest>}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterFacilityPage />} />
        <Route path="/forgot-password" element={<ForgotPage />} />
        <Route path="/reset-password" element={<ResetPage />} />
      </Route>
      <Route path="/invite/:token" element={<InvitePage />} />
      <Route
        path="/app"
        element={
          <Guard>
            <AppShell />
          </Guard>
        }
      >
        <Route index element={<RoleHome />} />
        <Route path="appointments" element={<AppointmentsPage />} />
        <Route path="queue" element={<QueuePage />} />
        <Route path="patients" element={<PatientsPage />} />
        <Route path="patients/:id" element={<PatientDetailPage />} />
        <Route path="referrals" element={<ReferralsPage />} />
        <Route path="follow-ups" element={<FollowUpsPage />} />
        <Route path="messages" element={<MessagesPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="consultations" element={<Guard roles={["DOCTOR"]}><ConsultationsPage /></Guard>} />
        <Route path="prescriptions" element={<Guard roles={["DOCTOR", "FACILITY_ADMIN"]}><PrescriptionsPage /></Guard>} />
        <Route path="prescriptions/new" element={<Guard roles={["DOCTOR"]}><PrescriptionEditorPage /></Guard>} />
        <Route path="prescriptions/:id" element={<Guard roles={["DOCTOR", "FACILITY_ADMIN"]}><PrescriptionEditorPage /></Guard>} />
        <Route path="schedule" element={<Guard roles={["DOCTOR"]}><SchedulePage /></Guard>} />
        <Route path="profile" element={<Guard roles={["DOCTOR"]}><DoctorProfilePage /></Guard>} />
        <Route path="doctors" element={<Guard roles={["FACILITY_ADMIN"]}><DoctorsPage /></Guard>} />
        <Route path="staff" element={<Guard roles={FACILITY_STAFF}><StaffPage /></Guard>} />
        <Route path="services" element={<Guard roles={["FACILITY_ADMIN"]}><ServicesPage /></Guard>} />
        <Route path="facility" element={<Guard roles={FACILITY_STAFF}><FacilityProfilePage /></Guard>} />
        <Route path="analytics" element={<Guard roles={["FACILITY_ADMIN"]}><FacilityAnalyticsPage /></Guard>} />
        <Route path="lab-tests" element={<Guard roles={FACILITY_STAFF}><LabTestsPage /></Guard>} />
        <Route path="lab-orders" element={<Guard roles={FACILITY_STAFF}><LabOrdersPage /></Guard>} />
        <Route path="lab-orders/:id" element={<Guard roles={FACILITY_STAFF}><LabOrderDetailPage /></Guard>} />
        <Route path="medicines" element={<Guard roles={FACILITY_STAFF}><MedicinesPage /></Guard>} />
        <Route path="pharmacy-orders" element={<Guard roles={FACILITY_STAFF}><PharmacyOrdersPage /></Guard>} />
        <Route path="pharmacy-orders/:id" element={<Guard roles={FACILITY_STAFF}><PharmacyOrderDetailPage /></Guard>} />
        <Route path="medicine-orders/new" element={<Guard roles={FACILITY_STAFF}><MedicineOrderNewPage /></Guard>} />
        <Route path="medicine-orders/:id" element={<Guard roles={FACILITY_STAFF}><MedicineOrderDetailPage /></Guard>} />
        <Route path="medicine-orders" element={<Guard roles={FACILITY_STAFF}><MedicineOrdersPage /></Guard>} />
        <Route path="pharmacy-requests/:id" element={<Guard roles={FACILITY_STAFF}><PharmacyRequestDetailPage /></Guard>} />
        <Route path="pharmacy-requests" element={<Guard roles={FACILITY_STAFF}><PharmacyRequestsPage /></Guard>} />
        <Route path="admin-medicine-orders/:id" element={<Guard roles={["MAIN_ADMIN"]}><AdminMedicineOrderDetailPage /></Guard>} />
        <Route path="admin-medicine-orders" element={<Guard roles={["MAIN_ADMIN"]}><AdminMedicineOrdersPage /></Guard>} />
        <Route path="facilities" element={<Guard roles={["MAIN_ADMIN"]}><FacilitiesPage /></Guard>} />
        <Route path="facilities/:id" element={<Guard roles={["MAIN_ADMIN"]}><FacilityAdminDetail /></Guard>} />
        <Route path="verification" element={<Guard roles={["MAIN_ADMIN"]}><VerificationPage /></Guard>} />
        <Route path="network-doctors" element={<Guard roles={["MAIN_ADMIN"]}><NetworkDoctorsPage /></Guard>} />
        <Route path="network" element={<Guard roles={["MAIN_ADMIN"]}><NetworkPage /></Guard>} />
        <Route path="audit" element={<Guard roles={["MAIN_ADMIN"]}><AuditPage /></Guard>} />
        <Route path="gov-analytics" element={<Guard roles={["MAIN_ADMIN"]}><GovAnalyticsPage /></Guard>} />
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
