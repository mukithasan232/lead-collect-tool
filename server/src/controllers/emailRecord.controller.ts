import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../config/db';
import { ApiResponse } from '../utils/apiResponse';
import { AppError } from '../utils/appError';
import { EmailStatus } from '../types';
import { objectIdSchema } from '../utils/validation';
import { verifyEmail } from '../services/email-verifier';

const createEmailRecordSchema = z.object({
  leadId: objectIdSchema,
  emailAddress: z.string().email('Invalid email address'),
  status: z.nativeEnum(EmailStatus).optional().default(EmailStatus.UNVERIFIED),
  smtpScore: z.number().min(0).max(100).optional().default(0.0),
});

const updateEmailRecordSchema = z.object({
  emailAddress: z.string().email().optional(),
  status: z.nativeEnum(EmailStatus).optional(),
  smtpScore: z.number().min(0).max(100).optional(),
});

export class EmailRecordController {
  static async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { leadId, status } = req.query;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const where: any = {};
      if (leadId) where.leadId = String(leadId);
      if (status && Object.values(EmailStatus).includes(status as EmailStatus)) {
        where.status = status as EmailStatus;
      }

      const records = await prisma.emailRecord.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      });

      ApiResponse.success(res, {
        message: 'Email records retrieved successfully',
        data: records,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const record = await prisma.emailRecord.findUnique({
        where: { id },
        include: {
          lead: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              company: true,
              domain: true,
            },
          },
        },
      });

      if (!record) {
        throw AppError.notFound(`Email record with ID ${id} not found`);
      }

      ApiResponse.success(res, {
        message: 'Email record retrieved successfully',
        data: record,
      });
    } catch (err) {
      next(err);
    }
  }

  static async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = createEmailRecordSchema.parse(req.body);
      const record = await prisma.emailRecord.create({
        data,
      });

      ApiResponse.created(res, {
        message: 'Email record created successfully',
        data: record,
      });
    } catch (err) {
      next(err);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const data = updateEmailRecordSchema.parse(req.body);

      const record = await prisma.emailRecord.update({
        where: { id },
        data,
      });

      ApiResponse.success(res, {
        message: 'Email record updated successfully',
        data: record,
      });
    } catch (err) {
      next(err);
    }
  }

  static async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      await prisma.emailRecord.delete({ where: { id } });

      ApiResponse.noContent(res);
    } catch (err) {
      next(err);
    }
  }

  static async verify(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, timeoutMs } = req.body;
      if (!email || typeof email !== 'string') {
        throw AppError.badRequest('Email address is required');
      }

      const result = await verifyEmail(email, {
        timeoutMs: typeof timeoutMs === 'number' ? timeoutMs : 5000,
      });

      ApiResponse.success(res, {
        message: 'Email verification completed',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
}
