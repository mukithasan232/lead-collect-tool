import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../config/db';
import { ApiResponse } from '../utils/apiResponse';
import { AppError } from '../utils/appError';

const createWorkspaceSchema = z.object({
  name: z.string().min(1, 'Workspace name is required').max(255),
});

const updateWorkspaceSchema = z.object({
  name: z.string().min(1).max(255).optional(),
});

export class WorkspaceController {
  static async list(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const workspaces = await prisma.workspace.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: { users: true, leadLists: true },
          },
        },
      });

      ApiResponse.success(res, {
        message: 'Workspaces retrieved successfully',
        data: workspaces,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const workspace = await prisma.workspace.findUnique({
        where: { id },
        include: {
          users: {
            select: { id: true, email: true, createdAt: true },
          },
          leadLists: true,
        },
      });

      if (!workspace) {
        throw AppError.notFound(`Workspace with ID ${id} not found`);
      }

      ApiResponse.success(res, {
        message: 'Workspace retrieved successfully',
        data: workspace,
      });
    } catch (err) {
      next(err);
    }
  }

  static async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { name } = createWorkspaceSchema.parse(req.body);
      const workspace = await prisma.workspace.create({
        data: { name },
      });

      ApiResponse.created(res, {
        message: 'Workspace created successfully',
        data: workspace,
      });
    } catch (err) {
      next(err);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const data = updateWorkspaceSchema.parse(req.body);

      const workspace = await prisma.workspace.update({
        where: { id },
        data,
      });

      ApiResponse.success(res, {
        message: 'Workspace updated successfully',
        data: workspace,
      });
    } catch (err) {
      next(err);
    }
  }

  static async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      await prisma.workspace.delete({ where: { id } });

      ApiResponse.noContent(res);
    } catch (err) {
      next(err);
    }
  }
}
