import { z } from 'zod';

// ============================================================
// Enums
// ============================================================

/** Organization member roles */
export const OrgRole = z.enum(['OWNER', 'MANAGER', 'EMPLOYEE']);
export type OrgRole = z.infer<typeof OrgRole>;

/** Task statuses */
export const TaskStatus = z.enum(['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE']);
export type TaskStatus = z.infer<typeof TaskStatus>;

/** Task priorities */
export const TaskPriority = z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);
export type TaskPriority = z.infer<typeof TaskPriority>;

/** Canonical task activity event types */
export const TaskActivityType = z.enum([
  'TASK_CREATED',
  'TASK_UPDATED',
  'TASK_STATUS_CHANGED',
  'TASK_ASSIGNED',
  'TASK_DUE_DATE_CHANGED',
  'TASK_ARCHIVED',
]);
export type TaskActivityType = z.infer<typeof TaskActivityType>;

// ============================================================
// Auth Schemas
// ============================================================

export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});
export type LoginInput = z.infer<typeof loginSchema>;

// ============================================================
// Organization Schemas
// ============================================================

export const createOrgSchema = z.object({
  name: z.string().min(2, 'Organization name must be at least 2 characters').max(100),
  slug: z
    .string()
    .min(2, 'Slug must be at least 2 characters')
    .max(50)
    .regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase alphanumeric characters and hyphens')
    .optional(),
  description: z.string().max(500).optional(),
});
export type CreateOrgInput = z.infer<typeof createOrgSchema>;

export const updateOrgSchema = z.object({
  name: z.string().min(2, 'Organization name must be at least 2 characters').max(100).optional(),
  description: z.string().max(500).nullable().optional(),
});
export type UpdateOrgInput = z.infer<typeof updateOrgSchema>;

export const addMemberSchema = z.object({
  email: z.string().email('Invalid email address'),
  role: OrgRole.default('EMPLOYEE'),
});
export type AddMemberInput = z.infer<typeof addMemberSchema>;

export const updateMemberRoleSchema = z.object({
  role: OrgRole,
});
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;

// ============================================================
// Task Schemas (PRD 03 Shared Contract)
// ============================================================

export const createTaskSchema = z
  .object({
    title: z.string().min(1, 'Task title is required').max(255, 'Title too long'),
    description: z.string().max(5000, 'Description too long').nullable().optional(),
    status: TaskStatus.default('TODO'),
    priority: TaskPriority.default('MEDIUM'),
    startDate: z.coerce.date().nullable().optional(),
    dueDate: z.coerce.date().nullable().optional(),
    assigneeId: z.string().nullable().optional(),
    parentTaskId: z.string().nullable().optional(),
  })
  .refine(
    (data) => {
      if (data.startDate && data.dueDate) {
        return data.startDate <= data.dueDate;
      }
      return true;
    },
    {
      message: 'startDate must be before or equal to dueDate',
      path: ['dueDate'],
    }
  );
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const updateTaskSchema = z
  .object({
    title: z.string().min(1, 'Task title is required').max(255, 'Title too long').optional(),
    description: z.string().max(5000, 'Description too long').nullable().optional(),
    status: TaskStatus.optional(),
    priority: TaskPriority.optional(),
    startDate: z.coerce.date().nullable().optional(),
    dueDate: z.coerce.date().nullable().optional(),
    assigneeId: z.string().nullable().optional(),
    position: z.number().int().nonnegative().optional(),
    parentTaskId: z.string().nullable().optional(),
  })
  .refine(
    (data) => {
      if (data.startDate && data.dueDate) {
        return data.startDate <= data.dueDate;
      }
      return true;
    },
    {
      message: 'startDate must be before or equal to dueDate',
      path: ['dueDate'],
    }
  );
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

// ============================================================
// Response Schemas
// ============================================================

export const userResponseSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  avatarUrl: z.string().nullable().optional(),
  createdAt: z.string(),
});
export type UserResponse = z.infer<typeof userResponseSchema>;

export const orgMemberResponseSchema = z.object({
  id: z.string(),
  userId: z.string(),
  orgId: z.string(),
  role: OrgRole,
  joinedAt: z.string(),
  user: userResponseSchema,
});
export type OrgMemberResponse = z.infer<typeof orgMemberResponseSchema>;

export const organizationResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  role: OrgRole.optional(),
  memberCount: z.number().optional(),
});
export type OrganizationResponse = z.infer<typeof organizationResponseSchema>;

// ============================================================
// Workspace Schemas (PRD 02)
// ============================================================

export const createWorkspaceSchema = z.object({
  name: z.string().trim().min(1, 'Workspace name is required').max(100, 'Workspace name too long'),
  description: z.string().trim().max(500, 'Description too long').nullable().optional(),
}).strict();
export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;

