const url = require('url');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const https = require('https');
const { createLogger } = require('../../utils/logger');
const logger = createLogger('DocApier');
const config = require('./config');
const apiStorage = require('./storage');
const blueprints = require('./blueprints');

const processes = {};
const processLogs = {};

function parseInfo(content) {
  const info = {};
  content.split('\n').forEach(line => {
    const [k, ...v] = line.split(':');
    if (k && v.length) info[k.trim()] = v.join(':').trim();
  });
  return info;
}

function getPlugs() {
  const plugsDir = path.join(__dirname, '..', '..', 'Plugs');
  try {
    return fs.readdirSync(plugsDir).filter(f => {
      const plugPath = path.join(plugsDir, f);
      return fs.statSync(plugPath).isDirectory();
    }).map(name => {
      const infoPath = path.join(plugsDir, name, 'info.plug');
      const info = fs.existsSync(infoPath) ? parseInfo(fs.readFileSync(infoPath, 'utf8')) : {};
      return {
        name,
        info,
        path: path.join(plugsDir, name),
        running: !!processes[name],
        pid: processes[name]?.pid || null
      };
    });
  } catch (e) {
    return [];
  }
}

function startProcess(name) {
  if (processes[name]) return { code: 400, message: '进程已在运行' };
  
  const plugPath = path.join(__dirname, '..', '..', 'Plugs', name, 'index.js');
  if (!fs.existsSync(plugPath)) return { code: 404, message: '入口文件不存在' };

  const child = spawn('node', [plugPath], {
    cwd: path.dirname(plugPath),
    env: { ...process.env, MANAGER_PORT: 726 }
  });

  processLogs[name] = [];
  
  child.stdout.on('data', (data) => {
    processLogs[name].push({ type: 'stdout', time: Date.now(), msg: data.toString() });
    if (processLogs[name].length > 100) processLogs[name].shift();
  });
  
  child.stderr.on('data', (data) => {
    processLogs[name].push({ type: 'stderr', time: Date.now(), msg: data.toString() });
    if (processLogs[name].length > 100) processLogs[name].shift();
  });
  
  child.on('exit', (code) => {
    processLogs[name].push({ type: 'sys', time: Date.now(), msg: `进程退出，代码: ${code}` });
    delete processes[name];
  });

  processes[name] = child;
  return { code: 200, message: '启动成功', pid: child.pid };
}

function stopProcess(name) {
  if (!processes[name]) return { code: 400, message: '进程未运行' };
  processes[name].kill();
  delete processes[name];
  return { code: 200, message: '已停止' };
}

module.exports.initAutoStart = function() {
  const plugs = getPlugs();
  plugs.forEach(p => {
    if (p.info?.auto === 'true' || p.info?.autostart === 'true') {
      logger.info(`自启动: ${p.name}...`);
      startProcess(p.name);
    }
  });
};

function getRouterConfig() {
  try {
    const routerPath = path.join(__dirname, '..', '..', 'Router', 'router.router');
    const content = fs.readFileSync(routerPath, 'utf8');
    const portMatch = content.match(/port:\s*(\d+)/);
    const port = portMatch ? portMatch[1] : '8081';

    const routes = [];
    const lineRegex = /^From\s+(\S+)\s+TO\s+(\S+)$/i;
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const match = trimmed.match(lineRegex);
      if (match) {
        routes.push({ target: match[1], path: match[2] });
      }
    }

    return { port, routes };
  } catch (e) {
    return { port: '8081', routes: [] };
  }
}

function getRouterPort() {
  return getRouterConfig().port;
}

function addRoute(routePath, target) {
  try {
    const routerFilePath = path.join(__dirname, '..', '..', 'Router', 'router.router');
    let content = fs.readFileSync(routerFilePath, 'utf8');
    const lineRegex = /^From\s+(\S+)\s+TO\s+(\S+)$/i;
    const exists = content.split('\n').some(line => {
      const match = line.trim().match(lineRegex);
      return match && match[2] === routePath;
    });
    if (exists) return { code: 200, message: '路由已存在，网关自动重载中' };
    const newLine = `\nFrom ${target} TO ${routePath}`;
    if (!content.endsWith('\n')) content += '\n';
    content += newLine;
    fs.writeFileSync(routerFilePath, content);
    return { code: 200, message: '路由添加成功，网关自动重载中' };
  } catch (e) {
    return { code: 500, message: '写入失败' };
  }
}

function removeRoute(routePath) {
  try {
    const routerFilePath = path.join(__dirname, '..', '..', 'Router', 'router.router');
    let lines = fs.readFileSync(routerFilePath, 'utf8').split('\n');
    const lineRegex = /^From\s+(\S+)\s+TO\s+(\S+)$/i;
    lines = lines.filter(line => {
      const match = line.trim().match(lineRegex);
      if (!match) return true;
      return match[2] !== routePath;
    });
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
      lines.pop();
    }
    let content = lines.join('\n');
    if (content.length > 0 && !content.endsWith('\n')) content += '\n';
    fs.writeFileSync(routerFilePath, content);
    return { code: 200, message: '路由已移除，网关自动重载中' };
  } catch (e) {
    return { code: 500, message: '写入失败' };
  }
}

