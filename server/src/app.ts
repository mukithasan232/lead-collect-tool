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
  'https://codernest.cloud',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  ...env.CORS_ORIGINS,
];

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g., curl, Postman, server-to-server)
    if (!origin) return callback(null, true);
    // Allow any Vercel preview deploy URL
    if (origin.endsWith('.vercel.app')) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  optionsSuccessStatus: 204,
};

export function createApp(): Application {
  const app = express();

  // ── CORS must be registered FIRST, before helmet or any other middleware ──
  // Explicitly handle OPTIONS preflight for ALL routes
  app.options('*', cors(corsOptions));
  app.use(cors(corsOptions));

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
