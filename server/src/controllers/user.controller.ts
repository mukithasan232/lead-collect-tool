import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../config/db';
import { ApiResponse } from '../utils/apiResponse';
import { AppError } from '../utils/appError';

import { objectIdSchema } from '../utils/validation';

const createUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  workspaceId: objectIdSchema,
});

const updateUserSchema = z.object({
  email: z.string().email().optional(),
  password: z.string().min(6).optional(),
});

export class UserController {
  static async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { workspaceId } = req.query;

      const users = await prisma.user.findMany({
        where: workspaceId ? { workspaceId: String(workspaceId) } : undefined,
        select: {
          id: true,
          email: true,
          workspaceId: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      ApiResponse.success(res, {
        message: 'Users retrieved successfully',
        data: users,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const user = await prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          email: true,
          workspaceId: true,
          createdAt: true,
          updatedAt: true,
          workspace: {
            select: { id: true, name: true },
          },
        },
      });

      if (!user) {
        throw AppError.notFound(`User with ID ${id} not found`);
      }

      ApiResponse.success(res, {
        message: 'User retrieved successfully',
        data: user,
      });
    } catch (err) {
      next(err);
    }
  }

  static async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, password, workspaceId } = createUserSchema.parse(req.body);

      // Simple hash placeholder - in real auth, use bcrypt or argon2
      const passwordHash = Buffer.from(password).toString('base64');

      const user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          workspaceId,
        },
        select: {
          id: true,
          email: true,
          workspaceId: true,
          createdAt: true,
        },
      });

      ApiResponse.created(res, {
        message: 'User created successfully',
        data: user,
      });
    } catch (err) {
      next(err);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const data = updateUserSchema.parse(req.body);

      const updateData: { email?: string; passwordHash?: string } = {};
      if (data.email) updateData.email = data.email;
      if (data.password) updateData.passwordHash = Buffer.from(data.password).toString('base64');

      const user = await prisma.user.update({
        where: { id },
        data: updateData,
        select: {
          id: true,
          email: true,
          workspaceId: true,
          updatedAt: true,
        },
      });

      ApiResponse.success(res, {
        message: 'User updated successfully',
        data: user,
      });
    } catch (err) {
      next(err);
    }
  }

  static async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      await prisma.user.delete({ where: { id } });

      ApiResponse.noContent(res);
    } catch (err) {
      next(err);
    }
  }
}
