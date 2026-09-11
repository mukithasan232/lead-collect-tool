import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env';
import { requestLogger } from './middleware/requestLogger';
import { notFoundHandler } from './middleware/notFoundHandler';
import { errorHandler } from './middleware/errorHandler';
import { apiRouter } from './routes';

export function createApp(): Application {
  const app = express();

  // Security headers
  app.use(helmet());

  // CORS configuration — supports local dev, Vercel deployments (*.vercel.app), and production custom domains
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
        if (!origin) return callback(null, true);

        // Check configured whitelist
        if (env.CORS_ORIGINS.includes(origin) || env.CORS_ORIGINS.includes('*')) {
          return callback(null, true);
        }

        // Allow any Vercel deployment preview or production domain (*.vercel.app)
        // or Codernest domain (*.codernest.cloud)
        if (
          /^https:\/\/([a-z0-9-]+\.)?vercel\.app$/.test(origin) ||
          /^https:\/\/([a-z0-9-]+\.)?codernest\.cloud$/.test(origin)
        ) {
          return callback(null, true);
        }

        return callback(new Error(`Origin ${origin} not allowed by CORS policy`));
      },
      credentials: true,
    })
  );

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
