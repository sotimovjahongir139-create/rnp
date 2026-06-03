import 'dotenv/config';

const REQUIRED = ['ANALYTICS_DB_HOST', 'ANALYTICS_DB_USER', 'ANALYTICS_DB_PASS', 'ANALYTICS_DB_NAME', 'JWT_SECRET'];

const missing = REQUIRED.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`[Env] Missing required vars: ${missing.join(', ')}`);
  process.exit(1);
}

export const env = {
  port:            Number(process.env.PORT || 5000),
  nodeEnv:         process.env.NODE_ENV || 'development',
  jwtSecret:       process.env.JWT_SECRET,
  jwtExpiresIn:    process.env.JWT_EXPIRES_IN || '8h',
  corsOrigin:      process.env.CORS_ORIGIN || 'http://localhost:3000',

  analyticsDbHost: process.env.ANALYTICS_DB_HOST,
  analyticsDbPort: Number(process.env.ANALYTICS_DB_PORT || 3306),
  analyticsDbUser: process.env.ANALYTICS_DB_USER,
  analyticsDbPass: process.env.ANALYTICS_DB_PASS,
  analyticsDbName: process.env.ANALYTICS_DB_NAME,

  prodDbHost:      process.env.PROD_DB_HOST || null,
  prodDbPort:      Number(process.env.PROD_DB_PORT || 3306),
  prodDbUser:      process.env.PROD_DB_USER || null,
  prodDbPass:      process.env.PROD_DB_PASS || null,
  prodDbName:      process.env.PROD_DB_NAME || null,
};
