# Qveto Platform — Team Nexora

> **Project Management & Team Collaboration SaaS**  
> Qveto Technologies Web Development Internship — Project 2  
> **Assigned Lead / Foundation Owner:** Nishant Maurya (`feature/nishant` / `Niss`)

---

## 🚀 Overview

Qveto is a responsive, full-stack multi-tenant SaaS application that centralizes ownership, priorities, deadlines, dependencies, and work status across organizations, workspaces, teams, projects, and tasks.

This repository establishes the **P0 Platform Foundation**:

- **Multi-Tenant Architecture:** Strict server-side organization isolation. Users in Organization A can never read or mutate Organization B's resources.
- **Robust Authentication:** Server-managed sessions stored in PostgreSQL with secure `HttpOnly`, `SameSite=Lax` cookies, generic error handling, and `bcryptjs` password hashing.
- **Granular RBAC:** Server-enforced capabilities for `OWNER`, `MANAGER`, and `EMPLOYEE`.
- **Database & Domain Foundation:** Comprehensive Prisma schema (16 models) covering users, organizations, workspaces, teams, projects, tasks, comments, attachments, activity events, and notifications.
- **Frontend Shell:** Modern Next.js 14 App Router shell with responsive Navbar, Organization Switcher dropdown, role pills, sign-in/register screens, and protected dashboard.
- **Checked-in Migrations & Seed:** Reproducible, idempotent PostgreSQL seed script creating two synthetic organizations for testing and evaluation.

---

## 🛠️ Tech Stack

| Layer               | Technologies                                                                  |
| ------------------- | ----------------------------------------------------------------------------- |
| **Frontend**        | Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS                   |
| **Backend**         | Node.js, Express 4 / 5, TypeScript                                            |
| **Database**        | PostgreSQL, Prisma ORM 6                                                      |
| **Validation**      | Zod (Shared schemas in `@qveto/shared`)                                       |
| **Security**        | `bcryptjs`, `cookie-parser`, `helmet`, `cors`, server-side session management |
| **Testing**         | Vitest (Unit & Integration), Supertest (API), Playwright (E2E)                |
| **Package Manager** | `pnpm` workspaces                                                             |

---

## 📁 Monorepo Structure

```text
├── apps/
│   ├── api/                    # Express REST API (port 4000)
│   │   ├── src/
│   │   │   ├── config/         # Environment validation (Zod + dotenv)
│   │   │   ├── lib/            # Prisma singleton client
│   │   │   ├── middleware/     # Request ID, logger, error handler, auth, tenant scoping
│   │   │   ├── routes/         # Health, auth (/api/auth), organizations (/api/organizations)
│   │   │   ├── services/       # AuthService, OrganizationService
│   │   │   ├── app.ts          # Express app factory
│   │   │   └── index.ts        # Server entry point
│   │   └── tests/              # Vitest test suites (health, db, auth, tenant isolation)
│   └── web/                    # Next.js 14 App Router Frontend (port 3000)
│       ├── e2e/                # Playwright E2E browser tests
│       ├── src/
│       │   ├── app/            # Landing (/), Dashboard (/dashboard), /login, /register
│       │   ├── components/     # Navbar, Sidebar, RoleBadge, CreateOrgModal
│       │   ├── context/        # AuthContext & Provider (session & org switcher state)
│       │   └── lib/            # Typed API client with credentials support
├── packages/
│   └── shared/                 # Shared TypeScript types & Zod schemas (@qveto/shared)
├── prisma/
│   ├── schema.prisma           # Full domain schema (16 models, indexes, relations)
│   ├── migrations/             # Checked-in PostgreSQL migrations (20261015000000_init)
│   └── seed.ts                 # Idempotent seed script (Nexora Corp & Rival Inc)
├── docs/
│   └── API_CONTRACT.md         # Complete REST API specification & interface guide
├── .env.example                # Environment variables template
├── pnpm-workspace.yaml         # Monorepo workspace configuration
└── README.md
```

---

## ⚡ Quick Start Guide

### 1. Prerequisites

- **Node.js:** v18.0.0 or higher (v22+ recommended)
- **pnpm:** v8.0.0 or higher (`npm install -g pnpm`)
- **PostgreSQL:** Local PostgreSQL or cloud PostgreSQL (e.g. Supabase, Neon)

