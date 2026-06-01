import 'dotenv/config';

const REQUIRED = ['DATABASE_URL', 'JWT_SECRET'];

export function loadEnv() {
  const missing = REQUIRED.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`FATAL: missing env vars: ${missing.join(', ')}`);
    process.exit(1);
  }
  return {
    port: Number(process.env.PORT || 3008),
    nodeEnv: process.env.NODE_ENV || 'production',
    databaseUrl: process.env.DATABASE_URL,
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
    corsOrigin: process.env.CORS_ORIGIN || '*',
  };
}
