import jwt from 'jsonwebtoken';
import { loadEnv } from '../config/env.js';
const env = loadEnv();

export function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No token' });
  try { req.user = jwt.verify(token, env.jwtSecret); next(); }
  catch { return res.status(401).json({ error: 'Invalid token' }); }
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}
