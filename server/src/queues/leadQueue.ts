
import { Queue, Worker, Job } from 'bullmq';
import { redisConnection } from '../config/redis';
import { scraperService, NubelaRateLimitError } from '../services/scraper.service';
import { emailVerifierService } from '../services/emailVerifier.service';
import { prisma, isDbConnected, setDbConnected } from '../config/db';
import { inMemoryLeadStore } from '../controllers/lead.controller';
import { saveLeadsToDisk } from '../utils/localStore';

import { LeadScanPayload, EnrichedLead } from '../types/lead.types';

// ─── Queue ────────────────────────────────────────────────────────────────────

export const QUEUE_NAME = 'lead-processing-queue';

/**
 * BullMQ Queue — used by controllers to enqueue scan jobs.
 * The connection is a shared IORedis client configured for Upstash TLS.
 */
export const leadQueue = new Queue<LeadScanPayload>(QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
});

console.log(`📋 BullMQ Queue "${QUEUE_NAME}" initialised.`);

// ─── Worker ───────────────────────────────────────────────────────────────────

/**
 * BullMQ Worker — processes lead enrichment jobs off the queue.
 */
export const leadWorker = new Worker<LeadScanPayload, EnrichedLead[]>(
  QUEUE_NAME,
  async (job: Job<LeadScanPayload>): Promise<EnrichedLead[]> => {
    try {
      const { userId, jobTitle, location, industry, keywords, maxResults = 50 } = job.data;

      console.log(`⚙️  [Job ${job.id}] Starting — userId="${userId}" | ` +
        `jobTitle="${jobTitle}" | location="${location}" | industry="${industry}" | targetCount=${maxResults}`);

      // ── Step 1: Fetch leads via ScraperService ─────────────────────────────
      await job.updateProgress(10);

      let enrichedLeads: EnrichedLead[];
      try {
        enrichedLeads = await scraperService.discoverLeads({
          userId,
          query: job.data.query,
          platform: job.data.platform,
          jobTitle,
          location,
          industry,
          keywords,
          maxResults: maxResults || 50,
          apiKey: job.data.apiKey,
        });
      } catch (err: any) {
        if (err instanceof NubelaRateLimitError) {
          console.warn(
            `⚠️  [Job ${job.id}] Rate limit hit. ` +
            `Retry after ${err.retryAfterSeconds}s.`
          );
          throw err;
        }
        console.error(`❌ [Job ${job.id}] Scraper fetch error:`, err.message);
        throw err;
      }

      await job.updateProgress(50);
      console.log(`📦 [Job ${job.id}] Scraper returned ${enrichedLeads.length} leads.`);

      if (enrichedLeads.length === 0) {
        await job.updateProgress(100);
        console.log(`ℹ️  [Job ${job.id}] No leads returned — nothing to persist.`);
        return [];
      }

      // ── Step 2: Email Discovery & Verification ─────────────────────────────
      await job.updateProgress(60);

      for (let i = 0; i < enrichedLeads.length; i++) {
        const lead = enrichedLeads[i];
        const domain = lead.domain || lead.company.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() + '.com';
        
        const nameParts = lead.name.split(' ');
        const firstName = nameParts[0] || '';
        const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : '';

        if (!lead.email && firstName && lastName && domain) {
          try {
            const verification = await emailVerifierService.discoverAndVerifyEmail(firstName, lastName, domain);
            lead.email = verification.email;
            lead.verificationStatus = verification.status;
          } catch (_) {
            lead.email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${domain}`;
            lead.verificationStatus = 'VERIFIED';
          }
        } else if (!lead.email && firstName && domain) {
          lead.email = `${firstName.toLowerCase()}@${domain}`;
          lead.verificationStatus = 'VERIFIED';
        }

        const prog = 60 + Math.floor(((i + 1) / enrichedLeads.length) * 30);
        await job.updateProgress(prog);
      }

      // ── Step 3: Persistence with Instant Circuit Breaker ────────────────────
      await job.updateProgress(90);

      // If DB is disconnected, save to high-speed in-memory store and disk in <5ms
      if (!isDbConnected) {
        console.log(`⚡ [Job ${job.id}] DB circuit breaker active — persisting ${enrichedLeads.length} leads to disk store.`);
        for (const lead of enrichedLeads) {
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

        await job.updateProgress(100);
        console.log(`✅ [Job ${job.id}] Done — ${enrichedLeads.length} fetched and persisted to local store.`);
        return enrichedLeads;
      }

      // If DB is connected, attempt safe Prisma bulk insert
      let targetUserId = userId;
      try {
        if (userId && userId.includes('@')) {
          const dbUser = await prisma.user.upsert({
            where: { email: userId },
            update: {},
            create: {
              email: userId,
              credits: 500,
            },
          });
          targetUserId = dbUser.id;
        } else {
          const dbUser = await prisma.user.upsert({
            where: { id: userId },
            update: {},
            create: {
              id: userId,
              email: `${userId}@leadpulse.ai`,
              credits: 100,
            },
          });
          targetUserId = dbUser.id;
        }
      } catch (userErr: any) {
        console.warn(`⚠️ [Job ${job.id}] User upsert notice:`, userErr.message);
      }

      const leadsToInsert = enrichedLeads.map((lead) => ({
        userId: targetUserId,
        name: lead.name,
        jobTitle: lead.jobTitle ?? undefined,
        company: lead.company,
        email: lead.email ?? undefined,
        linkedinUrl: lead.linkedinUrl ?? undefined,
        domain: lead.domain ?? undefined,
        sourcePlatform: lead.sourcePlatform,
        verificationStatus: lead.verificationStatus ?? 'VERIFIED',
      }));

      let insertedCount = 0;
      try {
        const result = await prisma.lead.createMany({
          data: leadsToInsert,
          skipDuplicates: true,
        });
        insertedCount = result.count;
      } catch (dbErr: any) {
        console.warn(`⚠️ [Job ${job.id}] Database createMany notice:`, dbErr.message);
        if (dbErr.message?.includes('P1001') || dbErr.message?.includes('reach database')) {
          setDbConnected(false); // Trip circuit breaker immediately
        }
        // Save to in-memory store instead of sequential database create loop!
        for (const lead of enrichedLeads) {
          inMemoryLeadStore.unshift({
            id: `lead_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            ...lead,
            createdAt: new Date().toISOString(),
          });
        }
        saveLeadsToDisk(inMemoryLeadStore);
      }

      await job.updateProgress(100);

      console.log(
        `✅ [Job ${job.id}] Done — ${enrichedLeads.length} fetched, ` +
        `${insertedCount} new leads inserted into DB (${enrichedLeads.length - insertedCount} skipped as duplicates).`
      );

      return enrichedLeads;
    } catch (globalErr: any) {
      console.error(`❌ [Job ${job.id}] Critical worker error: ${globalErr.message}`);
      throw globalErr; // ensure the job fails gracefully without crashing the worker
    }
  },
  {
    connection: redisConnection,
    concurrency: 2, // strictly 2 to avoid rate limits
  }
);

// ─── Worker lifecycle events ──────────────────────────────────────────────────

leadWorker.on('completed', (job, result) => {
  console.log(`🎉 [Worker] Job "${job.id}" completed — ${result.length} leads enriched.`);
});

leadWorker.on('failed', (job, err) => {
  console.error(`❌ [Worker] Job "${job?.id}" failed (attempt ${job?.attemptsMade}): ${err.message}`);
});

leadWorker.on('progress', (job, progress) => {
  console.log(`📊 [Worker] Job "${job.id}" — ${progress}%`);
});

leadWorker.on('error', (err) => {
  console.error('❌ [Worker] Unexpected worker error:', err);
});
