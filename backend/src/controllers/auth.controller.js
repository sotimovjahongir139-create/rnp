import jwt      from 'jsonwebtoken';
import bcrypt   from 'bcryptjs';
import { env }  from '../config/env.js';
import { AppError } from '../middleware/error.middleware.js';
import { analyticsPool } from '../config/db.js';

export async function login(req, res, next) {
  try {
    const { username, password } = req.body;
    if (!username || !password) throw new AppError('Username and password required', 400);

    const [rows] = await analyticsPool.query(
      'SELECT id, username, password_hash, role FROM users WHERE username = ? AND is_active = 1 LIMIT 1',
      [username]
    );
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash)))
      throw new AppError('Invalid credentials', 401);

    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, env.jwtSecret, { expiresIn: env.jwtExpires });
    res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
  } catch (e) { next(e); }
}

export async function me(req, res) {
  res.json({ user: req.user });
}
