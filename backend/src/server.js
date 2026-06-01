import express from 'express';
import cors    from 'cors';
import helmet  from 'helmet';
import morgan  from 'morgan';
import { env } from './config/env.js';
import { testConnections } from './config/db.js';
import { errorHandler } from './middleware/error.middleware.js';
import { requestLogger } from './middleware/logger.js';

import authRoutes       from './routes/auth.routes.js';
import crmRoutes        from './routes/crm.routes.js';
import productionRoutes from './routes/production.routes.js';
import analyticsRoutes  from './routes/analytics.routes.js';
import kpiRoutes        from './routes/kpi.routes.js';
import syncRoutes       from './routes/sync.routes.js';
import scriptsRoutes    from './routes/scripts.routes.js';
import { startScheduler } from './jobs/script-runner.js';

const app = express();

// ─── Security & Parsing ───────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: env.corsOrigin, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Logging ─────────────────────────────────────────────────
app.use(morgan('combined'));
app.use(requestLogger);

// ─── Health check ─────────────────────────────────────────────
app.get('/health', (_, res) => res.json({ status: 'ok', env: env.nodeEnv }));

// ─── Routes ───────────────────────────────────────────────────
app.use('/api/auth',       authRoutes);
app.use('/api/crm',        crmRoutes);
app.use('/api/production', productionRoutes);
app.use('/api/analytics',  analyticsRoutes);
app.use('/api/kpi',        kpiRoutes);
app.use('/api/sync',       syncRoutes);
app.use('/api/scripts',    scriptsRoutes);

// ─── 404 ──────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: 'Route not found' }));

// ─── Error handler ────────────────────────────────────────────
app.use(errorHandler);

// ─── Start ────────────────────────────────────────────────────
app.listen(env.port, async () => {
  console.log(`[Server] Running on port ${env.port} (${env.nodeEnv})`);
  await testConnections();
  startScheduler();
});

export default app;
