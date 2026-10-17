import fs from 'node:fs';

// Start YarGram server on Alwaysdata
process.env.NODE_ENV = 'production';
process.env.DATABASE_DRIVER = 'json';
delete process.env.DATABASE_URL;

if (!process.env.HOST) {
  process.env.HOST = '::';
}
process.env.JWT_SECRET = '07ea3041ed8e3e17eea1221f355f6358246b53421031900d28474731f67c6727408040f75f6782b2f9ea4c18ce1b78c5';
process.env.DB_ENCRYPTION_KEY = '654afeb30be5e9cc21c4a7f9f3196931377cc3de42f40814dcaaf2402508ca31';

process.env.EMAIL_CONFIRMATION = 'true';
process.env.MAIL_DRIVER = 'smtp';
process.env.MAIL_HOST = 'smtp.gmail.com';
process.env.MAIL_PORT = '587';
process.env.MAIL_SECURE = 'false';
process.env.MAIL_USER = 'yargram.support@gmail.com';
process.env.MAIL_PASS = 'yrbdesythvsehejz';
process.env.MAIL_FROM = 'yargram.support@gmail.com';
process.env.MAIL_USER_2 = 'yarikgram@gmail.com';
process.env.MAIL_PASS_2 = 'bsmqyxfwvnknocmd';
process.env.MAIL_FROM_2 = 'yarikgram@gmail.com';

process.env.TRUST_PROXY = 'true';
process.env.PUBLIC_ORIGIN = 'https://yargram.site';
process.env.CORS_ORIGINS = 'https://yargram.site,http://yargram.site,https://www.yargram.site,http://www.yargram.site,https://top1nuk1.alwaysdata.net,http://top1nuk1.alwaysdata.net';

// File-based restart trigger for easy management via SSH
const restartTrigger = '/home/top1nuk1/yargram/restart.txt';
setInterval(() => {
  if (fs.existsSync(restartTrigger)) {
    try { fs.unlinkSync(restartTrigger); } catch (_) {}
    console.log('Restart trigger received, exiting process to reload...');
    process.exit(0);
  }
}, 1000);

import('./apps/server/out/index.js');
