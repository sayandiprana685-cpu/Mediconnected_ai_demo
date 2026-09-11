import mongoose from "mongoose";
import { connectDb } from "../config/db.js";
import { hashPassword } from "../utils/crypto.js";
import {
  APPOINTMENT_STATUS,
  FACILITY_STATUS,
  FACILITY_TYPES,
  LAB_ORDER_STATUS,
  PHARMACY_RX_STATUS,
  REFERRAL_STATUS,
  ROLES,
  USER_STATUS,
} from "../utils/constants.js";
import { todayKey } from "../utils/time.js";
import {
  Appointment,
  AuditLog,
  Consultation,
  Department,
  DiagnosticReport,
  DiagnosticTest,
  DoctorProfile,
  Facility,
  FacilityDoctor,
  FollowUp,
  Invitation,
  LabOrder,
  MedicalRecord,
  MedicineItem,
  Notification,
  NetworkSettings,
  Patient,
  PharmacyFulfillment,
  Prescription,
  Queue,
  Referral,
  Schedule,
  Service,
  User,
  VerificationRequest,
} from "../models/index.js";

const PASSWORD = "Demo@2026!";

function hours() {
  return [1, 2, 3, 4, 5, 6].map((day) => ({ day, open: "08:00", close: "20:00", closed: false })).concat({
    day: 0,
    open: "09:00",
    close: "13:00",
    closed: false,
  });
}

