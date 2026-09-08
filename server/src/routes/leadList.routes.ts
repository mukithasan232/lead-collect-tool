import { Router } from 'express';
import { LeadListController } from '../controllers/leadList.controller';

export const leadListRouter = Router();

leadListRouter.get('/', LeadListController.list);
leadListRouter.get('/:id', LeadListController.getById);
leadListRouter.post('/', LeadListController.create);
leadListRouter.patch('/:id', LeadListController.update);
leadListRouter.delete('/:id', LeadListController.delete);
