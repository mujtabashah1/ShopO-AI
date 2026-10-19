function allowedOrigins(env = process.env) {
  const configured = (env.CLIENT_URL || '').split(',').map(value => value.trim()).filter(Boolean);
  return new Set(env.NODE_ENV === 'production' ? configured : [
    ...configured, 'http://localhost:3000', 'http://127.0.0.1:3000'
  ]);
}

function validateEnvironment(env = process.env) {
  if (!env.MONGO_URI) throw new Error('MONGO_URI is required');
  if (!env.JWT_SECRET || env.JWT_SECRET.length < 32 || /replace-with|changeme/i.test(env.JWT_SECRET)) {
    throw new Error('JWT_SECRET must be a unique random secret of at least 32 characters');
  }
  if (env.NODE_ENV === 'production' && !env.CLIENT_URL) throw new Error('CLIENT_URL is required in production');
  for (const origin of allowedOrigins(env)) {
    const url = new URL(origin);
    if (url.origin !== origin || !['http:', 'https:'].includes(url.protocol)) {
      throw new Error('CLIENT_URL must contain exact HTTP(S) origins, separated by commas');
    }
  }
}

module.exports = { allowedOrigins, validateEnvironment };
