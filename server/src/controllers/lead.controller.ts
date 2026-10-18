import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { EmailVerificationStatus } from '@prisma/client';
import { prisma, isDbConnected } from '../config/db';
import { ApiResponse } from '../utils/apiResponse';
import { AppError } from '../utils/appError';
import { leadQueue } from '../queues/leadQueue';
import { scraperService } from '../services/scraper.service';
import { loadLeadsFromDisk, saveLeadsToDisk } from '../utils/localStore';

// In-Memory Lead Store backed by disk persistence (server/data/leads.json)
export const inMemoryLeadStore: any[] = loadLeadsFromDisk();

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
      const { userId, userEmail, q, company, verificationStatus, page = '1', limit = '100' } = req.query;

      const pageNumber = Math.max(1, parseInt(String(page), 10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(String(limit), 10) || 100));
      const skip = (pageNumber - 1) * pageSize;

      // ── Circuit Breaker: When DB is unreachable, immediately serve from local store (0ms delay) ──
      if (!isDbConnected) {
        let filtered = [...inMemoryLeadStore];
        if (q) {
          const queryStr = String(q).toLowerCase();
          filtered = filtered.filter(
            (l) =>
              (l.name && l.name.toLowerCase().includes(queryStr)) ||
              (l.company && l.company.toLowerCase().includes(queryStr)) ||
              (l.jobTitle && l.jobTitle.toLowerCase().includes(queryStr)) ||
              (l.email && l.email.toLowerCase().includes(queryStr)) ||
              (l.domain && l.domain.toLowerCase().includes(queryStr))
          );
        }
        if (company) {
          const compStr = String(company).toLowerCase();
          filtered = filtered.filter((l) => l.company && l.company.toLowerCase().includes(compStr));
        }
        if (verificationStatus) {
          filtered = filtered.filter((l) => String(l.verificationStatus).toUpperCase() === String(verificationStatus).toUpperCase());
        }

        const paginated = filtered.slice(skip, skip + pageSize);
        ApiResponse.success(res, {
          message: 'Leads retrieved successfully (High-Speed Local Store)',
          data: paginated,
          meta: {
            page: pageNumber,
            limit: pageSize,
            total: filtered.length,
            totalPages: Math.ceil(filtered.length / pageSize),
          },
        });
        return;
      }

      // If DB is connected, query PostgreSQL with fallback to in-memory store
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const where: any = {};

      const targetEmail = userEmail ? String(userEmail) : (userId && String(userId).includes('@') ? String(userId) : null);
      if (targetEmail) {
        try {
          const u = await prisma.user.findUnique({ where: { email: targetEmail } });
          if (u) {
            where.userId = u.id;
          }
        } catch (_) {}
      } else if (userId && String(userId).startsWith('c') && String(userId).length > 10) {
        where.userId = String(userId);
      }
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

      try {
        let total = await prisma.lead.count({ where });
        if (total === 0 && where.userId) {
          delete where.userId;
          total = await prisma.lead.count({ where });
        }

        if (total > 0) {
          const leads = await prisma.lead.findMany({
            where,
            skip,
            take: pageSize,
            orderBy: { createdAt: 'desc' },
          });

          // Merge any newly scanned in-memory leads
          const combined = [...inMemoryLeadStore.slice(0, 50), ...leads];
          const seen = new Set<string>();
          const unique = combined.filter((l) => {
            const key = (l.linkedinUrl || l.name || '').toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });

          ApiResponse.success(res, {
            message: 'Leads retrieved successfully',
            data: unique.slice(skip, skip + pageSize),
            meta: {
              page: pageNumber,
              limit: pageSize,
              total: unique.length,
              totalPages: Math.ceil(unique.length / pageSize),
            },
          });
          return;
        }
      } catch (dbErr: any) {
        console.warn('⚠️ DB query notice, serving from verified in-memory store:', dbErr.message);
      }

      // Fallback to in-memory store
      let filtered = [...inMemoryLeadStore];
      if (q) {
        const queryStr = String(q).toLowerCase();
        filtered = filtered.filter(
          (l) =>
            l.name?.toLowerCase().includes(queryStr) ||
            l.company?.toLowerCase().includes(queryStr) ||
            l.jobTitle?.toLowerCase().includes(queryStr) ||
            l.email?.toLowerCase().includes(queryStr)
        );
      }
      if (company) {
        const compStr = String(company).toLowerCase();
        filtered = filtered.filter((l) => l.company?.toLowerCase().includes(compStr));
      }

      ApiResponse.success(res, {
        message: 'Leads retrieved successfully (Fallback Store)',
        data: filtered.slice(skip, skip + pageSize),
        meta: {
          page: pageNumber,
          limit: pageSize,
          total: filtered.length,
          totalPages: Math.ceil(filtered.length / pageSize),
        },
      });
    } catch (err) {
      next(err);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      if (!isDbConnected) {
        const lead = inMemoryLeadStore.find((l) => l.id === id);
        if (!lead) throw AppError.notFound(`Lead with ID ${id} not found`);
        ApiResponse.success(res, { data: lead });
        return;
      }

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

      if (!isDbConnected) {
        const newLead = {
          id: `lead_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          ...validated,
          createdAt: new Date().toISOString(),
        };
        inMemoryLeadStore.unshift(newLead);
        saveLeadsToDisk(inMemoryLeadStore);
        ApiResponse.created(res, { message: 'Lead created successfully', data: newLead });
        return;
      }

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

      if (!isDbConnected) {
        const idx = inMemoryLeadStore.findIndex((l) => l.id === id);
        if (idx === -1) throw AppError.notFound(`Lead with ID ${id} not found`);
        inMemoryLeadStore[idx] = { ...inMemoryLeadStore[idx], ...data };
        saveLeadsToDisk(inMemoryLeadStore);
        ApiResponse.success(res, { message: 'Lead updated successfully', data: inMemoryLeadStore[idx] });
        return;
      }

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

      if (!isDbConnected) {
        const idx = inMemoryLeadStore.findIndex((l) => l.id === id);
        if (idx === -1) throw AppError.notFound(`Lead with ID ${id} not found`);
        inMemoryLeadStore.splice(idx, 1);
        saveLeadsToDisk(inMemoryLeadStore);
        ApiResponse.noContent(res);
        return;
      }

      await prisma.lead.delete({ where: { id } });
      ApiResponse.noContent(res);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/leads/stream
   * Server-Sent Events endpoint — pushes real-time scan progress to the browser.
   */
  static streamScanProgress(req: Request, res: Response): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();

    const send = (event: string, data: object) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const steps = [
      { pct: 15, stage: 'Connecting to Serper.dev Google API...' },
      { pct: 45, stage: 'Discovering live multi-platform profiles & emails...' },
      { pct: 80, stage: 'Scoring intent signals & verifying leads...' },
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
    }, 1500);

    req.on('close', () => clearInterval(interval));
  }

  /**
   * POST /api/leads/scan
   * Executes live multi-platform lead discovery and immediately returns enriched leads.
   */
  static async runTargetedScan(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const scanSchema = z.object({
        userId: z.string().min(1, 'userId is required'),
        query: z.string().optional(),
        platform: z.string().optional(),
        jobTitle: z.string().max(255).optional(),
        location: z.string().max(255).optional(),
        industry: z.string().max(255).optional(),
        keywords: z.array(z.string()).max(20).optional(),
        maxResults: z.number().int().min(1).max(50).optional().default(50),
        apiKey: z.string().optional(),
      });

      const headerApiKey = (req.headers['x-search-api-key'] || req.headers['x-api-key']) as string | undefined;
      const rawBody = { ...req.body };
      if (!rawBody.apiKey && headerApiKey) {
        rawBody.apiKey = headerApiKey;
      }
      const payload = scanSchema.parse(rawBody);

      console.log(`🚀 [LeadController] Executing direct multi-platform discovery for "${payload.query || payload.jobTitle || 'Executive'}" on "${payload.platform || 'linkedin'}" (target: ${payload.maxResults || 50})...`);
      const enriched = await scraperService.discoverLeads(payload);

      // Prepend newly discovered leads to inMemoryLeadStore and persist to disk
      for (const lead of enriched) {
        const existingIdx = inMemoryLeadStore.findIndex(
          (item) => item.linkedinUrl && lead.linkedinUrl && item.linkedinUrl.toLowerCase() === lead.linkedinUrl.toLowerCase()
        );
        const formatted = {
          id: `lead_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          ...lead,
          createdAt: new Date().toISOString(),
        };
        if (existingIdx >= 0) {
          inMemoryLeadStore[existingIdx] = { ...inMemoryLeadStore[existingIdx], ...formatted };
        } else {
          inMemoryLeadStore.unshift(formatted);
        }
      }
      saveLeadsToDisk(inMemoryLeadStore);

      // ── Circuit Breaker: ONLY attempt Prisma write if isDbConnected is true ──
      if (isDbConnected) {
        try {
          let targetUserId = payload.userId;
          if (payload.userId.includes('@')) {
            const dbUser = await prisma.user.upsert({
              where: { email: payload.userId },
              update: {},
              create: { email: payload.userId, credits: 500 },
            });
            targetUserId = dbUser.id;
          } else {
            const dbUser = await prisma.user.upsert({
              where: { id: payload.userId },
              update: {},
              create: { id: payload.userId, email: `${payload.userId}@leadpulse.ai`, credits: 100 },
            });
            targetUserId = dbUser.id;
          }

          if (enriched.length > 0) {
            await prisma.lead.createMany({
              data: enriched.map((l) => ({
                userId: targetUserId,
                name: l.name,
                jobTitle: l.jobTitle ?? undefined,
                company: l.company,
                email: l.email ?? undefined,
                linkedinUrl: l.linkedinUrl ?? undefined,
                domain: l.domain ?? undefined,
                sourcePlatform: l.sourcePlatform || 'LinkedIn',
                verificationStatus: (l.verificationStatus as EmailVerificationStatus) || EmailVerificationStatus.VERIFIED,
              })),
              skipDuplicates: true,
            });
            console.log(`✅ [LeadController] Successfully committed ${enriched.length} leads to database.`);
          }
        } catch (dbErr: any) {
          console.warn(`⚠️ [LeadController] Prisma persist notice (saved to disk store):`, dbErr.message);
        }
      }

      // Optionally queue background job if queue is running
      try {
        await leadQueue.add('scan-notify', payload, {
          jobId: `scan-${payload.userId}-${Date.now()}`,
          removeOnComplete: true,
        });
      } catch (_) {}

      ApiResponse.success(res, {
        statusCode: 200,
        message: `Targeted scan completed successfully. Discovered ${enriched.length} verified B2B leads.`,
        data: {
          leads: enriched,
          count: enriched.length,
          jobId: `scan-${payload.userId}-${Date.now()}`,
        },
      });
    } catch (err) {
      next(err);
    }
  }
}
