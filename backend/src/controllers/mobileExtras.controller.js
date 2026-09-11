import { asyncHandler, AppError } from "../utils/errors.js";
import {
  bookLabOrder,
  cancelLabOrder,
  getLabOrder,
  listLabOrders,
  listLabTests,
  listPatientReferrals,
} from "../services/mobileLabs.service.js";
import {
  addMetric,
  createReminder,
  deleteMetric,
  deleteReminder,
  listMetrics,
  listReminders,
  updateReminder,
} from "../services/mobileHealth.service.js";
import {
  addPaymentMethod,
  getWallet,
  listTransactions,
  payFromWallet,
  priceCoupon,
  refundToWallet,
  removePaymentMethod,
  topUpWallet,
} from "../services/mobileWallet.service.js";
import {
  createFamilyMember,
  deleteFamilyMember,
  deleteReview,
  listFamilyMembers,
  listReviews,
  updateFamilyMember,
  writeReview,
} from "../services/mobilePeople.service.js";
import {
  createAiConversation,
  deleteAiConversation,
  listAiConversations,
  listAiHistory,
  listAiMessages,
  runAiChat,
} from "../services/mobileAiChat.service.js";
import {
  cancelAppointment,
  findEmergencyFacilities,
  labReportPdfBuffer,
  listAppointmentsDetailed,
  prescriptionPdfBuffer,
  rescheduleAppointment,
} from "../services/mobileCare.service.js";

function locQuery(req) {
  return {
    district: req.query.district || req.patient?.district,
    city: req.query.city || req.patient?.city,
    lat: req.query.lat,
    lng: req.query.lng,
    q: req.query.q,
    category: req.query.category,
    facilityId: req.query.facilityId,
  };
}

function sendPdf(res, { buffer, filename }) {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Content-Length", String(buffer.length));
  res.send(buffer);
}

