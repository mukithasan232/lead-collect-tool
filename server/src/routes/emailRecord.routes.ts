import { Router } from 'express';
import { EmailRecordController } from '../controllers/emailRecord.controller';

export const emailRecordRouter = Router();

emailRecordRouter.get('/', EmailRecordController.list);
emailRecordRouter.post('/verify', EmailRecordController.verify);
emailRecordRouter.get('/:id', EmailRecordController.getById);
emailRecordRouter.post('/', EmailRecordController.create);
emailRecordRouter.patch('/:id', EmailRecordController.update);
emailRecordRouter.delete('/:id', EmailRecordController.delete);
