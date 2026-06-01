import 'dotenv/config';

export const env = {
  port:       parseInt(process.env.PORT || '5000', 10),
  nodeEnv:    process.env.NODE_ENV || 'development',
  jwtSecret:  process.env.JWT_SECRET || 'dev_secret_change_in_production',
  jwtExpires: process.env.JWT_EXPIRES_IN || '8h',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',

  analyticsDb: {
    host:     process.env.ANALYTICS_DB_HOST || 'localhost',
    port:     parseInt(process.env.ANALYTICS_DB_PORT || '3306', 10),
    user:     process.env.ANALYTICS_DB_USER || 'root',
    password: process.env.ANALYTICS_DB_PASS || '',
    database: process.env.ANALYTICS_DB_NAME || 'rnp_analytics',
  },

  prodDb: {
    host:     process.env.PROD_DB_HOST,
    port:     parseInt(process.env.PROD_DB_PORT || '3306', 10),
    user:     process.env.PROD_DB_USER,
    password: process.env.PROD_DB_PASS,
    database: process.env.PROD_DB_NAME,
  },
};
