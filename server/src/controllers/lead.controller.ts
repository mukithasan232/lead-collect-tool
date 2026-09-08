import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../config/db';
import { ApiResponse } from '../utils/apiResponse';
import { AppError } from '../utils/appError';
import { EmailStatus } from '../types';
import { objectIdSchema } from '../utils/validation';

const createLeadSchema = z.object({
  firstName: z.string().max(100).optional(),
  lastName: z.string().max(100).optional(),
  company: z.string().min(1, 'Company name is required').max(255),
  domain: z.string().max(255).optional(),
  title: z.string().max(255).optional(),
  sourcePlatform: z.string().max(100).optional(),
  linkedinUrl: z.string().url().max(500).optional().or(z.literal('')),
  listId: objectIdSchema,
  // Optional initial email record
  email: z.string().email().optional(),
  emailStatus: z.nativeEnum(EmailStatus).optional(),
  smtpScore: z.number().min(0).max(100).optional(),
});

const updateLeadSchema = z.object({
  firstName: z.string().max(100).optional(),
  lastName: z.string().max(100).optional(),
  company: z.string().min(1).max(255).optional(),
  domain: z.string().max(255).optional(),
  title: z.string().max(255).optional(),
  sourcePlatform: z.string().max(100).optional(),
  linkedinUrl: z.string().url().max(500).optional().or(z.literal('')),
  listId: objectIdSchema.optional(),
});

export class LeadController {
  static async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { listId, q, domain, page = '1', limit = '25' } = req.query;

      const pageNumber = Math.max(1, parseInt(String(page), 10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(String(limit), 10) || 25));
      const skip = (pageNumber - 1) * pageSize;

      // Construct where clause
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const where: any = {};

      if (listId) {
        where.listId = String(listId);
      }

      if (domain) {
        where.domain = { contains: String(domain), mode: 'insensitive' };
      }

      if (q) {
        const queryStr = String(q);
        where.OR = [
          { firstName: { contains: queryStr, mode: 'insensitive' } },
          { lastName: { contains: queryStr, mode: 'insensitive' } },
          { company: { contains: queryStr, mode: 'insensitive' } },
          { title: { contains: queryStr, mode: 'insensitive' } },
          { domain: { contains: queryStr, mode: 'insensitive' } },
        ];
      }

      const [total, leads] = await Promise.all([
        prisma.lead.count({ where }),
        prisma.lead.findMany({
          where,
          skip,
          take: pageSize,
          orderBy: { createdAt: 'desc' },
          include: {
            emailRecords: true,
          },
        }),
      ]);

      ApiResponse.success(res, {
        message: 'Leads retrieved successfully',
        data: leads,
        meta: {
          page: pageNumber,
          limit: pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      });
    } catch (err) {
      next(err);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const lead = await prisma.lead.findUnique({
        where: { id },
        include: {
          list: {
            select: { id: true, name: true, workspaceId: true },
          },
          emailRecords: true,
        },
      });

      if (!lead) {
        throw AppError.notFound(`Lead with ID ${id} not found`);
      }

      ApiResponse.success(res, {
        message: 'Lead retrieved successfully',
        data: lead,
      });
    } catch (err) {
      next(err);
    }
  }

  static async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validated = createLeadSchema.parse(req.body);
      const { email, emailStatus, smtpScore, ...leadData } = validated;

      const lead = await prisma.lead.create({
        data: {
          ...leadData,
          ...(email
            ? {
                emailRecords: {
                  create: {
                    emailAddress: email,
                    status: emailStatus || EmailStatus.UNVERIFIED,
                    smtpScore: smtpScore ?? 0.0,
                  },
                },
              }
            : {}),
        },
        include: {
          emailRecords: true,
        },
      });

      ApiResponse.created(res, {
        message: 'Lead created successfully',
        data: lead,
      });
    } catch (err) {
      next(err);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const data = updateLeadSchema.parse(req.body);

      const lead = await prisma.lead.update({
        where: { id },
        data,
        include: {
          emailRecords: true,
        },
      });

      ApiResponse.success(res, {
        message: 'Lead updated successfully',
        data: lead,
      });
    } catch (err) {
      next(err);
    }
  }

  static async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      await prisma.lead.delete({ where: { id } });

      ApiResponse.noContent(res);
    } catch (err) {
      next(err);
    }
  }
}
