import { Router, Request, Response } from 'express';
import { prisma, isDbConnected, setDbConnected } from '../config/db';
import { ApiResponse } from '../utils/apiResponse';

export const healthRouter = Router();

healthRouter.get('/', async (_req: Request, res: Response) => {
  let dbStatus = isDbConnected ? 'connected' : 'unreachable';
  let dbLatencyMs: number | null = null;

  if (isDbConnected) {
    try {
      const start = Date.now();
      await prisma.$queryRaw`SELECT 1`;
      dbLatencyMs = Date.now() - start;
      dbStatus = 'connected';
    } catch {
      dbStatus = 'unreachable';
      setDbConnected(false);
    }
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
        type: 'PostgreSQL',
      },
    },
  };

  ApiResponse.success(res, {
    statusCode: 200,
    message: dbStatus === 'connected' ? 'All systems operational' : 'Database service degraded (in-memory store active)',
    data: payload,
  });
});
