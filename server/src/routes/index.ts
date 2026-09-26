import { Router } from 'express';
import { healthRouter } from './health.routes';
import { userRouter } from './user.routes';
import { leadRouter } from './lead.routes';
import { chatRouter } from './chat.routes';

export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/users', userRouter);
apiRouter.use('/leads', leadRouter);
apiRouter.use('/chat', chatRouter);
