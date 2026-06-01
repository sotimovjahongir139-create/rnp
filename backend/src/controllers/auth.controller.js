import { authenticate } from '../services/auth.service.js';

export async function login(req, res, next) {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'username and password required' });
    const result = await authenticate(username, password);
    if (!result) return res.status(401).json({ error: 'Invalid credentials' });
    res.json(result);
  } catch (e) { next(e); }
}
