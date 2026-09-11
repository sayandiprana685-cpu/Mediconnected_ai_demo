# MediConnect AI

**A provider-side healthcare access and continuity platform** — one secure portal for hospitals, nursing homes, clinics, and doctors, with a government command layer for network stewardship.

This repository is the **Provider Platform** only. A patient mobile application, AI triage, and teleconsultation are future phases and are not implemented here except as API-ready structures.

---

## Problem

In many rural and underserved districts, care is fragmented. A patient may reach a clinic, wait without a token, receive no documented referral, and disappear from follow-up. Facilities operate in isolation. Government teams cannot see, in one place, which sites are verified, overloaded, or failing to complete referrals.

The result is broken continuity: **Patient → facility → doctor → diagnostics → referral → medicine → follow-up** never becomes a single accountable pathway.

## Solution

MediConnect AI connects:

**Patient → Healthcare Provider → Doctor → Facility → Referral → Follow-up**

This codebase implements the **provider operating system**:

- Facilities register and wait for government verification before going fully live.
- Doctors are invited, never password-created by an administrator.
- One doctor account can belong to many verified facilities, with a facility switcher for context.
- Appointments, queue, consultations, prescriptions, and referrals are real workflows with server-side authorization.
- Main Admin sees **aggregated** network intelligence, not unrestricted medical records.

---

## Provider Platform

| Actor | What they use |
| --- | --- |
| **Hospital / Nursing Home / Clinic** | Facility Admin dashboard for operations, doctors, queue, referrals |
| **Doctor** | Clinical board: schedule, queue, consultation, prescription, referral |
| **Government / Main Admin** | Healthcare Network Command Center: verification, coverage, audit |

Future facility types (diagnostic centres, pharmacies) are modelled in the facility type enum but not fully productised in this MVP.

---

## Key Features

- **Single Provider Portal login** — email/password or OTP; role detected after authentication
- **RBAC** — `MAIN_ADMIN`, `FACILITY_ADMIN`, `DOCTOR` enforced on every protected API
- **Facility registration** — pending → under review → verified or rejected; **✓ Verified Facility** badge
- **Doctor invitation** — unique, time-limited, single-use tokens; OTP activation; accept/decline for existing accounts
- **Multi-facility doctors** — one profile, many `FacilityDoctor` links, header facility switcher
- **Appointments & queue** — BOOKED → CONFIRMED → CHECKED_IN → WAITING → IN_CONSULTATION → COMPLETED (plus cancel / no-show / reschedule)
- **Consultations & prescriptions** — clinical notes, vitals, follow-up scheduling, audited writes
- **Referral lifecycle** — CREATED → ACCEPTED → … → CLOSED, with timeline
- **Doctor schedule** — working blocks, breaks, duration, leave dates; overlap validation on the server
- **Government analytics** — demand by district, occupancy hints, referral completion, diagnostic/medicine availability
- **Audit logs** — login, patient view, prescriptions, referrals, invitations, verification, suspensions
- **Email (Nodemailer)** — invitations, verification results, password reset, OTP; development outbox when SMTP is unset
- **Minimum-necessary access** — doctors and facility admins only see patients in their facility/assignment; Main Admin APIs return aggregates, not full charts

Messages (secure chat) and teleconsultation video are labelled **coming soon**.

---

## Role Architecture

| Role | Access | Dashboard |
| --- | --- | --- |
| **Main Admin** | Network facilities, verification, verified doctors, aggregated analytics, audit, suspend accounts. No automatic access to complete patient records. | Government Command Center |
| **Facility Admin** | Own facility only: profile, doctors/invites, staff, services, appointments, queue, operational patients, inbound/outbound referrals, analytics | Hospital / Clinic / Nursing Home operations (hospital view is denser) |
| **Doctor** | Assigned facility context: own schedule, queue, consultations, prescriptions, relevant patients, referrals, follow-ups | Clinical board (patient → consultation → action) |

---

## Appointment & Queue Workflow

Operational “today” is **India Standard Time** (`Asia/Kolkata`, UTC+05:30). Dashboard queries use start/end of the IST calendar day, not naive UTC `setHours` or `toISOString().slice(0,10)`.

