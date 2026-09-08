import { z } from 'zod';

/**
 * Validates a 24-character hexadecimal MongoDB ObjectId string
 */
export const objectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, 'Invalid MongoDB ObjectId format');
