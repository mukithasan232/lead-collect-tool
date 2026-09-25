
import { Queue, Worker, Job } from 'bullmq';
import { redisConnection } from '../config/redis';
import { scraperService, NubelaRateLimitError } from '../services/scraper.service';
import { emailVerifierService } from '../services/emailVerifier.service';
import { prisma } from '../config/db';

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
 *
 * Pipeline per job:
 *   1. Fetch leads from Proxycurl via ScraperService.
 *   2. Filter out any leads that are already in the DB (dedup by email).
 *   3. Bulk-insert new leads via Prisma createMany (skipDuplicates).
 *   4. Return the list of persisted leads.
 */
export const leadWorker = new Worker<LeadScanPayload, EnrichedLead[]>(
  QUEUE_NAME,
  async (job: Job<LeadScanPayload>): Promise<EnrichedLead[]> => {
    try {
      const { userId, jobTitle, location, industry, keywords, maxResults } = job.data;

      console.log(`⚙️  [Job ${job.id}] Starting — userId="${userId}" | ` +
        `jobTitle="${jobTitle}" | location="${location}" | industry="${industry}"`);

      // ── Step 1: Fetch leads from Nubela ───────────────────────────────────
      await job.updateProgress(10);

      let enrichedLeads: EnrichedLead[];
      try {
        enrichedLeads = await scraperService.fetchLeadsFromNubela({
          userId,
          jobTitle,
          location,
          industry,
          keywords,
          maxResults,
        });
      } catch (err: any) {
        if (err instanceof NubelaRateLimitError) {
          // Surface rate-limit clearly so BullMQ can schedule a retry
          console.warn(
            `⚠️  [Job ${job.id}] Nubela rate limit hit. ` +
            `Retry after ${err.retryAfterSeconds}s. ` +
            `BullMQ will retry with exponential back-off.`
          );
          throw err; // re-throw so BullMQ marks job as failed → triggers retry
        }
        console.error(`❌ [Job ${job.id}] Nubela fetch error:`, err.message);
        throw err;
      }

      await job.updateProgress(50);
      console.log(`📦 [Job ${job.id}] Nubela returned ${enrichedLeads.length} leads.`);

      if (enrichedLeads.length === 0) {
        await job.updateProgress(100);
        console.log(`ℹ️  [Job ${job.id}] No leads returned — nothing to persist.`);
        return [];
      }

    // ── Step 2: Email Discovery & Verification ───────────────────────────────
    await job.updateProgress(60);

    for (let i = 0; i < enrichedLeads.length; i++) {
      const lead = enrichedLeads[i];
      // Basic domain extraction if missing
      const domain = lead.domain || lead.company.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() + '.com';
      
      const nameParts = lead.name.split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : '';

      if (firstName && lastName && domain) {
        console.log(`[Job ${job.id}] Discovering email for ${firstName} ${lastName} @ ${domain}`);
        const verification = await emailVerifierService.discoverAndVerifyEmail(firstName, lastName, domain);

        lead.email = verification.email;
        lead.verificationStatus = verification.status;
      } else {
        lead.verificationStatus = 'UNVERIFIED';
      }

      // Progressively update per lead (from 60% to 90%)
      const prog = 60 + Math.floor(((i + 1) / enrichedLeads.length) * 30);
      await job.updateProgress(prog);
    }

    // ── Step 3: Bulk-insert into PostgreSQL via Prisma ───────────────────────
    await job.updateProgress(90);

    // Ensure the user exists in database to satisfy foreign key constraint
    try {
      await prisma.user.upsert({
        where: { id: userId },
        update: {},
        create: {
          id: userId,
          email: `${userId}@leadpulse.ai`,
          credits: 100,
        },
      });
    } catch (userErr) {
      console.warn(`⚠️ [Job ${job.id}] User upsert notice:`, (userErr as Error).message);
    }

    /**
     * Map EnrichedLead → Prisma Lead create input.
     * `skipDuplicates` lets us re-run scans safely without throwing on duplicate emails.
     */
    const leadsToInsert = enrichedLeads.map((lead) => ({
      userId,
      name: lead.name,
      jobTitle: lead.jobTitle ?? undefined,
      company: lead.company,
      email: lead.email ?? undefined,
      linkedinUrl: lead.linkedinUrl ?? undefined,
      domain: lead.domain ?? undefined,
      sourcePlatform: lead.sourcePlatform,
      verificationStatus: lead.verificationStatus ?? 'UNVERIFIED',
    }));

    let insertedCount = 0;
    try {
      const result = await prisma.lead.createMany({
        data: leadsToInsert,
        skipDuplicates: true, // idempotent — won't throw on repeated scans
      });
      insertedCount = result.count;
    } catch (dbErr) {
      console.error(
        `❌ [Job ${job.id}] Database insert failed:`,
        (dbErr as Error).message
      );
      throw dbErr; // fail the job so BullMQ can retry
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