### 1. Appointment creation

A facility admin or doctor books against a patient, assigned **doctor** (`doctorUserId`), and **facility** (`facilityId`). Status starts at `BOOKED`. Slot clashes at the same timestamp are rejected.

### 2–3. Facility ownership and doctor assignment

Every appointment stores `facilityId` and `doctorUserId`. Facility admins are scoped to `user.facilityId` (never a client-supplied facility). Doctors may send `x-facility-id` only if they have an **ACTIVE** `FacilityDoctor` link; otherwise the API returns 403.

### 4. Today's appointments

Count of appointments with `scheduledAt` between IST midnight and 23:59:59.999 **today**, all statuses included (cancelled and no-show still count as scheduled today). Completing a visit does **not** reduce this number.

### 5. Waiting patients

Count of those same-day appointments with status **`WAITING`** only. Not `CHECKED_IN`, not `IN_CONSULTATION`, not cancelled/no-show, not the total patient census.

### 6–7. Consultation completion

Typical path: `BOOKED` → `CONFIRMED` → check-in (`WAITING` + queue token) → **Start consultation** (`IN_CONSULTATION`, notes stay open) → doctor confirms **Complete consultation**.

`POST /api/appointments/:id/complete` (doctor only):

- Authenticates, loads the appointment, checks facility + assigned doctor
- Rejects already `COMPLETED` (409) and another doctor’s visit (403)
- Sets `status=COMPLETED`, `completedAt`, `completedBy`
- Syncs queue + in-progress consultation
- Writes audit `APPOINTMENT_COMPLETED`

Opening a patient record does not complete the visit.

### 8. Completed consultations

Same-day appointments with status **`COMPLETED`**. Cancelled and no-show are excluded.

### 9. Role-based dashboard metrics

| Metric | Doctor | Facility admin | Main admin |
| --- | --- | --- | --- |
| Today's appointments | Own list at current authorized facility | All at their facility | Network-wide |
| Waiting patients | Own `WAITING` today | Facility `WAITING` today | Network `WAITING` today |
| Completed consultations | Own `COMPLETED` today | Facility `COMPLETED` today | Network `COMPLETED` today |
| Pending follow-ups | Own, `dueAt` ≤ end of IST today, status pending/scheduled | Facility-wide, same due rule | Network-wide, same due rule |

APIs: `GET /api/analytics/doctor`, `/facility`, `/government`.

### 10–11. Authorization and audit

Cross-facility reads/writes are blocked. Doctors cannot complete another doctor’s appointment. Completion is audited with actor, appointment id, facility, timestamp — no clinical note body.

### 12. API endpoints

| Method | Path | Role |
| --- | --- | --- |
| POST | `/api/appointments` | Doctor / facility admin |
| POST | `/api/appointments/:id/check-in` | Doctor / facility admin |
| POST | `/api/appointments/:id/complete` | Assigned doctor |
| GET | `/api/queue` | Active tokens today (IST `dateKey`); completed listed separately |
| POST | `/api/consultations` | Start (does not complete) |
| PATCH | `/api/consultations/:id` | Notes; `status=COMPLETED` also completes the appointment |

### 13. Testing workflow

1. Seed + sign in as Dr. Rahman at XYZ Clinic — today’s count is his XYZ list only.
2. Waiting = Ayesha (`WAITING`); completed does not include Amit (`IN_CONSULTATION`).
3. Complete Amit from Queue → waiting unchanged (he was not WAITING); completed +1; today’s total unchanged.
4. Refresh — same numbers.
5. Clinic admin vs hospital admin — different facility totals.
6. Main admin — sum of today’s appointments across facilities.
7. Another doctor completing Rahman’s appointment → 403.

---

## Doctor Invitation Flow

1. Facility must be **VERIFIED**.
2. Facility Admin opens **Doctors → Invite** and enters professional details (no password).
3. Server creates a hashed, expiring, single-use token and emails a link (or logs a **development demo link**).
4. Doctor opens `/invite/:token` — the link itself does **not** grant patient access.
5. **New doctor:** OTP to email → create password → account created → **Accept invitation**.
6. **Existing doctor:** sign in with the same email → **Accept** or **Decline**.
7. On accept, `FacilityDoctor` becomes `ACTIVE`. Duplicate doctor profiles are not created.

