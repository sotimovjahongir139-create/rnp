import { logger } from './logger.js';

export function errorHandler(err, req, res, _next) {
  logger.error(`${req.method} ${req.originalUrl} → ${err.message}`);

  const status  = err.status || err.statusCode || 500;
  const message = err.expose ? err.message : 'Internal server error';

  res.status(status).json({ error: message });
}

export class AppError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.status = status;
    this.expose = status < 500;
  }
}
