import jwt from 'jsonwebtoken';

export const JWT_SECRET = process.env.JWT_SECRET || 'spotinize_super_secret_jwt_key_2026';

/**
 * Extracts Bearer token from an Authorization header value.
 */
export function extractBearerToken(authHeader) {
  if (!authHeader || typeof authHeader !== 'string') return null;
  if (!authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  return token || null;
}

/**
 * Verifies a JWT token and returns the decoded user payload { id, username }.
 */
export function verifyJwtToken(token) {
  if (!token || typeof token !== 'string') {
    throw new Error('Token tidak ditemukan');
  }
  const decoded = jwt.verify(token, JWT_SECRET);
  if (!decoded || !decoded.id) {
    throw new Error('Token tidak memiliki identitas user');
  }
  return decoded;
}

/**
 * Express middleware enforcing a valid JWT Bearer token.
 */
export function requireAuth(req, res, next) {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) {
    return res.status(401).json({ error: 'Autentikasi diperlukan. Silakan login terlebih dahulu.' });
  }

  try {
    const decoded = verifyJwtToken(token);
    req.user = { id: decoded.id, username: decoded.username };
    req.userId = decoded.id;
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Sesi login tidak valid atau kadaluarsa. Silakan login kembali.' });
  }
}

export default requireAuth;