Invitation statuses: Sent → Opened → Accepted (or Declined / Expired / Revoked).

---

## Authentication Flow

```
Provider Login
    → Credentials or OTP
    → HTTP-only access + refresh cookies
    → GET /api/auth/me (role + facility associations)
    → Role-aware shell
         MAIN_ADMIN     → Government dashboard
         FACILITY_ADMIN → Facility dashboard (type-specific density)
         DOCTOR         → Doctor dashboard + facility switcher
```

Frontend route guards hide unauthorized pages; **backend middleware still rejects** unauthorized calls.

---

## Security

Implemented in this MVP:

- **RBAC** on Express routes (`authenticate`, `authorize`, facility association, resource checks)
- **JWT access (15m) + refresh (7d)** in HTTP-only cookies; silent refresh from the SPA
- **bcrypt** password hashing; failed-login lockout
- **OTP** for login and doctor activation
- **Invitation tokens** stored as SHA-256 hashes, expiry, single use
- **Rate limiting** on auth and general API
- **Helmet, CORS credentials, no secrets in frontend**
- **Audit logs** for sensitive actions
- **Minimum-necessary** patient queries (facility / assigned doctor)
- Environment-driven SMTP and JWT secrets

**Not claimed:** HIPAA/DISHA/ABDM certification, production HSM, field-level encryption at rest for all PHI, or a completed DPIA. MongoDB disk encryption and TLS termination are **deployment** concerns. Do not treat this hackathon MVP as a certified clinical system.

Production hardening still needed: secrets rotation, WAF, backup/restore drills, document upload virus scanning, SMS OTP provider, passkeys/SSO, and a formal consent ledger for the future patient app.

---

## Technology Stack

- React.js (Vite)
- Node.js + Express.js
- MongoDB + Mongoose
- Nodemailer
- Tailwind CSS v4.3
- JWT (cookies), bcryptjs, Zod validation, Helmet, express-rate-limit

---

## Architecture

```
Browser (Provider Portal)
        │
        ▼
   React (Vite)  ── /api proxy ──►  Express API
                                      │
                    authenticate / authorize / validate / rateLimit
                                      │
                                 Controllers
                                      │
                              Domain services
                         (auth, invitation, email, audit)
                                      │
                                  Mongoose
                                      │
                                  MongoDB
```

```
Provider Portal
    → API
    → Authentication (cookies)
    → RBAC + facility context (x-facility-id for doctors)
    → Database
```

---

## Folder Structure

```
provider_mng/
  package.json              Root scripts (dev, seed, install:all)
  .env.example              Documented environment variables
  README.md
  backend/
    src/
      config/               env, Mongo connection
      models/               User, Facility, DoctorProfile, Invitation, …
      routes/               auth, facilities, doctors, clinical, admin, analytics
      controllers/
      services/             auth, invitation, email, audit
      middleware/           authenticate, authorize, patientAccess, rateLimiter
      utils/                crypto, constants, email outbox
      seed/                 fictional demo data
  frontend/
    src/
      pages/                auth, doctor, facility, admin, shared
      layouts/              AuthLayout, AppShell (role-aware nav)
      components/ui/        Button, Table, Modal, StatCard, …
      hooks/                useAuth, useApi
      services/api.js       fetch + refresh retry
```

---

## Environment Variables

Copy [`.env.example`](.env.example) to `backend/.env`. Never commit real secrets.

