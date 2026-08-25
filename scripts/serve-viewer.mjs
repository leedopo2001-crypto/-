// web/ 폴더를 로컬에서 띄운다. Vercel 에 배포하지 않고도 지도 뷰어를 확인할 수 있다.
//
//   npm run viewer
//
// vercel.json 의 rewrite 규칙(/t/:code -> /index.html)을 그대로 재현하므로,
// 공유 링크와 같은 경로로 접속했을 때의 동작까지 확인된다.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'web');
const PORT = Number(process.env.PORT) || 4173;

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

http
  .createServer((req, res) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch {
      res.writeHead(400).end('bad request');
      return;
    }

    if (/^\/t\/[^/]+$/.test(pathname) || pathname === '/') pathname = '/index.html';

    const file = path.join(ROOT, pathname);
    // 디렉터리 밖으로 나가는 경로 차단
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('not found');
      return;
    }

    res.writeHead(200, {
      'Content-Type': CONTENT_TYPES[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    fs.createReadStream(file).pipe(res);
  })
  .listen(PORT, () => {
    console.log(`\n  지도 뷰어가 실행되었습니다.\n`);
    console.log(`  데모 경로 :  http://localhost:${PORT}/?demo=1`);
    console.log(`  실제 세션 :  http://localhost:${PORT}/t/<코드>\n`);
    console.log(`  (실제 세션을 보려면 web/config.js 에 Supabase 키가 있어야 합니다)\n`);
  });
