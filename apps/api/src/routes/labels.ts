import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { labelService } from '../services/label.service.js';

export const projectLabelsRouter: ReturnType<typeof Router> = Router({ mergeParams: true });
export const taskLabelsRouter: ReturnType<typeof Router> = Router({ mergeParams: true });

const createLabelSchema = z.object({
  name: z.string().trim().min(1).max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#6366f1'),
}).strict();
const assignLabelSchema = z.object({ labelId: z.string().min(1) }).strict();

function param(req: Request, name: string): string {
  const value = req.params[name];
  return Array.isArray(value) ? value[0] : value;
}

projectLabelsRouter.use(requireAuth);
taskLabelsRouter.use(requireAuth);

// GET /api/projects/:projectId/labels
projectLabelsRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as AuthenticatedRequest).user.id;
    res.json(await labelService.listProjectLabels(param(req, 'projectId'), userId));
  } catch (error) { next(error); }
});

// POST /api/projects/:projectId/labels
projectLabelsRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as AuthenticatedRequest).user.id;
    const input = createLabelSchema.parse(req.body);
    const label = await labelService.createProjectLabel(param(req, 'projectId'), userId, input.name, input.color);
    res.status(201).json({ label });
  } catch (error) { next(error); }
});

// GET /api/tasks/:taskId/labels
taskLabelsRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as AuthenticatedRequest).user.id;
    res.json(await labelService.listTaskLabels(param(req, 'taskId'), userId));
  } catch (error) { next(error); }
});

// POST /api/tasks/:taskId/labels
taskLabelsRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as AuthenticatedRequest).user.id;
    const { labelId } = assignLabelSchema.parse(req.body);
    const label = await labelService.addTaskLabel(param(req, 'taskId'), userId, labelId);
    res.status(201).json({ label });
  } catch (error) { next(error); }
});

// DELETE /api/tasks/:taskId/labels/:labelId
taskLabelsRouter.delete('/:labelId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as AuthenticatedRequest).user.id;
    res.json(await labelService.removeTaskLabel(param(req, 'taskId'), userId, param(req, 'labelId')));
  } catch (error) { next(error); }
});
