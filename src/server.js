import connect from 'connect';
import serveStatic from 'serve-static';
import { WebSocketServer } from 'ws';
import { parse } from 'es-module-lexer';
import { readFile } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// 创建 HTTP 服务器
const app = connect();

// 处理 ES 模块导入
app.use(async (req, res, next) => {
  const url = req.url;
  if (url.endsWith('.js')) {
    const filePath = resolve(ROOT, url.slice(1));
    try {
      const content = await readFile(filePath, 'utf-8');
      const [imports] = await parse(content);
      
      // 重写导入路径
      let transformedContent = content;
      for (const imp of imports) {
        const { s: start, e: end, n: name } = imp;
        if (name && !name.startsWith('.') && !name.startsWith('/')) {
          const bare = name;
          transformedContent = 
            transformedContent.slice(0, start) +
            `/@modules/${bare}` +
            transformedContent.slice(end);
        }
      }
      
      res.setHeader('Content-Type', 'application/javascript');
      return res.end(transformedContent);
    } catch (e) {
      console.error(e);
      return next();
    }
  }
  next();
});

// 处理 node_modules 中的模块
app.use('/@modules/', async (req, res) => {
  const moduleName = req.url.slice(1);
  const pkgPath = resolve(ROOT, 'node_modules', moduleName);
  const content = await readFile(pkgPath, 'utf-8');
  res.setHeader('Content-Type', 'application/javascript');
  res.end(content);
});

// 静态文件服务
app.use(serveStatic(ROOT));

// 启动服务器
const server = app.listen(3000, () => {
  console.log('Server running at http://localhost:3000');
});

// 设置 WebSocket 服务器用于 HMR
const wss = new WebSocketServer({ server });

wss.on('connection', (socket) => {
  socket.send(JSON.stringify({ type: 'connected' }));
});