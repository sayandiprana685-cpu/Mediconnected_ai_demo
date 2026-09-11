import { Appointment, Facility, FacilityDoctor, Notification } from "../models/index.js";
import { authenticate } from "../middleware/authenticate.js";
import { requirePatient } from "../middleware/requirePatient.js";
import { asyncHandler, AppError } from "../utils/errors.js";
import { APPOINTMENT_STATUS, FACILITY_STATUS } from "../utils/constants.js";
import { requestPatientOtp, verifyPatientOtp, patientPublicProfile } from "../services/mobileAuth.service.js";
import {
  discoverDoctors,
  discoverProviders,
  getProvider,
  searchAll,
  searchMedicines,
} from "../services/mobileDiscovery.service.js";
import {
  getPrescription,
  getReport,
  listHealthRecords,
  listHealthTips,
  listPrescriptions,
  listReports,
  updatePatientLocation,
  updatePatientProfile,
} from "../services/mobileRecords.service.js";
import { cancelPatientOrder, createPatientOrder, getPatientOrder, listPatientOrders } from "../services/mobileOrders.service.js";
import { incrementalSync, listNotifications, markNotificationsRead } from "../services/mobileSync.service.js";
import { listConversations, listMessages, openConversation, sendMessage } from "../services/mobileMessages.service.js";
import { runPatientAi } from "../services/mobileAi.service.js";
import { reverseGeocode } from "../services/mobileGeocode.service.js";
import { notifyFacilityUsers } from "../services/notify.service.js";
import { logout, refreshSession } from "../services/auth.service.js";

const patientStack = [authenticate, requirePatient];

function locQuery(req) {
  return {
    district: req.query.district || req.patient?.district,
    city: req.query.city || req.patient?.city,
    lat: req.query.lat,
    lng: req.query.lng,
    state: req.query.state,
    q: req.query.q,
    type: req.query.type,
    page: req.query.page,
    limit: req.query.limit,
  };
}

