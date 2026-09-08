import { Router } from 'express';
import { LeadController } from '../controllers/lead.controller';

export const leadRouter = Router();

leadRouter.get('/', LeadController.list);
leadRouter.get('/:id', LeadController.getById);
leadRouter.post('/', LeadController.create);
leadRouter.patch('/:id', LeadController.update);
leadRouter.delete('/:id', LeadController.delete);
