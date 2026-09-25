import { Router } from 'express';
import { LeadController } from '../controllers/lead.controller';
import { apiKeyAuth } from '../middleware/apiKeyAuth';

export const leadRouter = Router();

// Apply lightweight API key auth to ALL lead endpoints
leadRouter.use(apiKeyAuth);

// ── SSE real-time progress stream (must be before /:id) ──────────────────────
leadRouter.get('/stream', LeadController.streamScanProgress);

// ── Scan endpoint (must be defined before /:id to avoid route collision) ─────
leadRouter.post('/scan', LeadController.runTargetedScan);

// ── Standard CRUD ─────────────────────────────────────────────────────────────
leadRouter.get('/', LeadController.list);
leadRouter.post('/', LeadController.create);
leadRouter.get('/:id', LeadController.getById);
leadRouter.patch('/:id', LeadController.update);
leadRouter.delete('/:id', LeadController.delete);