### 2. Clone and Install

```bash
git clone https://github.com/Niss54/Qveto-Team-Nexora.git
cd Qveto-Team-Nexora
git checkout Niss
pnpm install
```

### 3. Environment Setup

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Fill in your `DATABASE_URL`:

```env
DATABASE_URL="postgresql://postgres:[PASSWORD]@[HOST]:[PORT]/[DATABASE]"
SESSION_SECRET="your-super-secret-random-key-at-least-32-chars-long"
```

### 4. Database Setup & Seeding

```bash
# Generate Prisma Client
pnpm db:generate

# Deploy migrations to database
pnpm db:migrate

# Seed demo organizations and users
pnpm db:seed
```

### 5. Start Development Servers

```bash
# Runs both API (http://localhost:4000) and Web (http://localhost:3000) in parallel
pnpm dev
```

Or run services individually:

```bash
pnpm dev:api   # API only (port 4000)
pnpm dev:web   # Web only (port 3000)
```

---

## 👥 Demo Accounts (Seeded)

The database seed provides two separate organizations to demonstrate **multi-tenant isolation** and **role-based access control**:

### 🏢 Organization A: Nexora Corp (`/nexora-corp`)

| Role         | Email                 | Password       | Permissions                                               |
| ------------ | --------------------- | -------------- | --------------------------------------------------------- |
| **OWNER**    | `owner@nexora.com`    | `Password123!` | Full administration, member invite/removal, org settings  |
| **MANAGER**  | `manager@nexora.com`  | `Password123!` | Workspace & project management, cannot alter org settings |
| **EMPLOYEE** | `employee@nexora.com` | `Password123!` | Task collaboration & assignments, member access           |

### 🏢 Organization B: Rival Inc (`/rival-inc`) — Isolation Target

| Role         | Email                | Password       | Permissions                                        |
| ------------ | -------------------- | -------------- | -------------------------------------------------- |
| **OWNER**    | `owner@rival.com`    | `Password123!` | Isolated from Nexora Corp resources                |
| **EMPLOYEE** | `employee@rival.com` | `Password123!` | Cannot view or access Nexora Corp tasks or members |

---

## 🧪 Testing & Quality Assurance

### Run Unit & Integration Tests (Vitest)

```bash
pnpm test
```

**Test Coverage (39/39 Passing):**

- **Health & Error Handling (`health.test.ts`):** 6 tests (status, uptime, consistent error shape, request ID tracing, CORS headers)
- **Database Schema (`db.test.ts`):** 2 tests (Prisma client instantiation, verification of all 16 domain models and CRUD methods)
- **Authentication (`auth.test.ts`):** 13 tests (registration, duplicate email 409, short password 400, valid login, invalid password 401, account enumeration defense, session cookie verification, session expiration, logout)
- **Tenant Isolation & RBAC (`tenant.test.ts`):** 18 tests (cross-tenant read denial 403, cross-tenant mutation denial 403, manager/employee restriction, sole owner protection 400, spoofed orgId rejection)

### Run Code Quality Checks

```bash
# TypeScript Typecheck (Whole Monorepo)
pnpm typecheck

# ESLint (Whole Monorepo)
pnpm lint

# Production Build (Whole Monorepo)
pnpm build
```

---

## 🔒 Security Architecture

1. **HttpOnly Cookies:** Session tokens are stored in `HttpOnly` cookies, preventing client-side JavaScript access and XSS theft.
2. **Server-Side Tenant Enforcement:** Resource access never trusts a client-supplied `orgId`. Express middleware queries the database to verify that the user is an active member of the target tenant before granting access.
3. **Password Security:** All passwords are salted and hashed with `bcryptjs` (cost factor: 10). Passwords and password hashes are filtered out of all API responses.
4. **Generic Error Responses:** Login endpoints return generic `401 INVALID_CREDENTIALS` for both wrong password and non-existent email, preventing account enumeration.
5. **Sole Owner Protection:** An organization's sole owner cannot demote their role or leave the organization without first assigning another owner.

---

## 📖 API Documentation

Complete REST API documentation, including request/response examples and error schemas, is available in [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md).
