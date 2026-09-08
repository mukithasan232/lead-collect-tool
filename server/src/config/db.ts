import { PrismaClient } from '@prisma/client';
import { env } from './env';

declare global {
  // Allow global `prisma` in development to prevent multiple client instances during HMR
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

export const prisma =
  global.prisma ||
  new PrismaClient({
    log: env.isDev ? ['query', 'error', 'warn'] : ['error'],
  });

if (env.isDev) {
  global.prisma = prisma;
}

export async function connectDB(): Promise<void> {
  try {
    await prisma.$connect();
    console.log('✅ PostgreSQL database connected successfully via Prisma.');
  } catch (error) {
    console.error('❌ Failed to connect to PostgreSQL database:', error);
  }
}

export async function disconnectDB(): Promise<void> {
  await prisma.$disconnect();
  console.log('🔌 PostgreSQL database disconnected.');
}
