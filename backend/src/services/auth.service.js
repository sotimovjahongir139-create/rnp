import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../config/db.js';
import { loadEnv } from '../config/env.js';
const env = loadEnv();

export async function authenticate(username, password) {
  const rows = await query('SELECT id, username, password_hash, role, is_active FROM users WHERE username=$1', [username]);
  const u = rows[0];
  if (!u || !u.is_active) return null;
  const ok = await bcrypt.compare(password, u.password_hash);
  if (!ok) return null;
  const token = jwt.sign({ sub: u.id, username: u.username, role: u.role }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
  return { token, user: { username: u.username, role: u.role } };
}
