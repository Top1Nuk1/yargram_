import { spawn } from 'node:child_process';

const p = spawn('node', ['server.js'], {
  cwd: '/home/top1nuk1/yargram',
  env: {
    ...process.env,
    PORT: '8100',
    HOST: '::',
  },
});

p.stdout.on('data', (d) => console.log('STDOUT:', d.toString()));
p.stderr.on('data', (d) => console.log('STDERR:', d.toString()));

setTimeout(() => {
  console.log('Test timeout reached (4s), terminating server process.');
  p.kill('SIGINT');
  setTimeout(() => process.exit(0), 1000);
}, 4000);
