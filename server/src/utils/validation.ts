import { z } from 'zod';

/**
 * Validates a CUID string (Prisma default for PostgreSQL @default(cuid()))
 */
export const cuidSchema = z.string().cuid('Invalid ID format');
