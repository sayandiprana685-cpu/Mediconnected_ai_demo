import { Notification, User } from "../models/index.js";

export const DEFAULT_NOTIFICATION_PREFS = {
  appointments: true,
  referrals: true,
  followUps: true,
  system: true,
  email: true,
  inApp: true,
};

export function prefsOf(user) {
  return { ...DEFAULT_NOTIFICATION_PREFS, ...(user?.notificationPrefs?.toObject?.() || user?.notificationPrefs || {}) };
}

export async function notifyUser(userOrId, { title, body, kind, channel }) {
  const user = typeof userOrId === "object" && userOrId?._id ? userOrId : await User.findById(userOrId);
  if (!user) return null;
  const p = prefsOf(user);
  if (p.inApp === false) return null;
  if (channel && p[channel] === false) return null;
  return Notification.create({
    userId: user._id,
    title,
    body,
    kind: kind || channel || "SYSTEM",
  });
}

export async function notifyFacilityUsers(facilityId, payload) {
  if (!facilityId) return;
  const users = await User.find({ facilityId, status: "ACTIVE" }).select("_id notificationPrefs");
  await Promise.all(users.map((u) => notifyUser(u, payload)));
}

export async function ifEmailAllowed(userOrId, sendFn) {
  const user = typeof userOrId === "object" && userOrId?._id ? userOrId : await User.findById(userOrId);
  if (!user) return null;
  if (prefsOf(user).email === false) return null;
  return sendFn();
}
