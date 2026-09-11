import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const defaultAllowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'https://lead-collect-tool-mu.vercel.app',
  'https://app.codernest.cloud',
  'https://codernest.cloud',
];

const rawCors = process.env.CORS_ORIGIN || '';
const configuredOrigins = rawCors
  ? rawCors.split(',').map((o) => o.trim()).filter(Boolean)
  : [];

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '5001', 10),
  API_PREFIX: process.env.API_PREFIX || '/api/v1',
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:3000',
  CORS_ORIGINS: Array.from(new Set([...defaultAllowedOrigins, ...configuredOrigins])),
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/leadpulse_db?schema=public',
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
  PROXYCURL_API_KEY: process.env.PROXYCURL_API_KEY || process.env.NUBELA_API_KEY || '',
  NUBELA_API_KEY: process.env.NUBELA_API_KEY || process.env.PROXYCURL_API_KEY || '',
  PDL_API_KEY: process.env.PDL_API_KEY || '',
  isDev: (process.env.NODE_ENV || 'development') === 'development',
  isProd: process.env.NODE_ENV === 'production',
};
