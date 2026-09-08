import { Router, Request, Response } from 'express';
import { prisma } from '../config/db';
import { ApiResponse } from '../utils/apiResponse';

export const healthRouter = Router();

healthRouter.get('/', async (_req: Request, res: Response) => {
  let dbStatus = 'disconnected';
  let dbLatencyMs: number | null = null;

  try {
    const start = Date.now();
    // Run native MongoDB ping command
    await prisma.$runCommandRaw({ ping: 1 });
    dbLatencyMs = Date.now() - start;
    dbStatus = 'connected';
  } catch {
    dbStatus = 'unreachable';
  }

  const payload = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    nodeVersion: process.version,
    memoryUsage: process.memoryUsage(),
    services: {
      database: {
        status: dbStatus,
        latencyMs: dbLatencyMs,
        type: 'MongoDB Atlas',
      },
    },
  };

  ApiResponse.success(res, {
    statusCode: dbStatus === 'connected' ? 200 : 503,
    message: dbStatus === 'connected' ? 'All systems operational' : 'Database service degraded',
    data: payload,
  });
});
