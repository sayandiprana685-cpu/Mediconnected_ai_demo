import { env } from "../config/env.js";
import { User } from "../models/index.js";
import { AppError } from "../utils/errors.js";
import { verifyAccess } from "../utils/crypto.js";
import { USER_STATUS } from "../utils/constants.js";

export async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization;
    const bearer = header?.startsWith("Bearer ") ? header.slice(7) : null;
    const token = bearer || req.cookies?.mc_access;
    if (env.authCookieDebug) {
      // Presence flags only — never a credential value. The query string is
      // dropped because /api/auth/reset-password carries a single-use token.
      const path = String(req.originalUrl || req.url || "").split("?")[0];
      console.log(
        `[auth] ${req.method} ${path} bearer=${Boolean(bearer)} mc_access=${Boolean(
          req.cookies?.mc_access
        )} mc_refresh=${Boolean(req.cookies?.mc_refresh)} outcome=${token ? "token-present" : "no-token"}`
      );
    }
    if (!token) throw new AppError("Authentication required.", 401, "UNAUTHENTICATED");
    let decoded;
    try {
      decoded = verifyAccess(token);
    } catch {
      throw new AppError("Your session has expired. Please sign in again.", 401, "SESSION_EXPIRED");
    }
    const user = await User.findById(decoded.sub);
    if (!user) throw new AppError("Authentication required.", 401, "UNAUTHENTICATED");
    if (user.status === USER_STATUS.SUSPENDED || user.status === USER_STATUS.DEACTIVATED) {
      throw new AppError("This account is not permitted to continue.", 403, "ACCOUNT_DISABLED");
    }
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

export function optionalAuth(req, res, next) {
  const header = req.headers.authorization;
  const bearer = header?.startsWith("Bearer ") ? header.slice(7) : null;
  const token = bearer || req.cookies?.mc_access;
  if (!token) return next();
  authenticate(req, res, next);
}

export function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(new AppError("Authentication required.", 401, "UNAUTHENTICATED"));
    if (!roles.includes(req.user.role)) {
      return next(new AppError("You are not authorised to perform this action.", 403, "FORBIDDEN"));
    }
    next();
  };
}
