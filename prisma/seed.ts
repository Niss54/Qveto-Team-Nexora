import { PrismaClient, OrgRole, TaskStatus, TaskPriority } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting Qveto platform database seed...');

  const commonPassword = 'Password123!';
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(commonPassword, salt);

  // ============================================================
  // 1. Seed Users
  // ============================================================
  console.log('👤 Seeding demo users...');

  // Org A Users
  const nexoraOwner = await prisma.user.upsert({
    where: { email: 'owner@nexora.com' },
    update: { passwordHash, name: 'Nishant Maurya (Owner)' },
    create: {
      email: 'owner@nexora.com',
      name: 'Nishant Maurya (Owner)',
      passwordHash,
      timezone: 'Asia/Kolkata',
    },
  });

  const nexoraManager = await prisma.user.upsert({
    where: { email: 'manager@nexora.com' },
    update: { passwordHash, name: 'Alex Rivera (Manager)' },
    create: {
      email: 'manager@nexora.com',
      name: 'Alex Rivera (Manager)',
      passwordHash,
      timezone: 'America/New_York',
    },
  });

  const nexoraEmployee = await prisma.user.upsert({
    where: { email: 'employee@nexora.com' },
    update: { passwordHash, name: 'Sam Taylor (Employee)' },
    create: {
      email: 'employee@nexora.com',
      name: 'Sam Taylor (Employee)',
      passwordHash,
      timezone: 'Europe/London',
    },
  });

  // Org B Users (Rival Inc)
  const rivalOwner = await prisma.user.upsert({
    where: { email: 'owner@rival.com' },
    update: { passwordHash, name: 'Victor Vance (Owner)' },
    create: {
      email: 'owner@rival.com',
      name: 'Victor Vance (Owner)',
      passwordHash,
      timezone: 'America/Los_Angeles',
    },
  });

  const rivalEmployee = await prisma.user.upsert({
    where: { email: 'employee@rival.com' },
    update: { passwordHash, name: 'Elena Rostova (Employee)' },
    create: {
      email: 'employee@rival.com',
      name: 'Elena Rostova (Employee)',
      passwordHash,
      timezone: 'Asia/Tokyo',
    },
  });

  // ============================================================
  // 2. Seed Organization A: Nexora Corp
  // ============================================================
  console.log('🏢 Seeding Organization A: Nexora Corp...');

  const nexoraOrg = await prisma.organization.upsert({
    where: { slug: 'nexora-corp' },
    update: { name: 'Nexora Corp', description: 'Primary Project Management SaaS Tenant' },
    create: {
      name: 'Nexora Corp',
      slug: 'nexora-corp',
      description: 'Primary Project Management SaaS Tenant',
    },
  });

  // Assign memberships for Org A
  await prisma.organizationMember.upsert({
    where: { userId_orgId: { userId: nexoraOwner.id, orgId: nexoraOrg.id } },
    update: { role: OrgRole.OWNER },
    create: { userId: nexoraOwner.id, orgId: nexoraOrg.id, role: OrgRole.OWNER },
  });

  await prisma.organizationMember.upsert({
    where: { userId_orgId: { userId: nexoraManager.id, orgId: nexoraOrg.id } },
    update: { role: OrgRole.MANAGER },
    create: { userId: nexoraManager.id, orgId: nexoraOrg.id, role: OrgRole.MANAGER },
  });

  await prisma.organizationMember.upsert({
    where: { userId_orgId: { userId: nexoraEmployee.id, orgId: nexoraOrg.id } },
    update: { role: OrgRole.EMPLOYEE },
    create: { userId: nexoraEmployee.id, orgId: nexoraOrg.id, role: OrgRole.EMPLOYEE },
  });

  // Labels for Org A
  const labelSecurity = await prisma.label.upsert({
    where: { orgId_name: { orgId: nexoraOrg.id, name: 'Security' } },
    update: { color: '#ef4444' },
    create: { orgId: nexoraOrg.id, name: 'Security', color: '#ef4444' },
  });

  const labelFrontend = await prisma.label.upsert({
    where: { orgId_name: { orgId: nexoraOrg.id, name: 'Frontend' } },
    update: { color: '#3b82f6' },
    create: { orgId: nexoraOrg.id, name: 'Frontend', color: '#3b82f6' },
  });

  const labelAPI = await prisma.label.upsert({
    where: { orgId_name: { orgId: nexoraOrg.id, name: 'Backend-API' } },
    update: { color: '#10b981' },
    create: { orgId: nexoraOrg.id, name: 'Backend-API', color: '#10b981' },
  });

  // Workspaces for Org A
  let wsEngineering = await prisma.workspace.findFirst({
    where: { orgId: nexoraOrg.id, name: 'Engineering' },
  });
  if (!wsEngineering) {
    wsEngineering = await prisma.workspace.create({
      data: {
        name: 'Engineering',
        description: 'Core software engineering and infrastructure',
        orgId: nexoraOrg.id,
      },
    });
  }

  let wsProduct = await prisma.workspace.findFirst({
    where: { orgId: nexoraOrg.id, name: 'Product & Design' },
  });
  if (!wsProduct) {
    wsProduct = await prisma.workspace.create({
      data: {
        name: 'Product & Design',
        description: 'Roadmaps, design systems, and user research',
        orgId: nexoraOrg.id,
      },
    });
  }

  // Teams for Org A
  let teamBackend = await prisma.team.findFirst({
    where: { workspaceId: wsEngineering.id, name: 'Backend Core' },
  });
  if (!teamBackend) {
    teamBackend = await prisma.team.create({
      data: {
        name: 'Backend Core',
        description: 'REST API, database, and auth team',
        workspaceId: wsEngineering.id,
      },
    });
    await prisma.teamMember.createMany({
      data: [
        { teamId: teamBackend.id, userId: nexoraOwner.id, role: 'LEAD' },
        { teamId: teamBackend.id, userId: nexoraEmployee.id, role: 'ENGINEER' },
      ],
      skipDuplicates: true,
    });
  }

  let teamFrontend = await prisma.team.findFirst({
    where: { workspaceId: wsEngineering.id, name: 'Frontend Platform' },
  });
  if (!teamFrontend) {
    teamFrontend = await prisma.team.create({
      data: {
        name: 'Frontend Platform',
        description: 'Next.js App Router and Tailwind UI team',
        workspaceId: wsEngineering.id,
      },
    });
    await prisma.teamMember.createMany({
      data: [
        { teamId: teamFrontend.id, userId: nexoraManager.id, role: 'LEAD' },
        { teamId: teamFrontend.id, userId: nexoraEmployee.id, role: 'ENGINEER' },
      ],
      skipDuplicates: true,
    });
  }

  // Projects for Org A
  let projSaaS = await prisma.project.findFirst({
    where: { workspaceId: wsEngineering.id, name: 'Qveto SaaS MVP' },
  });
  if (!projSaaS) {
    projSaaS = await prisma.project.create({
      data: {
        name: 'Qveto SaaS MVP',
        description: 'Full-stack multi-tenant project management application',
        status: 'ACTIVE',
        workspaceId: wsEngineering.id,
      },
    });
    await prisma.projectMember.createMany({
      data: [
        { projectId: projSaaS.id, userId: nexoraOwner.id, role: 'OWNER' },
        { projectId: projSaaS.id, userId: nexoraManager.id, role: 'MANAGER' },
        { projectId: projSaaS.id, userId: nexoraEmployee.id, role: 'MEMBER' },
      ],
      skipDuplicates: true,
    });
  }

  let projAuth = await prisma.project.findFirst({
    where: { workspaceId: wsEngineering.id, name: 'Auth & Security Overhaul' },
  });
  if (!projAuth) {
    projAuth = await prisma.project.create({
      data: {
        name: 'Auth & Security Overhaul',
        description: 'Password hashing, HttpOnly session cookies, and RBAC verification',
        status: 'ACTIVE',
        workspaceId: wsEngineering.id,
      },
    });
  }

  // Tasks for Org A (Qveto SaaS MVP)
  const existingTasks = await prisma.task.count({ where: { projectId: projSaaS.id } });
  if (existingTasks === 0) {
    console.log('📋 Seeding tasks for Nexora Corp...');

    const task1 = await prisma.task.create({
      data: {
        title: 'Implement Express API with Zod validation',
        description: 'Establish standard error format, request IDs, and route contracts.',
        status: TaskStatus.DONE,
        priority: TaskPriority.HIGH,
        dueDate: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2), // 2 days ago (completed on time)
        projectId: projSaaS.id,
        creatorId: nexoraOwner.id,
        assigneeId: nexoraOwner.id,
        position: 1,
      },
    });

    const task2 = await prisma.task.create({
      data: {
        title: 'Configure PostgreSQL Prisma Schema & Migrations',
        description: 'Design all 16 models with multi-tenant organization hierarchy.',
        status: TaskStatus.DONE,
        priority: TaskPriority.URGENT,
        dueDate: new Date(Date.now() - 1000 * 60 * 60 * 24 * 1),
        projectId: projSaaS.id,
        creatorId: nexoraOwner.id,
        assigneeId: nexoraManager.id,
        position: 2,
      },
    });

    const task3 = await prisma.task.create({
      data: {
        title: 'Build Session Authentication & HttpOnly Cookies',
        description: 'Replace token storage with server-side sessions and bcrypt password hashing.',
        status: TaskStatus.DONE,
        priority: TaskPriority.URGENT,
        dueDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 1),
        projectId: projSaaS.id,
        creatorId: nexoraManager.id,
        assigneeId: nexoraEmployee.id,
        position: 3,
      },
    });

    const task4 = await prisma.task.create({
      data: {
        title: 'Implement Tenant Scoping Middleware & Cross-Org Isolation',
        description: 'Block spoofed orgIds and prevent users in Org A from reading Org B resources.',
        status: TaskStatus.DONE,
        priority: TaskPriority.HIGH,
        dueDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 2),
        projectId: projSaaS.id,
        creatorId: nexoraOwner.id,
        assigneeId: nexoraOwner.id,
        position: 4,
      },
    });

    const task5 = await prisma.task.create({
      data: {
        title: 'Design Next.js App Router Shell with Organization Switcher',
        description: 'Build responsive header, sidebar, login/register screens, and role badges.',
        status: TaskStatus.IN_PROGRESS,
        priority: TaskPriority.HIGH,
        dueDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 3),
        projectId: projSaaS.id,
        creatorId: nexoraManager.id,
        assigneeId: nexoraEmployee.id,
        position: 5,
      },
    });

    const task6 = await prisma.task.create({
      data: {
        title: 'Build Interactive Kanban Board Workflow',
        description: 'Drag-and-drop task status transitions with optimistic UI updates.',
        status: TaskStatus.TODO,
        priority: TaskPriority.MEDIUM,
        dueDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 5),
        projectId: projSaaS.id,
        creatorId: nexoraManager.id,
        assigneeId: nexoraEmployee.id,
        position: 6,
      },
    });

    const task7 = await prisma.task.create({
      data: {
        title: 'In-App Notifications & Overdue Task Alerts',
        description: 'Trigger notifications when assigned, commented on, or when tasks approach due date.',
        status: TaskStatus.TODO,
        priority: TaskPriority.MEDIUM,
        dueDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
        projectId: projSaaS.id,
        creatorId: nexoraManager.id,
        position: 7,
      },
    });

    const task8 = await prisma.task.create({
      data: {
        title: 'Productivity & Workload Reporting Dashboard',
        description: 'Calculate project progress %, completion rates, and status distribution.',
        status: TaskStatus.TODO,
        priority: TaskPriority.LOW,
        dueDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 10),
        projectId: projSaaS.id,
        creatorId: nexoraOwner.id,
        position: 8,
      },
    });

    const task9Overdue = await prisma.task.create({
      data: {
        title: 'Review legacy API endpoints for deprecation',
        description: 'Identify any unauthenticated endpoints and migrate to tenant-scoped middleware.',
        status: TaskStatus.IN_REVIEW,
        priority: TaskPriority.HIGH,
        dueDate: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3), // Overdue task!
        projectId: projSaaS.id,
        creatorId: nexoraOwner.id,
        assigneeId: nexoraManager.id,
        position: 9,
      },
    });

    const task10 = await prisma.task.create({
      data: {
        title: 'Playwright Browser End-to-End Suite',
        description: 'Automate browser testing for sign-in, tenant switching, and member invites.',
        status: TaskStatus.TODO,
        priority: TaskPriority.MEDIUM,
        dueDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 6),
        projectId: projSaaS.id,
        creatorId: nexoraOwner.id,
        assigneeId: nexoraEmployee.id,
        position: 10,
      },
    });

    // Subtask example
    await prisma.task.create({
      data: {
        title: 'Write Playwright test for login redirect',
        status: TaskStatus.TODO,
        priority: TaskPriority.LOW,
        projectId: projSaaS.id,
        creatorId: nexoraEmployee.id,
        parentTaskId: task10.id,
        position: 1,
      },
    });

    // Attach Labels to tasks
    await prisma.taskLabel.createMany({
      data: [
        { taskId: task1.id, labelId: labelAPI.id },
        { taskId: task2.id, labelId: labelSecurity.id },
        { taskId: task3.id, labelId: labelSecurity.id },
        { taskId: task4.id, labelId: labelSecurity.id },
        { taskId: task5.id, labelId: labelFrontend.id },
        { taskId: task6.id, labelId: labelFrontend.id },
      ],
      skipDuplicates: true,
    });

    // Comments
    await prisma.comment.createMany({
      data: [
        {
          taskId: task3.id,
          authorId: nexoraOwner.id,
          content: 'Ensure sessions expire after 7 days and cookies have SameSite=Lax set.',
        },
        {
          taskId: task3.id,
          authorId: nexoraEmployee.id,
          content: 'Implemented and verified with 13 Supertest integration tests.',
        },
        {
          taskId: task9Overdue.id,
          authorId: nexoraManager.id,
          content: 'Reviewing code diffs now. Will conclude by EOD.',
        },
      ],
      skipDuplicates: true,
    });

    // Notification
    await prisma.notification.create({
      data: {
        userId: nexoraEmployee.id,
        orgId: nexoraOrg.id,
        type: 'TASK_ASSIGNED',
        title: 'New Task Assigned',
        message: 'You have been assigned to: Build Session Authentication & HttpOnly Cookies',
        isRead: true,
      },
    });

    // Activity Event
    await prisma.activityEvent.create({
      data: {
        orgId: nexoraOrg.id,
        actorId: nexoraOwner.id,
        type: 'ORGANIZATION_CREATED',
        entityType: 'ORGANIZATION',
        entityId: nexoraOrg.id,
        metadata: { name: nexoraOrg.name, slug: nexoraOrg.slug },
      },
    });
  }

  // ============================================================
  // 3. Seed Organization B: Rival Inc (Isolation Target)
  // ============================================================
  console.log('🏢 Seeding Organization B: Rival Inc (for Cross-Tenant Isolation Testing)...');

  const rivalOrg = await prisma.organization.upsert({
    where: { slug: 'rival-inc' },
    update: { name: 'Rival Inc', description: 'Secondary Organization for Multi-Tenant Testing' },
    create: {
      name: 'Rival Inc',
      slug: 'rival-inc',
      description: 'Secondary Organization for Multi-Tenant Testing',
    },
  });

  // Assign memberships for Org B
  await prisma.organizationMember.upsert({
    where: { userId_orgId: { userId: rivalOwner.id, orgId: rivalOrg.id } },
    update: { role: OrgRole.OWNER },
    create: { userId: rivalOwner.id, orgId: rivalOrg.id, role: OrgRole.OWNER },
  });

  await prisma.organizationMember.upsert({
    where: { userId_orgId: { userId: rivalEmployee.id, orgId: rivalOrg.id } },
    update: { role: OrgRole.EMPLOYEE },
    create: { userId: rivalEmployee.id, orgId: rivalOrg.id, role: OrgRole.EMPLOYEE },
  });

  // Workspace & Project for Org B
  let wsRival = await prisma.workspace.findFirst({
    where: { orgId: rivalOrg.id, name: 'Operations' },
  });
  if (!wsRival) {
    wsRival = await prisma.workspace.create({
      data: {
        name: 'Operations',
        description: 'Business operations and market research',
        orgId: rivalOrg.id,
      },
    });
  }

  let projRival = await prisma.project.findFirst({
    where: { workspaceId: wsRival.id, name: 'Market Intelligence' },
  });
  if (!projRival) {
    projRival = await prisma.project.create({
      data: {
        name: 'Market Intelligence',
        description: 'Competitive analysis and product benchmarking',
        status: 'ACTIVE',
        workspaceId: wsRival.id,
      },
    });

    await prisma.projectMember.createMany({
      data: [
        { projectId: projRival.id, userId: rivalOwner.id, role: 'OWNER' },
        { projectId: projRival.id, userId: rivalEmployee.id, role: 'MEMBER' },
      ],
      skipDuplicates: true,
    });

    // Tasks for Rival Inc
    await prisma.task.createMany({
      data: [
        {
          title: 'Benchmark competing SaaS pricing models',
          description: 'Gather pricing tiers from top 5 project management platforms.',
          status: TaskStatus.IN_PROGRESS,
          priority: TaskPriority.MEDIUM,
          projectId: projRival.id,
          creatorId: rivalOwner.id,
          assigneeId: rivalEmployee.id,
          position: 1,
        },
        {
          title: 'Audit competitor API rate limits',
          status: TaskStatus.DONE,
          priority: TaskPriority.LOW,
          projectId: projRival.id,
          creatorId: rivalOwner.id,
          assigneeId: rivalOwner.id,
          position: 2,
        },
        {
          title: 'Draft Q4 quarterly expansion plan',
          status: TaskStatus.TODO,
          priority: TaskPriority.HIGH,
          projectId: projRival.id,
          creatorId: rivalOwner.id,
          position: 3,
        },
      ],
      skipDuplicates: true,
    });
  }

  // Print Summary Table
  console.log('\n=============================================================');
  console.log('✅ DATABASE SEED COMPLETED SUCCESSFULLY');
  console.log('=============================================================');
  console.log('🏢 ORGANIZATION A: Nexora Corp (slug: nexora-corp)');
  console.log('   👑 Owner:    owner@nexora.com    / Password123!');
  console.log('   💼 Manager:  manager@nexora.com  / Password123!');
  console.log('   👤 Employee: employee@nexora.com / Password123!');
  console.log('-------------------------------------------------------------');
  console.log('🏢 ORGANIZATION B: Rival Inc (slug: rival-inc)');
  console.log('   👑 Owner:    owner@rival.com     / Password123!');
  console.log('   👤 Employee: employee@rival.com  / Password123!');
  console.log('=============================================================\n');
}

main()
  .catch((e) => {
    console.error('❌ Database seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
