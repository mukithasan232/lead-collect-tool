import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/appError';

/**
 * Lightweight API Key middleware for protecting all /api/v1/* endpoints.
 * The key is read from the Authorization header: "Bearer <key>"
 * or from the X-API-Key header.
 *
 * For the demo: if no INTERNAL_API_KEY is set in env, middleware is bypassed
 * (open mode) so the frontend works without configuration.
 */
export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  // If no key is configured on the server, run in open mode (demo-friendly)
  const serverKey = process.env.INTERNAL_API_KEY;
  if (!serverKey) return next();

  // Accept key from Authorization: Bearer <key> OR X-API-Key: <key>
  const authHeader = req.headers['authorization'];
  const xApiKey = req.headers['x-api-key'] as string | undefined;

  let providedKey: string | undefined;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    providedKey = authHeader.slice(7).trim();
  } else if (xApiKey) {
    providedKey = xApiKey.trim();
  }

  if (!providedKey || providedKey !== serverKey) {
    next(AppError.unauthorized('Invalid or missing API key'));
    return;
  }

  next();
}