export const mobileExtrasController = {
  // -------------------------------------------------------------------------
  // Lab tests and bookings
  // -------------------------------------------------------------------------

  labTests: asyncHandler(async (req, res) => {
    res.json(await listLabTests({ query: locQuery(req), patient: req.patient }));
  }),

  bookLabOrder: asyncHandler(async (req, res) => {
    const booking = await bookLabOrder({ user: req.user, patient: req.patient, body: req.body });
    res.status(201).json({ booking });
  }),

  labOrders: asyncHandler(async (req, res) => {
    res.json({ bookings: await listLabOrders(req.patient._id) });
  }),

  labOrderOne: asyncHandler(async (req, res) => {
    res.json({ booking: await getLabOrder(req.patient._id, req.params.id) });
  }),

  cancelLabOrder: asyncHandler(async (req, res) => {
    res.json({ booking: await cancelLabOrder(req.user._id, req.patient._id, req.params.id) });
  }),

  referrals: asyncHandler(async (req, res) => {
    res.json({ referrals: await listPatientReferrals(req.patient._id) });
  }),

  // -------------------------------------------------------------------------
  // Health metrics and medicine reminders
  // -------------------------------------------------------------------------

  metrics: asyncHandler(async (req, res) => {
    const data = await listMetrics(req.patient._id, {
      range: req.query.range,
      kind: req.query.kind,
      familyMemberId: req.query.familyMemberId,
      limit: req.query.limit,
    });
    res.json(data);
  }),

  addMetric: asyncHandler(async (req, res) => {
    res.status(201).json({ metric: await addMetric({ user: req.user, patient: req.patient, body: req.body }) });
  }),

  deleteMetric: asyncHandler(async (req, res) => {
    res.json(await deleteMetric(req.user._id, req.params.id));
  }),

  reminders: asyncHandler(async (req, res) => {
    res.json({ reminders: await listReminders(req.user._id, { includeInactive: req.query.includeInactive === "true" }) });
  }),

  createReminder: asyncHandler(async (req, res) => {
    res.status(201).json({ reminder: await createReminder({ user: req.user, patient: req.patient, body: req.body }) });
  }),

  updateReminder: asyncHandler(async (req, res) => {
    res.json({ reminder: await updateReminder(req.user._id, req.params.id, req.body) });
  }),

  deleteReminder: asyncHandler(async (req, res) => {
    res.json(await deleteReminder(req.user._id, req.params.id));
  }),

  // -------------------------------------------------------------------------
  // Health wallet
  // -------------------------------------------------------------------------

  wallet: asyncHandler(async (req, res) => {
    res.json({ wallet: await getWallet(req.user, req.patient) });
  }),

  walletTopUp: asyncHandler(async (req, res) => {
    res.json(await topUpWallet(req.user, req.body));
  }),

  walletPay: asyncHandler(async (req, res) => {
    res.json(await payFromWallet(req.user, req.body));
  }),

  walletRefund: asyncHandler(async (req, res) => {
    res.json(await refundToWallet(req.user, req.body));
  }),

  walletTransactions: asyncHandler(async (req, res) => {
    res.json({ transactions: await listTransactions(req.user._id, { type: req.query.type, limit: req.query.limit }) });
  }),

  walletAddMethod: asyncHandler(async (req, res) => {
    res.status(201).json({ wallet: await addPaymentMethod(req.user._id, req.body) });
  }),

  walletRemoveMethod: asyncHandler(async (req, res) => {
    res.json({ wallet: await removePaymentMethod(req.user._id, req.params.methodId) });
  }),

  walletApplyCoupon: asyncHandler(async (req, res) => {
    res.json(await priceCoupon(req.user._id, { code: req.body?.code, orderTotal: req.body?.orderTotal }));
  }),

  // -------------------------------------------------------------------------
  // Family members, ratings and reviews
  // -------------------------------------------------------------------------

  family: asyncHandler(async (req, res) => {
    res.json({ members: await listFamilyMembers(req.user._id) });
  }),

  createFamilyMember: asyncHandler(async (req, res) => {
    res.status(201).json({ member: await createFamilyMember({ user: req.user, patient: req.patient, body: req.body }) });
  }),

  updateFamilyMember: asyncHandler(async (req, res) => {
    res.json({ member: await updateFamilyMember(req.user._id, req.params.id, req.body) });
  }),

  deleteFamilyMember: asyncHandler(async (req, res) => {
    res.json(await deleteFamilyMember(req.user._id, req.params.id));
  }),

  reviews: asyncHandler(async (req, res) => {
    res.json(
      await listReviews({
        facilityId: req.query.facilityId,
        doctorUserId: req.query.doctorUserId,
        limit: req.query.limit,
        currentUserId: req.user._id,
      })
    );
  }),

  writeReview: asyncHandler(async (req, res) => {
    const data = await writeReview({ user: req.user, patient: req.patient, body: req.body });
    res.status(data.updated ? 200 : 201).json(data);
  }),

  deleteReview: asyncHandler(async (req, res) => {
    res.json(await deleteReview(req.user._id, req.params.id));
  }),

  // -------------------------------------------------------------------------
  // AI Health Assistant conversation history
  // -------------------------------------------------------------------------

  aiConversations: asyncHandler(async (req, res) => {
    res.json({
      conversations: await listAiConversations(req.user._id, {
        limit: req.query.limit,
        includeArchived: req.query.includeArchived === "true",
      }),
    });
  }),

  createAiConversation: asyncHandler(async (req, res) => {
    res.status(201).json({ conversation: await createAiConversation(req.user, req.patient, req.body) });
  }),

  aiMessages: asyncHandler(async (req, res) => {
    res.json(await listAiMessages(req.user._id, req.params.id, { limit: req.query.limit }));
  }),

  deleteAiConversation: asyncHandler(async (req, res) => {
    res.json(await deleteAiConversation(req.user._id, req.params.id));
  }),

  /**
   * One turn of the assistant: triage (text or voice) plus the navigation
   * suggestion, persisted to the conversation. Multipart when a recording is
   * attached, plain JSON otherwise - the same handler serves both.
   */
  aiChat: asyncHandler(async (req, res) => {
    if (!req.patient) throw new AppError("Patient profile was not found.", 404, "NOT_FOUND");
    const data = await runAiChat({ user: req.user, patient: req.patient, body: req.body || {}, file: req.file });
    res.json(data);
  }),

  aiHistory: asyncHandler(async (req, res) => {
    res.json({ results: await listAiHistory(req.patient._id, { limit: req.query.limit }) });
  }),

  // -------------------------------------------------------------------------
  // Emergency, appointments and documents
  // -------------------------------------------------------------------------

  emergency: asyncHandler(async (req, res) => {
    res.json(
      await findEmergencyFacilities({
        patient: req.patient,
        query: { lat: req.query.lat, lng: req.query.lng, district: req.query.district, city: req.query.city },
      })
    );
  }),

  appointmentsDetailed: asyncHandler(async (req, res) => {
    res.json({ appointments: await listAppointmentsDetailed(req.patient._id) });
  }),

  cancelAppointment: asyncHandler(async (req, res) => {
    res.json({ appointment: await cancelAppointment(req.patient._id, req.params.id) });
  }),

  rescheduleAppointment: asyncHandler(async (req, res) => {
    res.json({ appointment: await rescheduleAppointment(req.patient._id, req.params.id, req.body) });
  }),

  prescriptionPdf: asyncHandler(async (req, res) => {
    sendPdf(res, await prescriptionPdfBuffer(req.patient._id, req.params.id));
  }),

  labReportPdf: asyncHandler(async (req, res) => {
    sendPdf(res, await labReportPdfBuffer(req.patient._id, req.params.id));
  }),
};
