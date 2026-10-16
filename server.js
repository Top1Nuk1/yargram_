// Start YarGram server on Alwaysdata
process.env.NODE_ENV = 'production';
if (!process.env.HOST) {
  process.env.HOST = '0.0.0.0';
}
if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'yargram-development-secret-change-me') {
  process.env.JWT_SECRET = 'yargram_alwaysdata_jwt_secret_secure_key_12345';
}
if (!process.env.DB_ENCRYPTION_KEY || process.env.DB_ENCRYPTION_KEY === 'yargram-development-encryption-key-change-me') {
  process.env.DB_ENCRYPTION_KEY = 'yargram_alwaysdata_db_key_secure_67890';
}

import('./apps/server/out/index.js');