| Variable | Purpose |
| --- | --- |
| `NODE_ENV` | `development` or `production` |
| `PORT` | API port (default `5000`) |
| `CLIENT_URL` | SPA origin for CORS and invite/reset links |
| `MONGO_URI` | MongoDB connection string |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Signing keys (long random strings) |
| `JWT_ACCESS_EXPIRES` / `JWT_REFRESH_EXPIRES` | Token lifetimes |
| `INVITE_TOKEN_EXPIRES_HOURS` | Doctor invite TTL (default 72) |
| `OTP_EXPIRES_MINUTES` | OTP TTL |
| `BCRYPT_ROUNDS` | Password hash cost |
| `APP_TZ` | Dashboard “today” timezone (`Asia/Kolkata`) |
| `EMAIL_HOST` `EMAIL_PORT` `EMAIL_USER` `EMAIL_PASSWORD` `EMAIL_FROM` | SMTP. If host/user are empty, mail is printed and stored in a **dev outbox**. |

---

## Installation

Requires **Node.js 20+** and **MongoDB** running locally (or a reachable URI).

```bash
npm install
npm run install:all
```

Copy environment file:

```bash
copy .env.example backend\.env
```

(On macOS/Linux: `cp .env.example backend/.env`.)

Edit `backend/.env` and set `MONGO_URI` and JWT secrets.

---

## Running the Project

From the repository root (API + Vite together):

```bash
npm run dev
```

