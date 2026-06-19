const http = require('http');
const fs = require('fs');
const path = require('path');

const host = process.env.DOCS_HOST || '127.0.0.1';
const port = Number(process.env.DOCS_PORT || 4173);
const buildDir = path.join(__dirname, 'build');

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

function resolveRequest(requestUrl) {
  const pathname = decodeURIComponent(new URL(requestUrl, 'http://localhost').pathname);
  const relativePath = pathname.replace(/^\/+/, '');
  const candidates = [
    relativePath,
    path.join(relativePath, 'index.html'),
    relativePath + '.html'
  ];

  for (const candidate of candidates) {
    const absolutePath = path.resolve(buildDir, candidate);
    if (!absolutePath.startsWith(buildDir + path.sep) && absolutePath !== buildDir) continue;
    if (fs.existsSync(absolutePath) && fs.statSync(absolutePath).isFile()) return absolutePath;
  }

  return null;
}

if (!fs.existsSync(path.join(buildDir, 'index.html'))) {
  console.error('Offline build не найден. Сначала выполните: npm run build');
  process.exit(1);
}

const server = http.createServer((req, res) => {
  const filePath = resolveRequest(req.url || '/');
  if (!filePath) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Страница не найдена');
    return;
  }

  const extension = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    'Content-Type': contentTypes[extension] || 'application/octet-stream',
    'Cache-Control': 'no-cache'
  });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(port, host, () => {
  console.log(`CASA Docs offline: http://${host}:${port}`);
  console.log('Остановить сервер: Ctrl+C');
});
