import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { loadEnv } from './config/env.js';
import healthRoutes from './routes/health.routes.js';
import authRoutes from './routes/auth.routes.js';
import qcRoutes from './routes/qc.routes.js';
import { errorHandler } from './middleware/error.middleware.js';

const env = loadEnv();
export const app = express();

app.use(helmet());
app.use(cors({ origin: env.corsOrigin }));
app.use(express.json());

app.use('/', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/qc', qcRoutes);
// route mounts added in later tasks:
// /production /crm /qc /kpi

app.use(errorHandler);

if (process.env.NODE_ENV !== 'test') {
  app.listen(env.port, () => console.log(`rnp-backend listening on :${env.port}`));
}
