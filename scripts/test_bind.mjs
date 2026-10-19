import http from 'node:http';

const port = Number(process.env.PORT) || 8100;
const host = process.env.HOST || '::';

console.log('Testing binding to', host, port);

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Alwaysdata Node test OK!');
});

server.listen(port, host, () => {
  console.log(`Server successfully listening on http://${host}:${port}`);
  setTimeout(() => {
    console.log('Test completed successfully, shutting down.');
    server.close();
  }, 3000);
});
