import { AuditLog } from "../models/index.js";

export async function writeAudit(req, { action, resource, resourceId, facilityId, metadata }) {
  try {
    await AuditLog.create({
      actorId: req.user?._id,
      actorRole: req.user?.role,
      action,
      resource,
      resourceId: resourceId ? String(resourceId) : undefined,
      facilityId: facilityId || req.facilityId,
      ip: req.ip,
      userAgent: req.get?.("user-agent"),
      metadata,
    });
  } catch (err) {
    console.error("audit write failed", err.message);
  }
}