- API: [http://127.0.0.1:5000](http://127.0.0.1:5000) — health: `/api/health`
- Web: [http://localhost:5173](http://localhost:5173) — `/api` is proxied to the API

Separate terminals if you prefer:

```bash
npm run dev:backend
npm run dev:frontend
```

---

## Database Setup

1. Install and start MongoDB Community (or Docker: `docker run -p 27017:27017 mongo`).
2. Confirm `MONGO_URI` (default `mongodb://127.0.0.1:27017/mediconnect_ai`).
3. Seed demo documents (wipes collections in that database):

```bash
npm run seed
```

---

## Seed Data

`npm run seed` loads **fictional** facilities, clinicians, and patients in Maharashtra (Pune, Nagpur, Nashik). **Never use real patient information.**

ABC Hospital starts as **UNDER_REVIEW** so the government verification demo is visible. XYZ Clinic and City Nursing Home are already verified. Dr. Arif Rahman is linked to XYZ Clinic and City Nursing Home (multi-facility), **not** ABC until you invite him after verification.

---

## Demo Credentials

**DEMO accounts only — not for production.** Password for all: `Demo@2026!`

| Role | Email |
| --- | --- |
| Main Admin | [admin@demo.mediconnect.ai](mailto:admin@demo.mediconnect.ai) |
| ABC Hospital admin | [hospital@demo.mediconnect.ai](mailto:hospital@demo.mediconnect.ai) |
| XYZ Clinic admin | [clinic@demo.mediconnect.ai](mailto:clinic@demo.mediconnect.ai) |
| City Nursing Home admin | [nursing@demo.mediconnect.ai](mailto:nursing@demo.mediconnect.ai) |
| Doctor (Dr. Arif Rahman) | [doctor@demo.mediconnect.ai](mailto:doctor@demo.mediconnect.ai) |

Additional seeded clinicians: `mehta@demo.mediconnect.ai`, `kale@demo.mediconnect.ai` (same password).

---

## Provider Onboarding Demo

Primary hackathon journey:

1. Sign in as **Main Admin**.
2. Open **Verification** — ABC Hospital is pending.
3. **Verify** ABC Hospital (✓ Verified Facility).
4. Sign out; sign in as **hospital@demo.mediconnect.ai**.
5. **Doctors → Invite**. For an existing-account demo, invite `doctor@demo.mediconnect.ai` (Dr. Rahman already exists). Or invite a new email.
6. Copy the **development invitation link** shown after send (also in the API console / `/api/dev/outbox` when not in production).
7. Open the link → OTP (check API logs) → create password **or** sign in if the account exists → **Accept invitation**.
8. Sign in on the **same** Provider Portal.
9. Role = **DOCTOR** → Doctor Dashboard.
10. Set **Schedule** for ABC Hospital (use the facility switcher).
11. As hospital admin, **book an appointment** for that doctor and **check in**.
12. Doctor opens **Queue** → **Start consultation** → notes → complete (optional follow-up).
13. **Write prescription**; **Create referral** to another verified site (e.g. XYZ or keep cardiology path).
14. Facility Admin sees referral status; Main Admin sees aggregated referral/network stats.

Seeded live data at XYZ Clinic already includes today’s queue for Dr. Rahman (Ayesha waiting, Amit in consultation) and an urgent cardiology referral to ABC — useful if you skip invitation and log in as the doctor first.

---

## API Documentation

Base: `/api`. Session cookies required except register, login, OTP request, invite preview, and health.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Liveness |
| POST | `/api/auth/login` | Password login |
| POST | `/api/auth/otp/request` | Send login OTP |
| POST | `/api/auth/otp/login` | OTP login |
| POST | `/api/auth/refresh` | Rotate tokens |
| POST | `/api/auth/logout` | Clear session |
| GET | `/api/auth/me` | Current user, facilities, doctor profile |
| POST | `/api/auth/forgot-password` | Reset email |
| POST | `/api/auth/reset-password` | Apply reset token |
| POST | `/api/facilities/register` | New facility + admin (under review) |
| GET/PATCH | `/api/facilities/me` | Own facility |
| POST | `/api/facilities/me/departments` | Add department |
| POST | `/api/facilities/me/services` | Add service |
| GET | `/api/admin/facilities` | Network list (Main Admin) |
| GET | `/api/admin/facilities/:id` | Facility dossier |
| GET | `/api/admin/verifications` | Pending reviews |
| POST | `/api/admin/facilities/:id/decision` | `VERIFY` / reject |
| GET | `/api/admin/doctors` | Verified professionals |
| POST | `/api/admin/users/:id/status` | Suspend / status |
| GET | `/api/admin/audit` | Audit trail |
| POST | `/api/doctors/invite` | Send invitation |
| GET | `/api/doctors/invite/:token` | Preview (no PHI) |
| POST | `/api/doctors/invite/:token/otp` | Invite OTP |
| POST | `/api/doctors/activate` | Create doctor account |
| POST | `/api/doctors/invite/:token/accept\|decline` | Association |
| GET | `/api/doctors` | Facility roster + invitations |
| GET/PATCH | `/api/doctors/profile/me` | Doctor profile |
| GET/PUT | `/api/doctors/schedule` | Per-facility schedule |
| GET | `/api/doctors/availability` | Roster availability |
| GET/POST | `/api/patients` | List / register |
| GET | `/api/patients/:id` | Facility-scoped record (audited) |
| GET/POST | `/api/appointments` | List / book |
| PATCH | `/api/appointments/:id` | Status / reschedule |
| POST | `/api/appointments/:id/check-in` | Token + queue |
| GET/PATCH | `/api/queue` | Today’s board |
| GET/POST/PATCH | `/api/consultations` | Start / document |
| GET/POST | `/api/prescriptions` | Issue Rx |
| GET/POST/PATCH | `/api/referrals` | Continuity lifecycle |
| GET/PATCH | `/api/follow-ups` | Planned returns |
| GET | `/api/analytics/doctor\|facility\|government` | Role dashboards |
| GET | `/api/staff` | Facility admins |
| GET | `/api/notifications` | In-app notices |
| GET | `/api/network/facilities` | Verified sites (referral targets) |
| GET | `/api/dev/outbox` | Dev-only emailed payload list |

Doctors must send header `x-facility-id` (the SPA does this after the switcher).

---

## Security Notes

**In this build:** cookie sessions, RBAC, hashed invites, audit, rate limits, no PHI in `localStorage` (only selected `facilityId`).

**Still required for production:** managed secrets, HTTPS everywhere, Mongo auth + encryption, email/SMS provider SLA, backup, penetration test, legal review, and patient-app consent. Invitation emails in development may appear in the console if SMTP is not configured.

---

## Future Scope

Not built in this repository (by design):

- Patient mobile application
- AI symptom triage
- Teleconsultation (video)
- Offline mode
- ABDM / approved interoperability
- Multilingual voice assistant
- Advanced referral tracking beyond the current lifecycle
- Full diagnostic/pharmacy provider portals
- Deeper government analytics and emergency escalation

---

## Licence

Provided as a hackathon / demonstration MVP. Not a certified medical device or a substitute for professional clinical judgement.
