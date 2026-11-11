# PRD — Remaining Tasks, Production Hardening & Release Readiness

**Project:** Qveto Platform — Enterprise Multi-Tenant SaaS & Collaboration Engine  
**Team:** Team Nexora  
**Specification Owner:** Systems Lead (Nishant Maurya) & Team Nexora Engineering  
**Version:** 1.1.0  
**Status:** Audit & Post-Mid-Review Hardening  
**Target Milestone:** Final Review & Production Release (Week 3 – Week 4 Completion)

---

## 1. Executive Summary & Audit Context

Following a comprehensive code and branch audit against the **Qveto Technologies Web Development Project Requirements PDF (Project 2)** and the **Internship SOP v1.1**, this document provides an **unvarnished, evidence-backed evaluation** of what has been implemented, what gaps remain, and the exact task roadmap required for final capstone sign-off.

### 📊 Current Codebase Health Matrix (Empirical Findings)
| Dimension | Current Status | Evidence / Verification |
|:---|:---:|:---|
| **Monorepo Architecture** | ✅ Verified | pnpm workspaces (`apps/api`, `apps/web`, `packages/shared`, `prisma`) |
| **Prisma Relational Schema** | ✅ Verified | 16 models normalized with composite keys & foreign cascades |
| **Authentication & Sessions** | ✅ Verified | Stateful PostgreSQL sessions, `HttpOnly` cookies, bcryptjs |
| **Multi-Tenant Isolation** | ✅ Verified | 29 passing isolation tests; strict 403 on cross-tenant access |
| **Workspace & Project CRUD** | ✅ Verified | PRD 02 APIs and Next.js views (`/workspaces`, `/projects`) |
| **Task Lifecycle & Kanban** | ✅ Verified | PRD 03 state machine (`TODO`➔`DONE`), subtasks, labels |
| **Collaboration Suite** | ✅ Verified | Threaded comments, file uploads, activity logging, notification bell |
| **My Work & Analytics** | ✅ Verified | PRD 05 cross-project aggregation & velocity engine (`/dashboard`) |
| **Members & Settings Pages** | ✅ Verified | Added under `feature/amrutha` (`/members`, `/settings`) |
| **API Automated Tests** | ⚠️ 221 Passed / 1 Skipped | 16 test suites; 1 skipped (`projects.persistence.test.ts` requires live DB) |
| **Browser E2E Tests** | ⚠️ 27 Passed (Mocked) | Playwright tests mock API via `page.route` rather than live backend |
| **Background Automation** | ❌ Missing | Overdue task check is an API endpoint; no active cron daemon |
| **Production Storage** | ⚠️ Dev Only | File attachments stored on local disk `uploads/`; no S3/R2 hook |
| **CI/CD Pipeline** | ❌ Missing | No `.github/workflows/ci.yml` for pull request automation |

---

## 2. Unvarnished Gap Analysis (No Sugarcoating)

### Gap 1: Automated Overdue Notification Cron / Background Worker
- **Current State:** `POST /api/notifications/check-overdue` executes deduplicated overdue detection, but it requires an external HTTP trigger.
- **Problem:** If no user or script calls this endpoint, overdue notifications are never generated in the database.
- **Required Task:** Implement a lightweight internal scheduler (`node-cron` or `setInterval` in `api/src/index.ts`) that runs every hour in development/production, or provide a scheduled GitHub Action / serverless webhook script.

### Gap 2: Production Cloud File Storage (S3 / Cloudflare R2 / Supabase Storage)
- **Current State:** File attachments (`AttachmentService`) are stored on the server's local file system in `uploads/`.
- **Problem:** In cloud deployments (e.g., Render, Railway, Vercel, AWS ECS), containers are ephemeral. On restart or scale-out, local files are destroyed.
- **Required Task:** Implement an S3-compatible cloud storage adapter (`@aws-sdk/client-s3`) switchable via `STORAGE_PROVIDER=local|s3` in `.env`.

### Gap 3: Live End-to-End Database Testing in Playwright
- **Current State:** The Playwright browser test suite mocks all `/api/**` calls using `page.route()`.
- **Problem:** UI tests pass even if the backend database schema or API routes break. Only 1 test (`projects.real-api.spec.ts`) tests live data, and it is skipped by default.
- **Required Task:** Add a dedicated live E2E test script (`pnpm test:e2e:live`) that boots the actual Express API and PostgreSQL container, seeds demo data, and runs real browser clicks through the live database.

### Gap 4: CI/CD Pipeline (GitHub Actions)
- **Current State:** Testing and typechecking are executed only on developers' local machines.
- **Problem:** Teammates could push broken code or failing tests to branches without automated build gates.
- **Required Task:** Create `.github/workflows/ci.yml` running `pnpm install`, `pnpm db:generate`, `pnpm typecheck`, `pnpm test`, and `pnpm build` on every push and pull request.

