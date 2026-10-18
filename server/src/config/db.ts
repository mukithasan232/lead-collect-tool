import { PrismaClient } from '@prisma/client';
import { env } from './env';

declare global {
  // Allow global `prisma` in development to prevent multiple client instances during HMR
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

// Circuit breaker flag
export let isDbConnected = false;

export function setDbConnected(value: boolean): void {
  isDbConnected = value;
}

export function resolveDatabaseUrl(): string {
  let url = process.env.DATABASE_URL || env.DATABASE_URL || '';

  // If host is the IPv6 direct host, automatically transform to the IPv4-compatible Supavisor pooler host
  if (url.includes('db.zcgqbcomvlhbzposybun.supabase.co')) {
    if (process.env.DIRECT_URL && process.env.DIRECT_URL.includes('pooler.supabase.com')) {
      url = process.env.DIRECT_URL;
    } else {
      url = url
        .replace('db.zcgqbcomvlhbzposybun.supabase.co:5432', 'aws-0-ap-southeast-2.pooler.supabase.com:6543')
        .replace('//postgres:', '//postgres.zcgqbcomvlhbzposybun:');
      if (!url.includes('pgbouncer=true')) {
        url += (url.includes('?') ? '&' : '?') + 'pgbouncer=true';
      }
    }
    process.env.DATABASE_URL = url;
  }
  return url;
}

const activeDbUrl = resolveDatabaseUrl();

export const prisma =
  global.prisma ||
  new PrismaClient({
    datasources: activeDbUrl ? { db: { url: activeDbUrl } } : undefined,
    log: env.isDev ? ['error'] : ['error'],
  });

if (env.isDev) {
  global.prisma = prisma;
}

export async function connectDB(): Promise<void> {
  try {
    const connectPromise = prisma.$connect();
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Prisma connection timed out after 2500ms')), 2500)
    );

    await Promise.race([connectPromise, timeoutPromise]);
    isDbConnected = true;
    console.log('✅ PostgreSQL database connected successfully via Prisma.');
  } catch (error: any) {
    isDbConnected = false;
    console.log('⚡ DB unreachable — running in high-speed In-Memory + Disk Persistence mode');
  }
}

export async function disconnectDB(): Promise<void> {
  if (!isDbConnected) return;
  try {
    await prisma.$disconnect();
    isDbConnected = false;
    console.log('🔌 PostgreSQL database disconnected.');
  } catch (error) {
    console.warn('⚠️ Error disconnecting Prisma client:', error);
  }
}