export const updateWorkspaceSchema = z.object({
  name: z.string().trim().min(1, 'Workspace name is required').max(100, 'Workspace name too long').optional(),
  description: z.string().trim().max(500, 'Description too long').nullable().optional(),
}).strict().refine((data) => Object.keys(data).length > 0, {
  message: 'At least one workspace field must be provided',
});
export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceSchema>;

export const workspaceListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  includeArchived: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
});
export type WorkspaceListQuery = z.infer<typeof workspaceListQuerySchema>;

export const workspaceResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  orgId: z.string(),
  archivedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type WorkspaceResponse = z.infer<typeof workspaceResponseSchema>;

export const createTeamSchema = z.object({
  name: z.string().trim().min(1, 'Team name is required').max(100, 'Team name too long'),
  description: z.string().trim().max(500, 'Description too long').nullable().optional(),
}).strict();
export type CreateTeamInput = z.infer<typeof createTeamSchema>;

export const updateTeamSchema = createTeamSchema.partial().refine((data) => Object.keys(data).length > 0, {
  message: 'At least one team field must be provided',
});
export type UpdateTeamInput = z.infer<typeof updateTeamSchema>;

export const addTeamMemberSchema = z.object({ userId: z.string().min(1) }).strict();
export type AddTeamMemberInput = z.infer<typeof addTeamMemberSchema>;

export const teamResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  workspaceId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  members: z.array(z.object({
    id: z.string(),
    userId: z.string(),
    role: z.string(),
    joinedAt: z.string(),
    user: z.object({ id: z.string(), name: z.string(), email: z.string() }),
  })).optional(),
});
export type TeamResponse = z.infer<typeof teamResponseSchema>;

// ============================================================
// Project Schemas (PRD 02)
// ============================================================

/** Supported Project lifecycle values. */
export const ProjectStatus = z.enum(['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED']);
export type ProjectStatus = z.infer<typeof ProjectStatus>;

const projectDateRange = <T extends z.ZodTypeAny>(schema: T) => schema.refine(
  (data: { startDate?: Date | null; dueDate?: Date | null }) =>
    !data.startDate || !data.dueDate || data.startDate <= data.dueDate,
  { message: 'startDate must be before or equal to dueDate', path: ['dueDate'] },
);

export const createProjectSchema = projectDateRange(z.object({
  name: z.string().trim().min(1, 'Project name is required').max(100, 'Project name too long'),
  description: z.string().trim().max(500, 'Description too long').nullable().optional(),
  ownerId: z.string().min(1, 'Project owner is required'),
  status: ProjectStatus.default('ACTIVE'),
  startDate: z.coerce.date().nullable().optional(),
  dueDate: z.coerce.date().nullable().optional(),
}).strict());
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = projectDateRange(z.object({
  name: z.string().trim().min(1, 'Project name is required').max(100, 'Project name too long').optional(),
  description: z.string().trim().max(500, 'Description too long').nullable().optional(),
  ownerId: z.string().min(1, 'Project owner is required').optional(),
  status: ProjectStatus.optional(),
  startDate: z.coerce.date().nullable().optional(),
  dueDate: z.coerce.date().nullable().optional(),
}).strict()).refine((data) => Object.keys(data).length > 0, {
  message: 'At least one project field must be provided',
});
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

export const projectListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  includeArchived: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
}).strict();
export type ProjectListQuery = z.infer<typeof projectListQuerySchema>;

export const addProjectMemberSchema = z.object({ userId: z.string().min(1) }).strict();
export type AddProjectMemberInput = z.infer<typeof addProjectMemberSchema>;

export const projectResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  status: z.string(),
  startDate: z.string().nullable(),
  dueDate: z.string().nullable(),
  ownerId: z.string().nullable(),
  workspaceId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ProjectResponse = z.infer<typeof projectResponseSchema>;

export const projectMemberResponseSchema = z.object({
  id: z.string(),
  userId: z.string(),
  projectId: z.string(),
  role: z.string(),
  joinedAt: z.string(),
  user: z.object({ id: z.string(), name: z.string(), email: z.string() }),
});
export type ProjectMemberResponse = z.infer<typeof projectMemberResponseSchema>;

export const taskResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable().optional(),
  status: TaskStatus,
  priority: TaskPriority,
  startDate: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
  archivedAt: z.string().nullable().optional(),
  position: z.number(),
  projectId: z.string(),
  assigneeId: z.string().nullable().optional(),
  creatorId: z.string(),
  parentTaskId: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type TaskResponse = z.infer<typeof taskResponseSchema>;

/** Standard error response shape */
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
    requestId: z.string().optional(),
  }),
});
export type ApiErrorResponse = z.infer<typeof apiErrorSchema>;

/** Standard paginated response shape */
export const paginationMetaSchema = z.object({
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
  totalPages: z.number(),
});
export type PaginationMeta = z.infer<typeof paginationMetaSchema>;

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}
