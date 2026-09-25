import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env';
import { requestLogger } from './middleware/requestLogger';
import { notFoundHandler } from './middleware/notFoundHandler';
import { errorHandler } from './middleware/errorHandler';
import { apiRouter } from './routes';

const ALLOWED_ORIGINS = [
  'https://lead.codernest.cloud',
  'https://app.codernest.cloud',
  'http://localhost:3000',
];

const corsOptions: cors.CorsOptions = {
  origin: ALLOWED_ORIGINS,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  credentials: true,
};

export function createApp(): Application {
  const app = express();

  // ── CORS FIRST — before ALL middleware and routes ──────────────────────────
  app.options('*', cors(corsOptions)); // Handle preflight for every route
  app.use(cors(corsOptions));          // Apply CORS headers to all responses

  // Security headers (after CORS so CORS headers aren't overwritten)
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }));

  // Body parsers
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // HTTP Request Logging
  app.use(requestLogger);

  // Root Welcome Endpoint
  app.get('/', (_req: Request, res: Response) => {
    res.json({
      name: 'LeadPulse AI API',
      version: '1.0.0',
      status: 'online',
      documentation: `${env.API_PREFIX}/health`,
    });
  });

  // API Routes (e.g. /api/v1/...)
  app.use(env.API_PREFIX, apiRouter);

  // 404 Handler
  app.use(notFoundHandler);

  // Centralized Error Handler
  app.use(errorHandler);

  return app;
}
