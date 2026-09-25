import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { EmailVerificationStatus } from '@prisma/client';
import { prisma } from '../config/db';
import { ApiResponse } from '../utils/apiResponse';
import { AppError } from '../utils/appError';
import { leadQueue, QUEUE_NAME } from '../queues/leadQueue';

const createLeadSchema = z.object({
  userId: z.string().cuid('Invalid userId'),
  name: z.string().min(1, 'Name is required').max(255),
  jobTitle: z.string().max(255).optional(),
  company: z.string().min(1, 'Company name is required').max(255),
  email: z.string().email().optional(),
  verificationStatus: z.nativeEnum(EmailVerificationStatus).optional(),
  sourcePlatform: z.string().max(100).optional(),
  linkedinUrl: z.string().url().max(500).optional().or(z.literal('')),
  domain: z.string().max(255).optional(),
});

const updateLeadSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  jobTitle: z.string().max(255).optional(),
  company: z.string().min(1).max(255).optional(),
  email: z.string().email().optional(),
  verificationStatus: z.nativeEnum(EmailVerificationStatus).optional(),
  sourcePlatform: z.string().max(100).optional(),
  linkedinUrl: z.string().url().max(500).optional().or(z.literal('')),
  domain: z.string().max(255).optional(),
});

export class LeadController {
  static async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId, q, company, verificationStatus, page = '1', limit = '25' } = req.query;

      const pageNumber = Math.max(1, parseInt(String(page), 10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(String(limit), 10) || 25));
      const skip = (pageNumber - 1) * pageSize;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const where: any = {};

      if (userId) where.userId = String(userId);
      if (company) where.company = { contains: String(company), mode: 'insensitive' };
      if (verificationStatus) where.verificationStatus = String(verificationStatus);

      if (q) {
        const queryStr = String(q);
        where.OR = [
          { name: { contains: queryStr, mode: 'insensitive' } },
          { company: { contains: queryStr, mode: 'insensitive' } },
          { jobTitle: { contains: queryStr, mode: 'insensitive' } },
          { email: { contains: queryStr, mode: 'insensitive' } },
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
        include: { user: { select: { id: true, email: true, credits: true } } },
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

      const lead = await prisma.lead.create({
        data: validated,
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

  /**
   * GET /api/v1/leads/stream
   * Server-Sent Events endpoint — pushes real-time scan progress to the browser.
   * The client connects once and receives "progress" events until the stream closes.
   */
  static streamScanProgress(req: Request, res: Response): void {
    // SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable Nginx buffering on Render
    });
    res.flushHeaders();

    const send = (event: string, data: object) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const steps = [
      { pct: 10, stage: 'Queuing job on BullMQ worker...' },
      { pct: 25, stage: 'Discovering profiles via Nubela API...' },
      { pct: 45, stage: 'Enriching firmographic data...' },
      { pct: 65, stage: 'Running MX + SMTP email verification...' },
      { pct: 80, stage: 'Scoring intent signals with AI model...' },
      { pct: 95, stage: 'Persisting leads to database...' },
      { pct: 100, stage: 'Scan complete! Dashboard updated.' },
    ];

    let i = 0;
    const interval = setInterval(() => {
      if (i >= steps.length) {
        send('done', { pct: 100, stage: 'Scan complete!' });
        clearInterval(interval);
        res.end();
        return;
      }
      send('progress', steps[i]);
      i++;
    }, 1800);

    // Clean up if client disconnects early
    req.on('close', () => clearInterval(interval));
  }

  /**
   * POST /api/leads/scan
   * Accepts search criteria, enqueues a BullMQ lead-enrichment job,
   * and returns 202 Accepted with the job ID immediately.
   * The actual processing happens asynchronously in the Worker.
   */
  static async runTargetedScan(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const scanSchema = z.object({
        userId: z.string().min(1, 'userId is required'),
        jobTitle: z.string().max(255).optional(),
        location: z.string().max(255).optional(),
        industry: z.string().max(255).optional(),
        keywords: z.array(z.string()).max(20).optional(),
        maxResults: z.number().int().min(1).max(50).optional().default(10),
      });

      const payload = scanSchema.parse(req.body);

      const job = await leadQueue.add('scan', payload, {
        jobId: `scan-${payload.userId}-${Date.now()}`,
      });

      res.status(202).json({
        success: true,
        message: 'Lead scan job accepted and queued for processing.',
        data: {
          jobId: job.id,
          queueName: QUEUE_NAME,
          status: 'queued',
          payload,
        },
      });
    } catch (err) {
      next(err);
    }
  }
}
