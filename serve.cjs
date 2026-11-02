// 《碎瓷重圆》线上静态服务：零依赖，服务 dist 构建产物，支持 SPA 回退。
// 供 App Publishing 沙箱使用：监听 $PORT，绑定 0.0.0.0。
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, 'dist');
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
};

const server = http.createServer((req, res) => {
  try {
    let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    if (urlPath.endsWith('/')) urlPath += 'index.html';
    let file = path.normalize(path.join(ROOT, urlPath));
    if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('Forbidden'); }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      // 带扩展名的静态文件（js/css/glb…）不存在就明确 404，绝不能拿 HTML 冒充。
      if (path.extname(urlPath)) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not Found'); }
      // 无扩展名的路径回退到同名 html 入口（如 /journal/ → journal/index.html），再不行回 index.html
      const guess = path.join(ROOT, urlPath.replace(/\/[^/]*$/, '') + '.html');
      if (fs.existsSync(guess)) file = guess;
      else file = path.join(ROOT, 'index.html');
    }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=86400' });
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    res.writeHead(500); res.end('Internal Error');
  }
});

server.listen(PORT, HOST, () => console.log(`porcelain-reunion serving dist on http://${HOST}:${PORT}`));
