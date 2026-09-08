import { Router } from 'express';
import { healthRouter } from './health.routes';
import { workspaceRouter } from './workspace.routes';
import { userRouter } from './user.routes';
import { leadListRouter } from './leadList.routes';
import { leadRouter } from './lead.routes';
import { emailRecordRouter } from './emailRecord.routes';

export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/workspaces', workspaceRouter);
apiRouter.use('/users', userRouter);
apiRouter.use('/lead-lists', leadListRouter);
apiRouter.use('/leads', leadRouter);
apiRouter.use('/email-records', emailRecordRouter);
