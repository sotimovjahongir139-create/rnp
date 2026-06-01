import fs   from 'fs';
import path from 'path';

const logDir  = path.resolve('logs');
const logFile = path.join(logDir, 'app.log');

if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

function timestamp() { return new Date().toISOString(); }

function write(level, msg) {
  const line = `[${timestamp()}] [${level}] ${msg}\n`;
  process.stdout.write(line);
  fs.appendFile(logFile, line, () => {});
}

export const logger = {
  info:  (msg) => write('INFO',  msg),
  warn:  (msg) => write('WARN',  msg),
  error: (msg) => write('ERROR', msg),
};

export function requestLogger(req, _res, next) {
  logger.info(`${req.method} ${req.originalUrl}`);
  next();
}
