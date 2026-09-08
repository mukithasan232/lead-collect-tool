import { Response } from 'express';

export interface ApiResponseOptions<T> {
  statusCode?: number;
  message?: string;
  data?: T;
  meta?: Record<string, unknown>;
}

export class ApiResponse {
  static success<T>(
    res: Response,
    { statusCode = 200, message = 'Success', data, meta }: ApiResponseOptions<T>
  ): Response {
    return res.status(statusCode).json({
      success: true,
      message,
      data: data ?? null,
      meta,
    });
  }

  static created<T>(
    res: Response,
    { message = 'Resource created successfully', data, meta }: Omit<ApiResponseOptions<T>, 'statusCode'>
  ): Response {
    return res.status(201).json({
      success: true,
      message,
      data: data ?? null,
      meta,
    });
  }

  static noContent(res: Response): Response {
    return res.status(204).send();
  }
}
