import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { kanbanService } from '../services/kanban.service.js';

export const kanbanRouter: ReturnType<typeof Router> = Router({ mergeParams: true });
kanbanRouter.use(requireAuth);

const moveSchema = z.object({
  taskId: z.string().min(1),
  status: z.enum(['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE']),
  targetIndex: z.number().int().nonnegative(),
}).strict();

function getProjectId(req: Request): string {
  const value = req.params.projectId;
  return Array.isArray(value) ? value[0] : value;
}

// GET /api/projects/:projectId/kanban
kanbanRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as AuthenticatedRequest).user.id;
    res.status(200).json(await kanbanService.getBoard(getProjectId(req), userId));
  } catch (error) { next(error); }
});

// PATCH /api/projects/:projectId/kanban/move
kanbanRouter.patch('/move', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as AuthenticatedRequest).user.id;
    const input = moveSchema.parse(req.body);
    res.status(200).json(await kanbanService.moveTask(getProjectId(req), userId, input));
  } catch (error) { next(error); }
});
