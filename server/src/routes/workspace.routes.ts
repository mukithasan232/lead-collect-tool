import { Router } from 'express';
import { WorkspaceController } from '../controllers/workspace.controller';

export const workspaceRouter = Router();

workspaceRouter.get('/', WorkspaceController.list);
workspaceRouter.get('/:id', WorkspaceController.getById);
workspaceRouter.post('/', WorkspaceController.create);
workspaceRouter.patch('/:id', WorkspaceController.update);
workspaceRouter.delete('/:id', WorkspaceController.delete);