export const mobileController = {
  requestOtp: asyncHandler(async (req, res) => {
    const data = await requestPatientOtp(req.body.phone);
    res.json(data);
  }),
  verifyOtp: asyncHandler(async (req, res) => {
    const data = await verifyPatientOtp(req, res, req.body);
    res.json(data);
  }),
  refresh: asyncHandler(async (req, res) => {
    const data = await refreshSession(req, res);
    if (data.user?.role && data.user.role !== "PATIENT") {
      throw new AppError("Use the provider portal for this account.", 403, "FORBIDDEN");
    }
    res.json(data);
  }),
  logout: asyncHandler(async (req, res) => {
    await logout(req, res);
    res.json({ ok: true });
  }),
  me: asyncHandler(async (req, res) => {
    res.json(patientPublicProfile(req.user, req.patient));
  }),
  patchMe: asyncHandler(async (req, res) => {
    const { user, patient } = await updatePatientProfile(req.user, req.patient, req.body);
    res.json(patientPublicProfile(user, patient));
  }),
  patchLocation: asyncHandler(async (req, res) => {
    const patient = await updatePatientLocation(req.patient, req.body);
    res.json(patientPublicProfile(req.user, patient));
  }),
  reverseGeocode: asyncHandler(async (req, res) => {
    const data = await reverseGeocode({ lat: req.body.lat ?? req.query.lat, lng: req.body.lng ?? req.query.lng });
    res.json(data);
  }),
  providers: asyncHandler(async (req, res) => {
    const data = await discoverProviders({ query: locQuery(req), patient: req.patient });
    res.json(data);
  }),
  providerOne: asyncHandler(async (req, res) => {
    const loc = locQuery(req);
    const provider = await getProvider(req.params.id, loc);
    res.json({ provider });
  }),
  doctors: asyncHandler(async (req, res) => {
    const data = await discoverDoctors({ query: locQuery(req), patient: req.patient });
    res.json(data);
  }),
  search: asyncHandler(async (req, res) => {
    const data = await searchAll({ query: locQuery(req), patient: req.patient });
    res.json(data);
  }),
  medicines: asyncHandler(async (req, res) => {
    const data = await searchMedicines({ query: locQuery(req), patient: req.patient });
    res.json(data);
  }),
  prescriptions: asyncHandler(async (req, res) => {
    const prescriptions = await listPrescriptions(req.patient._id);
    res.json({ prescriptions });
  }),
  prescriptionOne: asyncHandler(async (req, res) => {
    const prescription = await getPrescription(req.patient._id, req.params.id);
    res.json({ prescription });
  }),
  reports: asyncHandler(async (req, res) => {
    const reports = await listReports(req.patient._id, req.query.category);
    res.json({ reports });
  }),
  reportOne: asyncHandler(async (req, res) => {
    const data = await getReport(req.patient._id, req.params.id, req.query.kind || "lab_order");
    res.json(data);
  }),
  records: asyncHandler(async (req, res) => {
    const records = await listHealthRecords(req.patient._id);
    res.json(records);
  }),
  tips: asyncHandler(async (req, res) => {
    const tips = await listHealthTips();
    res.json({ tips });
  }),
  orders: asyncHandler(async (req, res) => {
    const orders = await listPatientOrders(req.user._id);
    res.json({ orders });
  }),
  orderOne: asyncHandler(async (req, res) => {
    const order = await getPatientOrder(req.user._id, req.params.id);
    res.json({ order });
  }),
  createOrder: asyncHandler(async (req, res) => {
    const order = await createPatientOrder({ user: req.user, patient: req.patient, body: req.body });
    res.status(201).json({ order });
  }),
  cancelOrder: asyncHandler(async (req, res) => {
    const order = await cancelPatientOrder(req.user._id, req.params.id);
    res.json({ order });
  }),
  sync: asyncHandler(async (req, res) => {
    const data = await incrementalSync({
      patient: req.patient,
      updatedSince: req.query.updatedSince,
      district: req.query.district,
      city: req.query.city,
    });
    res.json(data);
  }),
  notifications: asyncHandler(async (req, res) => {
    const data = await listNotifications(req.user._id);
    res.json(data);
  }),
  notificationsRead: asyncHandler(async (req, res) => {
    await markNotificationsRead(req.user._id);
    res.json({ ok: true });
  }),
  conversations: asyncHandler(async (req, res) => {
    const conversations = await listConversations(req.user._id);
    res.json({ conversations });
  }),
  openConversation: asyncHandler(async (req, res) => {
    const conversation = await openConversation(req.user._id, req.body.facilityId);
    res.json({ conversation });
  }),
  messages: asyncHandler(async (req, res) => {
    const data = await listMessages(req.user._id, req.params.id);
    res.json(data);
  }),
  sendMessage: asyncHandler(async (req, res) => {
    const message = await sendMessage(req.user._id, req.params.id, req.body.body);
    res.status(201).json({ message });
  }),
  ai: asyncHandler(async (req, res) => {
    const data = await runPatientAi({
      message: req.body.message,
      history: req.body.history || [],
      patient: req.patient,
      query: {
        district: req.patient.district,
        city: req.patient.city,
        lat: req.patient.geo?.lat,
        lng: req.patient.geo?.lng,
      },
    });
    res.json(data);
  }),
  bookConsult: asyncHandler(async (req, res) => {
    const { facilityId, doctorUserId, scheduledAt, reason } = req.body || {};
    const facility = await Facility.findOne({ _id: facilityId, status: FACILITY_STATUS.VERIFIED });
    if (!facility) throw new AppError("This facility is not available.", 404, "NOT_FOUND");
    const link = await FacilityDoctor.findOne({ facilityId, userId: doctorUserId, status: "ACTIVE" });
    if (!link) throw new AppError("This doctor is not available at that facility.", 422, "DOCTOR_NOT_LINKED");
    const when = scheduledAt ? new Date(scheduledAt) : new Date(Date.now() + 60 * 60 * 1000);
    const appt = await Appointment.create({
      facilityId,
      doctorUserId,
      patientId: req.patient._id,
      scheduledAt: when,
      reason: String(reason || "Consultation request from user app").slice(0, 300),
      status: APPOINTMENT_STATUS.BOOKED,
    });
    await notifyFacilityUsers(facilityId, {
      title: "New consultation request",
      body: `${req.patient.name} requested a visit.`,
      kind: "APPOINTMENT",
      channel: "appointments",
    });
    res.status(201).json({ appointment: appt });
  }),
  appointments: asyncHandler(async (req, res) => {
    const appointments = await Appointment.find({ patientId: req.patient._id }).sort({ scheduledAt: -1 }).limit(50);
    res.json({ appointments });
  }),
};

export { patientStack };