async function run() {
  await connectDb();
  // Drop the whole DB so leftover unique indexes (e.g. old `user` field) cannot block seed.
  await mongoose.connection.dropDatabase();
  await mongoose.connection.asPromise();

  const passwordHash = await hashPassword(PASSWORD);

  const admin = await User.create({
    name: "Dr. Ananya Deshmukh",
    email: "admin@demo.mediconnect.ai",
    phone: "9000000001",
    passwordHash,
    role: ROLES.MAIN_ADMIN,
    status: USER_STATUS.ACTIVE,
  });

  await NetworkSettings.create({ key: "default", name: "Maharashtra provider network" });

  const abc = await Facility.create({
    name: "ABC Hospital",
    type: FACILITY_TYPES.HOSPITAL,
    status: FACILITY_STATUS.UNDER_REVIEW,
    address: "12 Care Avenue, Shivaji Nagar",
    city: "Pune",
    district: "Pune",
    state: "Maharashtra",
    pin: "411005",
    geo: { lat: 18.5204, lng: 73.8567 },
    contactNumber: "020-24440001",
    officialEmail: "hospital@demo.mediconnect.ai",
    licenceNumber: "MH-HOSP-8821",
    licenceAuthority: "Maharashtra Public Health Department",
    emergencyAvailable: true,
    consultationAvailable: true,
    diagnosticAvailable: true,
    medicineAvailable: true,
    occupancyHint: 82,
    operatingHours: hours(),
  });

  const xyz = await Facility.create({
    name: "XYZ Clinic",
    type: FACILITY_TYPES.CLINIC,
    status: FACILITY_STATUS.VERIFIED,
    address: "44 Wellness Lane",
    city: "Nagpur",
    district: "Nagpur",
    state: "Maharashtra",
    pin: "440001",
    geo: { lat: 21.1458, lng: 79.0882 },
    contactNumber: "0712-2555002",
    officialEmail: "clinic@demo.mediconnect.ai",
    licenceNumber: "MH-CLIN-4410",
    verifiedAt: new Date(),
    verifiedBy: admin._id,
    emergencyAvailable: false,
    consultationAvailable: true,
    diagnosticAvailable: false,
    medicineAvailable: true,
    occupancyHint: 40,
    operatingHours: hours(),
  });

  const cityNh = await Facility.create({
    name: "City Nursing Home",
    type: FACILITY_TYPES.NURSING_HOME,
    status: FACILITY_STATUS.VERIFIED,
    address: "8 Riverside Road",
    city: "Nashik",
    district: "Nashik",
    state: "Maharashtra",
    pin: "422001",
    geo: { lat: 19.9975, lng: 73.7898 },
    contactNumber: "0253-2466003",
    officialEmail: "nursing@demo.mediconnect.ai",
    licenceNumber: "MH-NH-2290",
    verifiedAt: new Date(),
    verifiedBy: admin._id,
    emergencyAvailable: true,
    consultationAvailable: true,
    diagnosticAvailable: true,
    medicineAvailable: true,
    occupancyHint: 61,
    operatingHours: hours(),
  });

  const daDx = await Facility.create({
    name: "DA Diagnostics",
    legalName: "DA Diagnostics Private Limited",
    type: FACILITY_TYPES.DIAGNOSTIC_CENTRE,
    status: FACILITY_STATUS.VERIFIED,
    address: "22 Lab Road",
    city: "Pune",
    district: "Pune",
    state: "Maharashtra",
    pin: "411001",
    contactNumber: "020-25550100",
    officialEmail: "diagnostics@demo.mediconnect.ai",
    licenceNumber: "MH-DX-1001",
    licenceAuthority: "State Public Health Department",
    verifiedAt: new Date(),
    verifiedBy: admin._id,
    diagnosticAvailable: true,
    consultationAvailable: false,
    medicineAvailable: false,
    operatingHours: hours(),
  });
  const centralLab = await Facility.create({
    name: "Central Pathology Lab",
    legalName: "Central Pathology LLP",
    type: FACILITY_TYPES.LABORATORY,
    status: FACILITY_STATUS.PENDING_VERIFICATION,
    address: "5 Science Park",
    city: "Nagpur",
    district: "Nagpur",
    state: "Maharashtra",
    pin: "440002",
    contactNumber: "0712-2666100",
    officialEmail: "lab@demo.mediconnect.ai",
    licenceNumber: "MH-LAB-2201",
    diagnosticAvailable: true,
    consultationAvailable: false,
    operatingHours: hours(),
  });
  const abcPharm = await Facility.create({
    name: "ABC Pharmacy",
    legalName: "ABC Pharmacy",
    type: FACILITY_TYPES.PHARMACY,
    status: FACILITY_STATUS.VERIFIED,
    address: "10 Dispense Street",
    city: "Pune",
    district: "Pune",
    state: "Maharashtra",
    pin: "411002",
    geo: { lat: 18.5204, lng: 73.8567 },
    contactNumber: "020-25550200",
    officialEmail: "pharmacy@demo.mediconnect.ai",
    licenceNumber: "MH-PH-3301",
    licenceAuthority: "State Pharmacy Council",
    verifiedAt: new Date(),
    verifiedBy: admin._id,
    medicineAvailable: true,
    consultationAvailable: false,
    deliveryAvailable: true,
    pickupAvailable: true,
    responsibleProfessional: { name: "Meera Joshi", designation: "Pharmacist", registrationNumber: "PCI-44112" },
    operatingHours: hours(),
  });
  const cityShop = await Facility.create({
    name: "City Medicine Shop",
    legalName: "City Medicine Shop",
    type: FACILITY_TYPES.MEDICINE_SHOP,
    status: FACILITY_STATUS.PENDING_VERIFICATION,
    address: "3 Market Lane",
    city: "Nashik",
    district: "Nashik",
    state: "Maharashtra",
    pin: "422002",
    contactNumber: "0253-2466200",
    officialEmail: "shop@demo.mediconnect.ai",
    licenceNumber: "MH-MS-4401",
    medicineAvailable: true,
    consultationAvailable: false,
    operatingHours: hours(),
  });
  const pimpriPharm = await Facility.create({
    name: "HealthCare Pharmacy",
    legalName: "HealthCare Pharmacy",
    type: FACILITY_TYPES.PHARMACY,
    status: FACILITY_STATUS.VERIFIED,
    address: "18 Service Road",
    city: "Pimpri-Chinchwad",
    district: "Pune",
    state: "Maharashtra",
    pin: "411018",
    geo: { lat: 18.6278, lng: 73.8007 },
    contactNumber: "020-27442000",
    officialEmail: "pimpri@demo.mediconnect.ai",
    licenceNumber: "MH-PH-3302",
    verifiedAt: new Date(),
    verifiedBy: admin._id,
    medicineAvailable: true,
    consultationAvailable: false,
    deliveryAvailable: false,
    pickupAvailable: true,
    operatingHours: hours(),
  });
  const nagpurPharm = await Facility.create({
    name: "Nagpur Medicals",
    legalName: "Nagpur Medicals",
    type: FACILITY_TYPES.PHARMACY,
    status: FACILITY_STATUS.VERIFIED,
    address: "7 Sitabuldi",
    city: "Nagpur",
    district: "Nagpur",
    state: "Maharashtra",
    pin: "440012",
    geo: { lat: 21.1498, lng: 79.0821 },
    contactNumber: "0712-25550300",
    officialEmail: "nagpurpharm@demo.mediconnect.ai",
    licenceNumber: "MH-PH-3303",
    verifiedAt: new Date(),
    verifiedBy: admin._id,
    medicineAvailable: true,
    consultationAvailable: false,
    deliveryAvailable: true,
    pickupAvailable: true,
    operatingHours: hours(),
  });

  const hospitalAdmin = await User.create({
    name: "Kavita Joshi",
    email: "hospital@demo.mediconnect.ai",
    phone: "9000000010",
    passwordHash,
    role: ROLES.FACILITY_ADMIN,
    status: USER_STATUS.ACTIVE,
    facilityId: abc._id,
  });
  const clinicAdmin = await User.create({
    name: "Rakesh Iyer",
    email: "clinic@demo.mediconnect.ai",
    phone: "9000000011",
    passwordHash,
    role: ROLES.FACILITY_ADMIN,
    status: USER_STATUS.ACTIVE,
    facilityId: xyz._id,
  });
  const nhAdmin = await User.create({
    name: "Sunita Patil",
    email: "nursing@demo.mediconnect.ai",
    phone: "9000000012",
    passwordHash,
    role: ROLES.FACILITY_ADMIN,
    status: USER_STATUS.ACTIVE,
    facilityId: cityNh._id,
  });
  await User.create({
    name: "Nisha Kulkarni",
    email: "diagnostics@demo.mediconnect.ai",
    phone: "9000000020",
    passwordHash,
    role: ROLES.FACILITY_ADMIN,
    status: USER_STATUS.ACTIVE,
    facilityId: daDx._id,
  });
  await User.create({
    name: "Vikram Shah",
    email: "lab@demo.mediconnect.ai",
    phone: "9000000021",
    passwordHash,
    role: ROLES.FACILITY_ADMIN,
    status: USER_STATUS.ACTIVE,
    facilityId: centralLab._id,
  });
  await User.create({
    name: "Meera Joshi",
    email: "pharmacy@demo.mediconnect.ai",
    phone: "9000000022",
    passwordHash,
    role: ROLES.FACILITY_ADMIN,
    status: USER_STATUS.ACTIVE,
    facilityId: abcPharm._id,
  });
  await User.create({
    name: "Imran Qureshi",
    email: "shop@demo.mediconnect.ai",
    phone: "9000000023",
    passwordHash,
    role: ROLES.FACILITY_ADMIN,
    status: USER_STATUS.ACTIVE,
    facilityId: cityShop._id,
  });
  await User.create({
    name: "Priya Kale",
    email: "pimpri@demo.mediconnect.ai",
    phone: "9000000024",
    passwordHash,
    role: ROLES.FACILITY_ADMIN,
    status: USER_STATUS.ACTIVE,
    facilityId: pimpriPharm._id,
  });
  await User.create({
    name: "Sanjay Deshpande",
    email: "nagpurpharm@demo.mediconnect.ai",
    phone: "9000000025",
    passwordHash,
    role: ROLES.FACILITY_ADMIN,
    status: USER_STATUS.ACTIVE,
    facilityId: nagpurPharm._id,
  });

  await VerificationRequest.create({
    facilityId: abc._id,
    submittedBy: hospitalAdmin._id,
    status: FACILITY_STATUS.UNDER_REVIEW,
  });
  await VerificationRequest.create({
    facilityId: centralLab._id,
    status: FACILITY_STATUS.PENDING_VERIFICATION,
  });
  await VerificationRequest.create({
    facilityId: cityShop._id,
    status: FACILITY_STATUS.PENDING_VERIFICATION,
  });

  const deptData = [
    [abc._id, ["Emergency", "General Medicine", "Cardiology", "Paediatrics", "Orthopaedics"]],
    [xyz._id, ["General Medicine", "Family Practice"]],
    [cityNh._id, ["Geriatrics", "General Medicine", "Rehabilitation"]],
  ];
  const deptMap = {};
  for (const [fid, names] of deptData) {
    for (const name of names) {
      const d = await Department.create({ facilityId: fid, name });
      deptMap[`${fid}-${name}`] = d._id;
    }
  }

  await Service.insertMany([
    { facilityId: abc._id, name: "Emergency care", category: "EMERGENCY", available: true },
    { facilityId: abc._id, name: "Inpatient beds", category: "INPATIENT", available: true },
    { facilityId: abc._id, name: "Laboratory", category: "DIAGNOSTIC", available: true },
    { facilityId: abc._id, name: "Pharmacy", category: "PHARMACY", available: true },
    { facilityId: xyz._id, name: "Outpatient consultation", category: "CONSULTATION", available: true },
    { facilityId: xyz._id, name: "Basic pharmacy", category: "PHARMACY", available: true },
    { facilityId: cityNh._id, name: "Long-term nursing", category: "INPATIENT", available: true },
    { facilityId: cityNh._id, name: "Diagnostics", category: "DIAGNOSTIC", available: true },
  ]);

  const rahmanUser = await User.create({
    name: "Dr. Arif Rahman",
    email: "doctor@demo.mediconnect.ai",
    phone: "9000000020",
    passwordHash,
    role: ROLES.DOCTOR,
    status: USER_STATUS.ACTIVE,
  });
  const rahmanProfile = await DoctorProfile.create({
    userId: rahmanUser._id,
    registrationNumber: "MMC-77821",
    specialization: "General Medicine",
    qualification: "MBBS, MD (Medicine)",
    experienceYears: 12,
    languages: ["English", "Hindi", "Marathi", "Urdu"],
    teleconsultationAvailable: true,
    credentialsVerified: true,
    verifiedAt: new Date(),
    availability: "AVAILABLE",
  });
  await FacilityDoctor.create({
    doctorProfileId: rahmanProfile._id,
    userId: rahmanUser._id,
    facilityId: xyz._id,
    departmentId: deptMap[`${xyz._id}-General Medicine`],
    status: "ACTIVE",
    consultationSchedule: { days: [1, 2, 3, 4, 5], start: "09:00", end: "14:00", durationMinutes: 15 },
  });

  const mehtaUser = await User.create({
    name: "Dr. Priya Mehta",
    email: "mehta@demo.mediconnect.ai",
    phone: "9000000021",
    passwordHash,
    role: ROLES.DOCTOR,
    status: USER_STATUS.ACTIVE,
  });
  const mehtaProfile = await DoctorProfile.create({
    userId: mehtaUser._id,
    registrationNumber: "MMC-55210",
    specialization: "Cardiology",
    qualification: "MBBS, DM (Cardiology)",
    experienceYears: 16,
    languages: ["English", "Marathi"],
    credentialsVerified: true,
    verifiedAt: new Date(),
    availability: "BUSY",
  });
  await FacilityDoctor.create({
    doctorProfileId: mehtaProfile._id,
    userId: mehtaUser._id,
    facilityId: abc._id,
    departmentId: deptMap[`${abc._id}-Cardiology`],
    status: "ACTIVE",
  });

  const kaleUser = await User.create({
    name: "Dr. Neha Kale",
    email: "kale@demo.mediconnect.ai",
    phone: "9000000022",
    passwordHash,
    role: ROLES.DOCTOR,
    status: USER_STATUS.ACTIVE,
  });
  const kaleProfile = await DoctorProfile.create({
    userId: kaleUser._id,
    registrationNumber: "MMC-33012",
    specialization: "Geriatrics",
    qualification: "MBBS, MD (Geriatrics)",
    experienceYears: 9,
    languages: ["Marathi", "Hindi"],
    credentialsVerified: true,
    verifiedAt: new Date(),
    availability: "AVAILABLE",
  });
  await FacilityDoctor.create({
    doctorProfileId: kaleProfile._id,
    userId: kaleUser._id,
    facilityId: cityNh._id,
    departmentId: deptMap[`${cityNh._id}-Geriatrics`],
    status: "ACTIVE",
  });
  await FacilityDoctor.create({
    doctorProfileId: rahmanProfile._id,
    userId: rahmanUser._id,
    facilityId: cityNh._id,
    departmentId: deptMap[`${cityNh._id}-General Medicine`],
    status: "ACTIVE",
  });

  await Schedule.create({
    doctorUserId: rahmanUser._id,
    facilityId: xyz._id,
    blocks: [{ days: [1, 2, 3, 4, 5], start: "09:00", end: "14:00", breakStart: "12:00", breakEnd: "12:30", durationMinutes: 15, online: true }],
    unavailableDates: [],
  });

  const patients = await Patient.insertMany([
    { mrn: "MC-000101", name: "Rahul Sharma", age: 34, sex: "Male", phone: "9811110001", city: "Pune", district: "Pune", bloodGroup: "B+", allergies: ["Penicillin"], homeFacilityId: abc._id },
    { mrn: "MC-000102", name: "Ayesha Khan", age: 29, sex: "Female", phone: "9811110002", city: "Nagpur", district: "Nagpur", bloodGroup: "O+", allergies: [], homeFacilityId: xyz._id },
    { mrn: "MC-000103", name: "Amit Roy", age: 52, sex: "Male", phone: "9811110003", city: "Nagpur", district: "Nagpur", bloodGroup: "A+", allergies: ["NSAIDs"], homeFacilityId: xyz._id },
    { mrn: "MC-000104", name: "Leela Pawar", age: 71, sex: "Female", phone: "9811110004", city: "Nashik", district: "Nashik", bloodGroup: "AB+", allergies: [], homeFacilityId: cityNh._id },
    { mrn: "MC-000105", name: "Sanjay Kulkarni", age: 46, sex: "Male", phone: "9811110005", city: "Pune", district: "Pune", bloodGroup: "O-", allergies: [], homeFacilityId: abc._id },
    { mrn: "MC-000106", name: "Meera Desai", age: 38, sex: "Female", phone: "9811110006", city: "Nagpur", district: "Nagpur", bloodGroup: "B-", allergies: [], homeFacilityId: xyz._id },
  ]);
  const [rahul, ayesha, amit, leela, sanjay, meera] = patients;

  const now = new Date();
  const at = (h, m) => {
    const d = new Date(now);
    d.setHours(h, m, 0, 0);
    return d;
  };

  const a1 = await Appointment.create({
    facilityId: xyz._id,
    doctorUserId: rahmanUser._id,
    patientId: ayesha._id,
    scheduledAt: at(9, 30),
    reason: "Follow-up for anaemia",
    status: APPOINTMENT_STATUS.WAITING,
    tokenNumber: 24,
  });
  const a2 = await Appointment.create({
    facilityId: xyz._id,
    doctorUserId: rahmanUser._id,
    patientId: amit._id,
    scheduledAt: at(10, 0),
    reason: "Chest discomfort screening",
    status: APPOINTMENT_STATUS.IN_CONSULTATION,
    tokenNumber: 25,
  });
  const a3 = await Appointment.create({
    facilityId: xyz._id,
    doctorUserId: rahmanUser._id,
    patientId: meera._id,
    scheduledAt: at(10, 30),
    reason: "Hypertension review",
    status: APPOINTMENT_STATUS.CHECKED_IN,
    tokenNumber: 26,
  });
  await Appointment.create({
    facilityId: xyz._id,
    doctorUserId: rahmanUser._id,
    patientId: ayesha._id,
    scheduledAt: at(16, 0),
    reason: "Lab result discussion",
    status: APPOINTMENT_STATUS.CONFIRMED,
  });
  await Appointment.create({
    facilityId: abc._id,
    doctorUserId: mehtaUser._id,
    patientId: rahul._id,
    scheduledAt: at(11, 0),
    reason: "Palpitations",
    status: APPOINTMENT_STATUS.BOOKED,
  });
  await Appointment.create({
    facilityId: abc._id,
    doctorUserId: mehtaUser._id,
    patientId: sanjay._id,
    scheduledAt: at(11, 30),
    reason: "Post-discharge review",
    status: APPOINTMENT_STATUS.COMPLETED,
    completedAt: now,
    completedBy: mehtaUser._id,
  });
  await Appointment.create({
    facilityId: cityNh._id,
    doctorUserId: kaleUser._id,
    patientId: leela._id,
    scheduledAt: at(9, 0),
    reason: "Mobility assessment",
    status: APPOINTMENT_STATUS.COMPLETED,
    completedAt: now,
    completedBy: kaleUser._id,
  });

  const dateKey = todayKey(now);
  await Queue.insertMany([
    { facilityId: xyz._id, doctorUserId: rahmanUser._id, appointmentId: a1._id, patientId: ayesha._id, dateKey, tokenNumber: 24, status: APPOINTMENT_STATUS.WAITING },
    { facilityId: xyz._id, doctorUserId: rahmanUser._id, appointmentId: a2._id, patientId: amit._id, dateKey, tokenNumber: 25, status: APPOINTMENT_STATUS.IN_CONSULTATION },
    { facilityId: xyz._id, doctorUserId: rahmanUser._id, appointmentId: a3._id, patientId: meera._id, dateKey, tokenNumber: 26, status: APPOINTMENT_STATUS.CHECKED_IN },
  ]);

  const consult = await Consultation.create({
    facilityId: xyz._id,
    doctorUserId: rahmanUser._id,
    patientId: amit._id,
    appointmentId: a2._id,
    chiefComplaint: "Intermittent chest tightness for 3 days",
    history: "Known hypertension. No syncope. Walks 2 km daily.",
    examination: "BP 148/92. Heart sounds S1 S2. No murmur.",
    assessment: "Possible angina equivalent — refer cardiology.",
    plan: "ECG, start referral to ABC Hospital cardiology.",
    vitals: { bp: "148/92", pulse: "88", temp: "36.8", spo2: "98%" },
    status: "IN_PROGRESS",
  });

  await MedicalRecord.create({
    patientId: amit._id,
    facilityId: xyz._id,
    authorUserId: rahmanUser._id,
    kind: "NOTE",
    title: "OPD note",
    body: "Chest tightness; hypertension; cardiology referral planned.",
    consultationId: consult._id,
  });

  const rx = await Prescription.create({
    facilityId: xyz._id,
    doctorUserId: rahmanUser._id,
    patientId: amit._id,
    consultationId: consult._id,
    status: "FINALIZED",
    issuedAt: new Date(),
    finalizedAt: new Date(),
    letterhead: {
      facilityName: xyz.name,
      department: "General Medicine",
      address: xyz.address,
      city: xyz.city,
      state: xyz.state,
      pin: xyz.pin,
      phone: xyz.contactNumber,
      email: xyz.officialEmail,
      website: "",
    },
    doctorSnapshot: {
      name: rahmanUser.name,
      qualification: rahmanProfile.qualification,
      registrationNumber: rahmanProfile.registrationNumber,
      specialization: rahmanProfile.specialization,
    },
    patientSnapshot: {
      name: amit.name,
      mrn: amit.mrn,
      age: String(amit.age),
      sex: amit.sex,
      address: `${amit.city}, ${amit.district}`,
      date: new Date().toLocaleDateString("en-IN"),
    },
    vitals: { bp: "148/92", temperature: "36.8 °C", pulse: "88", weight: "74 kg" },
    chiefComplaint: "Intermittent chest tightness for 3 days",
    diagnosis: "Possible angina equivalent; known hypertension",
    clinicalNotes: "ECG non-diagnostic. Cardiology referral planned.",
    medicines: [
      { name: "Aspirin", strength: "75 mg", dosage: "1-0-0", frequency: "Once daily", duration: "30 days", instructions: "After food" },
      { name: "Atorvastatin", strength: "10 mg", dosage: "0-0-1", frequency: "Once at night", duration: "30 days", instructions: "" },
    ],
    items: [
      { medicine: "Aspirin", dose: "75 mg", frequency: "Once daily", duration: "30 days", instructions: "After food" },
      { medicine: "Atorvastatin", dose: "10 mg", frequency: "Once at night", duration: "30 days", instructions: "" },
    ],
    investigations: [
      { name: "12-lead ECG", advised: true },
      { name: "Fasting lipid profile", advised: true },
    ],
    adviceItems: ["Avoid strenuous activity until cardiology review.", "Take medicines after food unless advised otherwise."],
    advice: "Avoid strenuous activity until cardiology review.",
    substitutionAllowed: false,
    followUpDate: new Date(Date.now() + 7 * 86400000),
  });

  await DiagnosticReport.create({
    patientId: amit._id,
    facilityId: xyz._id,
    requestedBy: rahmanUser._id,
    testName: "12-lead ECG",
    status: "READY",
    summary: "Sinus rhythm. Non-specific ST changes. Correlate clinically.",
    resultAt: new Date(),
  });

  const referral = await Referral.create({
    patientId: amit._id,
    fromFacilityId: xyz._id,
    fromDoctorUserId: rahmanUser._id,
    toFacilityId: abc._id,
    toDoctorUserId: mehtaUser._id,
    reason: "Evaluation of possible stable angina. ECG non-diagnostic.",
    specialty: "Cardiology",
    priority: "URGENT",
    status: REFERRAL_STATUS.CREATED,
    timeline: [{ status: REFERRAL_STATUS.CREATED, at: new Date(), note: "Created from XYZ Clinic OPD", actorId: rahmanUser._id }],
  });

  await FollowUp.insertMany([
    {
      patientId: ayesha._id,
      facilityId: xyz._id,
      doctorUserId: rahmanUser._id,
      dueAt: new Date(),
      reason: "Review haemoglobin after iron therapy",
      status: "PENDING",
    },
    {
      patientId: leela._id,
      facilityId: cityNh._id,
      doctorUserId: kaleUser._id,
      dueAt: new Date(Date.now() + 7 * 86400000),
      reason: "Physiotherapy progress",
      status: "SCHEDULED",
    },
  ]);

  const cbc = await DiagnosticTest.create({
    facilityId: daDx._id,
    name: "Complete Blood Count",
    code: "CBC",
    category: "Haematology",
    sampleType: "Whole blood",
    turnaroundMinutes: 180,
    available: true,
    status: "ACTIVE",
    units: "",
    referenceRange: "See report",
  });
  await DiagnosticTest.create({
    facilityId: daDx._id,
    name: "Fasting Blood Sugar",
    code: "FBS",
    category: "Biochemistry",
    sampleType: "Serum",
    preparation: "Fasting 8–10 hours",
    turnaroundMinutes: 120,
    available: true,
    status: "ACTIVE",
  });
  await Patient.create({
    mrn: "MC-000201",
    name: "Kiran Joshi",
    age: 41,
    sex: "Female",
    phone: "9811110201",
    city: "Pune",
    district: "Pune",
    homeFacilityId: daDx._id,
  });
  const labPatient = await Patient.findOne({ mrn: "MC-000201" });
  await LabOrder.create({
    facilityId: daDx._id,
    patientId: labPatient._id,
    testId: cbc._id,
    testName: cbc.name,
    testCode: cbc.code,
    sampleType: "Whole blood",
    status: LAB_ORDER_STATUS.PROCESSING,
    urgency: "ROUTINE",
    history: [{ status: LAB_ORDER_STATUS.REQUESTED, at: new Date(), facilityId: daDx._id }],
  });

  await MedicineItem.create({
    facilityId: abcPharm._id,
    name: "Atorvastatin",
    genericName: "Atorvastatin",
    brandName: "Atorva",
    strength: "10 mg",
    dosageForm: "Tablet",
    manufacturer: "Demo Labs",
    batchNumber: "AT-1001",
    expiryDate: new Date(Date.now() + 400 * 86400000),
    quantity: 80,
    reorderLevel: 20,
    unitPrice: 8,
    prescriptionRequired: true,
  });
  await MedicineItem.create({
    facilityId: abcPharm._id,
    name: "Aspirin",
    genericName: "Acetylsalicylic acid",
    strength: "75 mg",
    dosageForm: "Tablet",
    batchNumber: "AS-75",
    expiryDate: new Date(Date.now() + 20 * 86400000),
    quantity: 8,
    reorderLevel: 15,
    prescriptionRequired: true,
  });
  await MedicineItem.create({
    facilityId: abcPharm._id,
    name: "Paracetamol",
    genericName: "Paracetamol",
    brandName: "Dolo",
    strength: "650 mg",
    dosageForm: "Tablet",
    quantity: 400,
    reorderLevel: 50,
    unitPrice: 2,
    prescriptionRequired: false,
  });
  await MedicineItem.create({
    facilityId: abcPharm._id,
    name: "Amoxicillin",
    genericName: "Amoxicillin",
    strength: "500 mg",
    dosageForm: "Capsule",
    quantity: 120,
    reorderLevel: 20,
    unitPrice: 6,
    prescriptionRequired: true,
  });
  await MedicineItem.create({
    facilityId: abcPharm._id,
    name: "Azithromycin",
    genericName: "Azithromycin",
    strength: "500 mg",
    dosageForm: "Tablet",
    quantity: 60,
    reorderLevel: 15,
    unitPrice: 18,
    prescriptionRequired: true,
  });
  await MedicineItem.create({
    facilityId: pimpriPharm._id,
    name: "Paracetamol",
    genericName: "Paracetamol",
    brandName: "Calpol",
    strength: "650 mg",
    dosageForm: "Tablet",
    quantity: 80,
    unitPrice: 2.2,
    prescriptionRequired: false,
  });
  await MedicineItem.create({
    facilityId: pimpriPharm._id,
    name: "Cetirizine",
    genericName: "Cetirizine",
    strength: "10 mg",
    dosageForm: "Tablet",
    quantity: 40,
    unitPrice: 3,
    prescriptionRequired: false,
  });
  await MedicineItem.create({
    facilityId: nagpurPharm._id,
    name: "Paracetamol",
    genericName: "Paracetamol",
    strength: "650 mg",
    dosageForm: "Tablet",
    quantity: 200,
    unitPrice: 2,
    prescriptionRequired: false,
  });
  await MedicineItem.create({
    facilityId: nagpurPharm._id,
    name: "Amoxicillin",
    genericName: "Amoxicillin",
    strength: "500 mg",
    dosageForm: "Capsule",
    quantity: 20,
    unitPrice: 6.5,
    prescriptionRequired: true,
  });
  await PharmacyFulfillment.create({
    facilityId: abcPharm._id,
    prescriptionId: rx._id,
    sourceFacilityId: xyz._id,
    patientId: amit._id,
    doctorUserId: rahmanUser._id,
    status: PHARMACY_RX_STATUS.RECEIVED,
    lines: [
      { prescribedName: "Aspirin", prescribedQty: 1, dispensedQty: 0 },
      { prescribedName: "Atorvastatin", prescribedQty: 1, dispensedQty: 0 },
    ],
    history: [{ status: PHARMACY_RX_STATUS.RECEIVED, at: new Date(), facilityId: abcPharm._id }],
  });

  await AuditLog.insertMany([
    { actorId: admin._id, actorRole: ROLES.MAIN_ADMIN, action: "LOGIN", resource: "User", resourceId: String(admin._id) },
    { actorId: rahmanUser._id, actorRole: ROLES.DOCTOR, action: "PATIENT_VIEW", resource: "Patient", resourceId: String(amit._id), facilityId: xyz._id },
    { actorId: rahmanUser._id, actorRole: ROLES.DOCTOR, action: "REFERRAL_CREATE", resource: "Referral", resourceId: String(referral._id), facilityId: xyz._id },
  ]);

  await Notification.create({
    userId: hospitalAdmin._id,
    title: "Inbound referral",
    body: "XYZ Clinic referred Amit Roy for cardiology.",
    kind: "REFERRAL",
  });

  console.log("Seed complete. DEMO accounts (not for production):");
  console.log("  Main Admin       admin@demo.mediconnect.ai / Demo@2026!");
  console.log("  ABC Hospital     hospital@demo.mediconnect.ai / Demo@2026!  (facility pending verification)");
  console.log("  XYZ Clinic       clinic@demo.mediconnect.ai / Demo@2026!");
  console.log("  City Nursing     nursing@demo.mediconnect.ai / Demo@2026!");
  console.log("  Dr. Rahman       doctor@demo.mediconnect.ai / Demo@2026!");
  console.log("  DA Diagnostics   diagnostics@demo.mediconnect.ai / Demo@2026!");
  console.log("  Central Lab      lab@demo.mediconnect.ai / Demo@2026!  (pending verification)");
  console.log("  ABC Pharmacy     pharmacy@demo.mediconnect.ai / Demo@2026!");
  console.log("  HealthCare Pimpri pimpri@demo.mediconnect.ai / Demo@2026!");
  console.log("  Nagpur Medicals  nagpurpharm@demo.mediconnect.ai / Demo@2026!");
  console.log("  City Med Shop    shop@demo.mediconnect.ai / Demo@2026!  (pending verification)");
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
