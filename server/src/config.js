import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(ROOT, '.env') });

const bool = (v, d = false) => (v === undefined || v === '' ? d : /^(1|true|yes|on)$/i.test(String(v)));

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4000),
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/brandshield',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-insecure-secret-change-me',
  jwtExpiry: process.env.JWT_EXPIRY || '7d',
  // AI gateway: 'none' => deterministic rule engine only (no network calls at all)
  aiProvider: (process.env.AI_PROVIDER || 'none').toLowerCase(),
  aiApiKey: process.env.AI_API_KEY || '',
  aiBaseUrl: process.env.AI_BASE_URL || 'https://api.openai.com/v1',
  aiModel: process.env.AI_MODEL || 'gpt-4o-mini',
  aiTimeoutMs: Number(process.env.AI_TIMEOUT_MS || 20000),
  confidentialMode: bool(process.env.CONFIDENTIAL_MODE, false),
  aiLogRetentionDays: Number(process.env.AI_LOG_RETENTION_DAYS || 30),
  uploadMaxBytes: Number(process.env.UPLOAD_MAX_BYTES || 5 * 1024 * 1024),
  urlFetchMaxBytes: Number(process.env.URL_FETCH_MAX_BYTES || 2 * 1024 * 1024),
  urlFetchTimeoutMs: Number(process.env.URL_FETCH_TIMEOUT_MS || 8000),
  allowPrivateUrlTargets: bool(process.env.ALLOW_PRIVATE_URL_TARGETS, false),
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  seedDemoData: bool(process.env.SEED_DEMO_DATA, true),
};

export const isProd = config.env === 'production';
if (isProd && config.jwtSecret.startsWith('dev-only')) {
  throw new Error('FATAL: JWT_SECRET must be set in production.');
}
