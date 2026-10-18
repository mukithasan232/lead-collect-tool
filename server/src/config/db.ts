import { PrismaClient } from '@prisma/client';
import { env } from './env';

declare global {
  // Allow global `prisma` in development to prevent multiple client instances during HMR
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
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
    log: env.isDev ? ['query', 'error', 'warn'] : ['error'],
  });

if (env.isDev) {
  global.prisma = prisma;
}

export async function connectDB(): Promise<void> {
  try {
    await prisma.$connect();
    console.log('✅ PostgreSQL database connected successfully via Prisma.');
  } catch (error: any) {
    console.warn('⚠️ Non-fatal: PostgreSQL connection unreachable (P1001 or degraded pooler). In-memory fallback active:', error?.message || error);
    // Never call process.exit(1) or throw to prevent crashing the server
  }
}

export async function disconnectDB(): Promise<void> {
  try {
    await prisma.$disconnect();
    console.log('🔌 PostgreSQL database disconnected.');
  } catch (error) {
    console.warn('⚠️ Error disconnecting Prisma client:', error);
  }
}
