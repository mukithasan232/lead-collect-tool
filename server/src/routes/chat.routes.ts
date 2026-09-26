import { Router } from 'express';
import { chatController } from '../controllers/chat.controller';

export const chatRouter = Router();

// POST /api/v1/chat
chatRouter.post('/', chatController.handleChat);
