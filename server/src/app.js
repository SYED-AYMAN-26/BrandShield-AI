
import express from 'express';
import mongoose from 'mongoose';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { errorHandler, notFound } from './lib/http.js';

import authRoutes from './routes/auth.js';
import brandRoutes from './routes/brand.js';
import contentRoutes from './routes/content.js';
import dashboardRoutes from './routes/dashboard.js';
import insightsRoutes from './routes/insights.js';
import evaluationRoutes from './routes/evaluation.js';

let dbConnectionPromise;

async function ensureDatabaseConnection() {
  if (mongoose.connection.readyState === 1) {
    return;
  }

  if (!dbConnectionPromise) {
    dbConnectionPromise = mongoose.connect(config.mongoUri, {
      serverSelectionTimeoutMS: 8000,
    }).catch((error) => {
      dbConnectionPromise = undefined;
      throw error;
    });
  }

  await dbConnectionPromise;
}

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);

  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }));

  const allowed = config.clientOrigin
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  function originAllowed(origin) {
    if (!origin) return true;
    if (allowed.includes(origin)) return true;

    if (config.env !== 'production') {
      try {
        const u = new URL(origin);
        if (['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)) {
          return true;
        }
        if (/\.e2b\.app$/i.test(u.hostname)) return true;
      } catch {
        return false;
      }
    }

    return false;
  }

  app.use(cors({
    origin(origin, cb) {
      cb(null, originAllowed(origin));
    },
    credentials: true,
    optionsSuccessStatus: 204,
  }));

  app.use((req, res, next) => {
    if (req.headers.origin && !originAllowed(req.headers.origin)) {
      return res.status(403).json({
        error: {
          message: 'This website is not allowed to call the API.',
          status: 403,
        },
      });
    }
    next();
  });

  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.use('/api', rateLimit({
    windowMs: 60 * 1000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: {
        message: 'Too many requests. Please slow down for a moment.',
      },
    },
  }));

  // Keep the health endpoint available even if the database is disconnected.
  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'brandshield-api',
      version: '3.0.0',
      time: new Date().toISOString(),
    });
  });

  // Connect to MongoDB before handling database-backed API requests.
  app.use('/api', async (req, res, next) => {
    if (req.path === '/health') return next();

    try {
      await ensureDatabaseConnection();
      next();
    } catch (error) {
      console.error('[db] connection failed:', error.message);
      res.status(503).json({
        error: {
          message: 'Database temporarily unavailable. Please try again.',
        },
      });
    }
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/brand', brandRoutes);
  app.use('/api/content', contentRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/insights', insightsRoutes);
  app.use('/api/evaluation', evaluationRoutes);

  app.use('/api', (_req, _res, next) => {
    next(notFound('That API endpoint does not exist.'));
  });

  app.use(errorHandler);

  return app;
}

export default createApp();
