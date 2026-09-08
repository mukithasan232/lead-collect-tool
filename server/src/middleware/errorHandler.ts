import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { AppError } from '../utils/appError';
import { env } from '../config/env';

export function errorHandler(
  err: Error | AppError,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  // 1. Handled AppError (Custom Operational Errors)
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      status: err.status,
      message: err.message,
      details: err.details ?? null,
      ...(env.isDev && { stack: err.stack }),
    });
    return;
  }

  // 2. Zod Validation Errors
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      status: 'fail',
      message: 'Validation failed',
      errors: err.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })),
      ...(env.isDev && { stack: err.stack }),
    });
    return;
  }

  // 3. Prisma Known Database Request Errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const target = (err.meta?.target as string[])?.join(', ') || 'field';
      res.status(409).json({
        success: false,
        status: 'fail',
        message: `Unique constraint violation on ${target}. This record already exists.`,
        code: err.code,
      });
      return;
    }

    if (err.code === 'P2025') {
      res.status(404).json({
        success: false,
        status: 'fail',
        message: 'Record not found in database.',
        code: err.code,
      });
      return;
    }

    if (err.code === 'P2003') {
      res.status(400).json({
        success: false,
        status: 'fail',
        message: 'Foreign key constraint failed. Related record does not exist.',
        code: err.code,
      });
      return;
    }

    res.status(400).json({
      success: false,
      status: 'fail',
      message: `Database query error: ${err.message}`,
      code: err.code,
      ...(env.isDev && { stack: err.stack }),
    });
    return;
  }

  // 4. Prisma Validation Errors
  if (err instanceof Prisma.PrismaClientValidationError) {
    res.status(400).json({
      success: false,
      status: 'fail',
      message: 'Invalid data provided for database operation.',
      ...(env.isDev && { details: err.message }),
    });
    return;
  }

  // 5. Unhandled / Unexpected Server Errors (500)
  console.error('💥 Unhandled Internal Error:', err);

  res.status(500).json({
    success: false,
    status: 'error',
    message: env.isProd ? 'An unexpected internal server error occurred.' : err.message,
    ...(env.isDev && { stack: err.stack }),
  });
}
