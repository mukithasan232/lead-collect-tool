import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../config/db';
import { ApiResponse } from '../utils/apiResponse';
import { AppError } from '../utils/appError';

import { objectIdSchema } from '../utils/validation';

const createLeadListSchema = z.object({
  name: z.string().min(1, 'Lead list name is required').max(255),
  workspaceId: objectIdSchema,
});

const updateLeadListSchema = z.object({
  name: z.string().min(1).max(255).optional(),
});

export class LeadListController {
  static async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { workspaceId } = req.query;

      const lists = await prisma.leadList.findMany({
        where: workspaceId ? { workspaceId: String(workspaceId) } : undefined,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: { leads: true },
          },
        },
      });

      ApiResponse.success(res, {
        message: 'Lead lists retrieved successfully',
        data: lists,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const list = await prisma.leadList.findUnique({
        where: { id },
        include: {
          workspace: { select: { id: true, name: true } },
          leads: {
            include: {
              emailRecords: true,
            },
            take: 50,
          },
          _count: {
            select: { leads: true },
          },
        },
      });

      if (!list) {
        throw AppError.notFound(`Lead list with ID ${id} not found`);
      }

      ApiResponse.success(res, {
        message: 'Lead list retrieved successfully',
        data: list,
      });
    } catch (err) {
      next(err);
    }
  }

  static async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { name, workspaceId } = createLeadListSchema.parse(req.body);
      const list = await prisma.leadList.create({
        data: { name, workspaceId },
      });

      ApiResponse.created(res, {
        message: 'Lead list created successfully',
        data: list,
      });
    } catch (err) {
      next(err);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const data = updateLeadListSchema.parse(req.body);

      const list = await prisma.leadList.update({
        where: { id },
        data,
      });

      ApiResponse.success(res, {
        message: 'Lead list updated successfully',
        data: list,
      });
    } catch (err) {
      next(err);
    }
  }

  static async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      await prisma.leadList.delete({ where: { id } });

      ApiResponse.noContent(res);
    } catch (err) {
      next(err);
    }
  }
}
