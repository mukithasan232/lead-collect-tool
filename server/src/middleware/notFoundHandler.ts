import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/appError';

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new AppError(`Cannot ${req.method} ${req.originalUrl} - Route not found`, 404));
}
