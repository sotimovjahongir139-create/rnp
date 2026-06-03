import bcrypt    from 'bcryptjs';
import jwt        from 'jsonwebtoken';
import { analyticsPool } from '../config/db.js';
import { env }   from '../config/env.js';

export async function authenticate(username, password) {
  const [rows] = await analyticsPool.query(
    'SELECT id, username, password_hash, role, is_active FROM users WHERE username = ?',
    [username]
  );
  const u = rows[0];
  if (!u || !u.is_active) return null;
  const ok = await bcrypt.compare(password, u.password_hash);
  if (!ok) return null;
  const token = jwt.sign(
    { id: u.id, username: u.username, role: u.role },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn }
  );
  return { token, user: { username: u.username, role: u.role } };
}