function proxyTestRequest(testUrl, method, headers, body, res) {
  const parsed = new URL(testUrl);
  const options = {
    hostname: parsed.hostname,
    port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
    path: parsed.pathname + parsed.search,
    method: method.toUpperCase(),
    headers: typeof headers === 'object' ? headers : {}
  };

  const protocol = parsed.protocol === 'https:' ? https : http;
  const req = protocol.request(options, (response) => {
    let data = '';
    response.on('data', (chunk) => {
      data += chunk;
    });
    response.on('end', () => {
      const result = {
        code: 200,
        status: response.statusCode,
        statusText: response.statusMessage,
        headers: response.headers,
        body: data,
        isJson: false
      };
      try {
        result.body = JSON.parse(data);
        result.isJson = true;
      } catch (e) {}
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    });
  });

  req.on('error', (e) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      code: 500,
      error: e.message
    }));
  });

  if (body && method.toUpperCase() !== 'GET') {
    req.write(typeof body === 'string' ? body : JSON.stringify(body));
  }
  req.end();
}

function authenticate(pwd) {
  return pwd === config.Passwd;
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

async function handleRequest(req, res) {
  if (!config.Elua) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ code: 503, message: 'Service is disabled' }));
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const query = parsedUrl.query;
  const method = req.method;

  if (pathname === '/' || pathname === '' || pathname === '/index.html') {
    try {
      const htmlPath = path.join(__dirname, 'Web', 'index.html');
      let html = fs.readFileSync(htmlPath, 'utf8');
      const routerPort = getRouterPort();
      html = html.replace('</head>', `<script>window.ROUTER_PORT='${routerPort}'</script></head>`);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    } catch (error) {
      logger.error('Failed to load web interface:', { error: error.message });
    }
  }

  if (pathname.includes('favicon')) {
    res.writeHead(204);
    res.end();
    return;
  }

  const body = await parseBody(req);
  const pwd = query.pwd || body.pwd;

  if (!authenticate(pwd)) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ code: 401, message: 'Unauthorized' }));
    return;
  }

  switch (pathname) {
    case '/S':
      const keyword = query.s || body.s;
      if (!keyword) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: 400, message: 'Search keyword is required' }));
        return;
      }
      const results = apiStorage.search(keyword);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ code: 200, message: 'Success', data: results }));
      break;

    case '/U':
      if (method !== 'POST') {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: 405, message: 'Method not allowed' }));
        return;
      }
      
      const apiData = {
        url: body.url,
        home: body.home,
        json: body.json
      };
      
      if (!apiData.url) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: 400, message: 'API url is required' }));
        return;
      }
      
      apiStorage.save(apiData);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ code: 200, message: 'API saved successfully' }));
      break;

    case '/Blueprint':
      const blueprintType = query.type || body.type || 'restful';
      const blueprint = blueprints[blueprintType] || blueprints.restful;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ code: 200, message: 'Success', data: blueprint }));
      break;

    case '/D':
      if (method !== 'POST') {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: 405, message: 'Method not allowed' }));
        return;
      }
      
      const deleteUrl = body.url;
      if (!deleteUrl) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: 400, message: 'API url is required' }));
        return;
      }
      
      apiStorage.delete(deleteUrl);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ code: 200, message: 'API deleted successfully' }));
      break;

    case '/List':
      const allApis = apiStorage.getAll();
      const routerConfig = getRouterConfig();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ code: 200, message: 'Success', data: allApis, routerConfig }));
      break;
    case '/AddRoute':
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(addRoute(body.path, body.target)));
      break;
    case '/RemoveRoute':
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(removeRoute(body.path)));
      break;
    case '/Plugs':
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ code: 200, data: getPlugs() }));
      break;
    case '/PlugStart':
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(startProcess(body.name)));
      break;
    case '/PlugStop':
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(stopProcess(body.name)));
      break;
    case '/PlugRestart':
      stopProcess(body.name);
      setTimeout(() => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(startProcess(body.name)));
      }, 500);
      break;
    case '/PlugLogs':
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ code: 200, data: processLogs[body.name] || [] }));
      break;

    case '/ApiTest':
      if (method !== 'POST') {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: 405, message: 'Method not allowed' }));
        return;
      }
      
      const { testUrl, testMethod, testHeaders, testBody } = body;
      if (!testUrl) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: 400, message: 'URL is required' }));
        return;
      }
      
      proxyTestRequest(testUrl, testMethod || 'GET', testHeaders, testBody, res);
      return;

    default:
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ code: 404, message: 'Route not found' }));
      break;
  }
}

handleRequest.initAutoStart = module.exports.initAutoStart;
module.exports = handleRequest;

function proxyTestRequest(testUrl, method, headers, body, res) {
  const parsed = new URL(testUrl);
  const options = {
    hostname: parsed.hostname,
    port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
    path: parsed.pathname + parsed.search,
    method: method.toUpperCase(),
    headers: typeof headers === 'object' ? headers : {}
  };

  const protocol = parsed.protocol === 'https:' ? https : http;
  const req = protocol.request(options, (response) => {
    let data = '';
    response.on('data', (chunk) => {
      data += chunk;
    });
    response.on('end', () => {
      const result = {
        code: 200,
        status: response.statusCode,
        statusText: response.statusMessage,
        headers: response.headers,
        body: data,
        isJson: false
      };
      try {
        result.body = JSON.parse(data);
        result.isJson = true;
      } catch (e) {}
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    });
  });

  req.on('error', (e) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      code: 500,
      error: e.message
    }));
  });

  if (body && method.toUpperCase() !== 'GET') {
    req.write(typeof body === 'string' ? body : JSON.stringify(body));
  }
  req.end();
}