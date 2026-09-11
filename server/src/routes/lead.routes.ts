import { Router } from 'express';
import { LeadController } from '../controllers/lead.controller';

export const leadRouter = Router();

// ── Scan endpoint (must be defined before /:id to avoid route collision) ─────
leadRouter.post('/scan', LeadController.runTargetedScan);

// ── Standard CRUD ─────────────────────────────────────────────────────────────
leadRouter.get('/', LeadController.list);
leadRouter.post('/', LeadController.create);
leadRouter.get('/:id', LeadController.getById);
leadRouter.patch('/:id', LeadController.update);
leadRouter.delete('/:id', LeadController.delete);
