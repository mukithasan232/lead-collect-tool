import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma, isDbConnected } from '../config/db';
import { ApiResponse } from '../utils/apiResponse';
import { AppError } from '../utils/appError';
import { inMemoryLeadStore } from './lead.controller';

const createUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  credits: z.number().int().min(0).optional().default(0),
});

const updateUserSchema = z.object({
  email: z.string().email().optional(),
  credits: z.number().int().min(0).optional(),
});

export class UserController {
  static async list(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!isDbConnected) {
        ApiResponse.success(res, {
          message: 'Users retrieved successfully (Local Store)',
          data: [
            {
              id: 'usr_default',
              email: 'client@company.com',
              credits: 500,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              _count: { leads: inMemoryLeadStore.length },
            },
          ],
        });
        return;
      }

      const users = await prisma.user.findMany({
        select: {
          id: true,
          email: true,
          credits: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { leads: true } },
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
      if (!isDbConnected) {
        ApiResponse.success(res, {
          message: 'User retrieved successfully (Local Store)',
          data: {
            id,
            email: 'client@company.com',
            credits: 500,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            _count: { leads: inMemoryLeadStore.length },
          },
        });
        return;
      }

      const user = await prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          email: true,
          credits: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { leads: true } },
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
      const { email, credits } = createUserSchema.parse(req.body);

      if (!isDbConnected) {
        ApiResponse.created(res, {
          message: 'User created successfully (Local Store)',
          data: {
            id: `usr_${Date.now()}`,
            email,
            credits,
            createdAt: new Date().toISOString(),
          },
        });
        return;
      }

      const user = await prisma.user.create({
        data: { email, credits },
        select: {
          id: true,
          email: true,
          credits: true,
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

      if (!isDbConnected) {
        ApiResponse.success(res, {
          message: 'User updated successfully (Local Store)',
          data: {
            id,
            email: data.email || 'client@company.com',
            credits: data.credits !== undefined ? data.credits : 500,
            updatedAt: new Date().toISOString(),
          },
        });
        return;
      }

      const user = await prisma.user.update({
        where: { id },
        data,
        select: {
          id: true,
          email: true,
          credits: true,
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
      if (isDbConnected) {
        await prisma.user.delete({ where: { id } });
      }
      ApiResponse.noContent(res);
    } catch (err) {
      next(err);
    }
  }
}