### Gap 5: Analytics UI Export to CSV
- **Current State:** The backend has a functional export route `GET /api/analytics/export?orgId=...&format=csv`, but the frontend dashboard has no export button.
- **Required Task:** Add an "Export Metrics (CSV)" button on the Analytics dashboard tab that triggers a direct browser download.

### Gap 6: Project Details & Kanban Integration
- **Current State:** On `/projects/[projectId]`, users can edit project settings and manage members, but there is no direct button to view that project's Kanban board.
- **Required Task:** Add a prominent "Open Project Kanban Board" button in `/projects/[projectId]` that navigates directly to `/tasks` with that project selected.

---

## 3. High-Priority Engineering Roadmap (Final Sprint)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       FINAL SPRINT EXECUTION ROADMAP                         │
├───────────────────┬───────────────────────────────────┬─────────────────────┤
│ Milestone         │ Action Item                       │ Owner / Assignee    │
├───────────────────┼───────────────────────────────────┼─────────────────────┤
│ 🚀 P0 — Integrity │ Overdue Cron Scheduler Worker     │ Backend Integrator  │
│ 🚀 P0 — Integrity │ GitHub Actions CI/CD Pipeline     │ Systems Lead (Niss) │
│ ⚡ P1 — UX Polish │ Project Page ➔ Kanban Direct Link │ Frontend Integrator │
│ ⚡ P1 — UX Polish │ Analytics Dashboard CSV Export    │ Frontend Integrator │
│ 🔒 P2 — Cloud     │ S3/R2 Cloud Storage Adapter       │ Infrastructure Lead │
│ 🧪 P2 — Testing   │ Live E2E Database Test Suite      │ QA Specialist       │
└───────────────────┴───────────────────────────────────┴─────────────────────┘
```

### Detailed Work Packages

#### Work Package 1: Background Overdue Alert Cron (`apps/api`)
- **File:** `apps/api/src/services/cron.service.ts`
- **Behavior:**
  - Instantiates a background timer on server boot (`setInterval` every 60 minutes or configurable via `OVERDUE_CRON_INTERVAL_MS`).
  - Calls `notificationService.checkAndAlertOverdueTasks()`.
  - Gracefully stops on `SIGTERM` / `SIGINT`.
  - Logs summary: `[CRON] Overdue task scan completed: X checked, Y alerts created.`

#### Work Package 2: GitHub Actions CI Pipeline (`.github/workflows`)
- **File:** `.github/workflows/ci.yml`
- **Matrix:** Node.js 18.x and 20.x on `ubuntu-latest`.
- **Steps:**
  1. Checkout repository.
  2. Setup `pnpm` with cache.
  3. Install dependencies (`pnpm install --frozen-lockfile`).
  4. Generate Prisma Client (`pnpm db:generate`).
  5. Static typecheck (`pnpm typecheck`).
  6. Run Vitest test suite (`pnpm test`).
  7. Run Next.js production build (`pnpm build`).

#### Work Package 3: Analytics CSV Export Button (`apps/web`)
- **File:** `apps/web/src/app/dashboard/page.tsx`
- **Behavior:**
  - Add "Export CSV Report" button on Analytics tab header.
  - Calls `GET /api/analytics/export?orgId=${currentOrg.id}&format=csv` with credentials.
  - Triggers blob download: `qveto-analytics-${orgSlug}-${date}.csv`.

#### Work Package 4: Kanban Shortcut on Project Detail (`apps/web`)
- **File:** `apps/web/src/app/projects/[projectId]/page.tsx`
- **Behavior:**
  - Add primary action button: "📋 Open Kanban Board".
  - Stores `projectId` in `sessionStorage` and navigates to `/tasks`.

---

## 4. Verification & Defense Checklist for Evaluators

When presenting the complete project to evaluators, verify the following runbook in order:

```bash
# 1. Fresh install & generate
pnpm install
pnpm db:generate

# 2. Strict Typecheck (0 errors across 3 packages)
pnpm typecheck

# 3. Backend Test Suite (221 passing assertions)
pnpm test

# 4. Multi-Tenant Seed Deployment
pnpm db:seed

# 5. Production Build
pnpm build

# 6. Start Development Servers
pnpm dev
```

### Key Demonstrations during Final Defense:
1. **Tenant Isolation:** Log in as `owner@nexora.com`, view engineering workspace, then log in as `employee@rival.com` and show strict 403 denial.
2. **Members & Settings:** Show the dedicated `/members` and `/settings` pages built on `feature/amrutha`.
3. **Kanban & Tasks:** Select a project via the Project Dropdown, drag a card from `TODO` to `DONE`, open the task details, and view threaded comments and file attachments.
4. **Productivity Analytics:** Navigate to `/dashboard`, view completion rates, velocity metrics, and personal "My Work" matrix.

---

## 5. Team Nexora Sign-Off

This document constitutes the official engineering audit and final milestone specification for **Team Nexora**. All code and branch contributions are maintained in compliance with the **Qveto SOP v1.1** branch and commit policy.
