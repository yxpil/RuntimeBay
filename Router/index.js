const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

function loadConfig() {
  const config = { port: 8081, errorPages: {}, routes: [] };
  const configPath = path.join(__dirname, 'router.router');
  const content = fs.readFileSync(configPath, 'utf8');
  
  const lines = content.split('\n');
  lines.forEach(line => {
    const trimmed = line.trim();
    if (!trimmed) return;
    
    if (trimmed.startsWith('port:')) {
      config.port = parseInt(trimmed.split(':')[1]);
    } else if (trimmed.includes(':') && !trimmed.startsWith('From')) {
      const [k, v] = trimmed.split(':');
      if (k && v) config.errorPages[k.trim()] = v.trim();
    } else if (trimmed.startsWith('From')) {
      const match = trimmed.match(/From\s+([^\s]+)\s+TO\s+(.+)/i);
      if (match) {
        config.routes.push({
          target: match[1],
          path: match[2].trim()
        });
      }
    }
  });
  
  return config;
}

function proxyRequest(req, res, targetHost, targetPort, stripPath) {
  let newUrl = req.url;
  if (stripPath && stripPath !== '/' && newUrl.startsWith(stripPath)) {
    newUrl = newUrl.slice(stripPath.length) || '/';
  }
  
  const options = {
    hostname: targetHost,
    port: targetPort,
    path: newUrl,
    method: req.method,
    headers: {
      ...req.headers,
      host: `${targetHost}:${targetPort}`,
      'x-forwarded-for': req.socket.remoteAddress,
      'x-forwarded-proto': 'http',
      'x-forwarded-host': req.headers.host,
      connection: 'close'
    }
  };

  const proxyReq = http.request(options, (proxyRes) => {
    if (CORS_ORIGIN) {
      proxyRes.headers['Access-Control-Allow-Origin'] = CORS_ORIGIN;
      proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
      proxyRes.headers['Access-Control-Allow-Headers'] = '*';
    }
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    res.writeHead(500, { 'Content-Type': 'text/html' });
    res.end(errorPagesCache['500'] || '<center style="margin-top:100px"><h1>500 Service Unavailable</h1><p>APIBay Router</p></center>');
  });

  req.pipe(proxyReq);
}

let config = loadConfig();
console.log('Router 配置加载完成');
config.routes.forEach(r => {
  console.log(`  路由: ${r.path} -> ${r.target}`);
});

const errorPagesCache = {};
function loadErrorPages() {
  ['404', '500'].forEach(code => {
    const pagePath = path.join(__dirname, config.errorPages['ErrorPages'] || 'ErrorPages', config.errorPages[code] || `${code}.html`);
    if (fs.existsSync(pagePath)) {
      errorPagesCache[code] = fs.readFileSync(pagePath);
      console.log(`  错误页: ${code}.html -> 已缓存到内存`);
    }
  });
}
loadErrorPages();

const IS_DEV = process.env.NODE_ENV === 'development';
const CORS_ORIGIN = IS_DEV ? '*' : null;

const server = http.createServer((req, res) => {
  if (CORS_ORIGIN) {
    res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
  }
  
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  
  const pathname = url.parse(req.url).pathname;
  
  let matched = null;
  let maxLen = 0;
  for (const r of config.routes) {
    if (pathname.startsWith(r.path) && r.path.length > maxLen) {
      matched = r;
      maxLen = r.path.length;
    }
  }
  
  if (matched) {
    const [host, port] = matched.target.split(':');
    proxyRequest(req, res, host, port || 80, matched.path);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/html' });
    res.end(errorPagesCache['404'] || '<center style="margin-top:100px"><h1>404 Not Found</h1><p>APIBay Router</p></center>');
  }
});

server.listen(config.port, () => {
  console.log(`\nRouter 运行在端口 ${config.port} [${IS_DEV ? 'DEV 开发模式' : 'PROD 生产模式'}]`);
  console.log(`网关入口: http://localhost:${config.port}/`);
  console.log(`CORS 跨域: ${CORS_ORIGIN ? '✅ 已开启 (*)' : '❌ 已关闭'}`);
  console.log(`已加载 ${config.routes.length} 条路由规则`);
  console.log(`热重载: ✅ 配置文件变更自动生效`);
});

const routerFile = path.join(__dirname, 'router.router');
fs.watchFile(routerFile, () => {
  Object.keys(errorPagesCache).forEach(k => delete errorPagesCache[k]);
  config = loadConfig();
  loadErrorPages();
  console.log(`\x1b[35m[Router] 配置文件已变更，路由表热重载完成 (${config.routes.length} 条规则)\x1b[0m`);
});
