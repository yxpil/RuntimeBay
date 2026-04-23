const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const url = require('url');

const processes = {};
const processLogs = {};

function loadConfig() {
  const readmePath = path.join(__dirname, 'Readme.txt');
  try {
    const content = fs.readFileSync(readmePath, 'utf8');
    const config = { Elua: true, Passwd: 'Memory726' };
    content.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed.startsWith('Elua = ')) {
        const val = trimmed.split('=')[1].trim();
        config.Elua = val === 'True';
      } else if (trimmed.startsWith('Passwd = ')) {
        config.Passwd = trimmed.split('=')[1].trim();
      }
    });
    return config;
  } catch (e) {
    return { Elua: true, Passwd: 'Memory726' };
  }
}

const config = loadConfig();

function authenticate(pwd) {
  return pwd === config.Passwd;
}

function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => resolve(body ? JSON.parse(body) : {}));
  });
}

function parseInfo(content) {
  const info = {};
  content.split('\n').forEach(line => {
    const [k, ...v] = line.split(':');
    if (k && v.length) info[k.trim()] = v.join(':').trim();
  });
  return info;
}

function getPlugs() {
  const plugsDir = path.join(__dirname, '..', 'Plugs');
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
  
  const plugPath = path.join(__dirname, '..', 'Plugs', name, 'index.js');
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

async function handleRequest(req, res) {
  if (!config.Elua) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ code: 503, message: 'Service disabled' }));
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const query = parsedUrl.query;

  if (pathname.includes('favicon')) {
    res.writeHead(204);
    res.end();
    return;
  }

  if (pathname === '/' || pathname === '') {
    const htmlPath = path.join(__dirname, 'Web', 'index.html');
    if (fs.existsSync(htmlPath)) {
      const html = fs.readFileSync(htmlPath, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }
  }

  const body = await parseBody(req);
  const pwd = query.pwd || body.pwd;

  if (!authenticate(pwd)) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ code: 401, message: 'Unauthorized' }));
    return;
  }

  const header = { 'Content-Type': 'application/json' };

  switch (pathname) {
    case '/list':
      res.writeHead(200, header);
      res.end(JSON.stringify({ code: 200, data: getPlugs() }));
      break;
    case '/start':
      res.writeHead(200, header);
      res.end(JSON.stringify(startProcess(body.name)));
      break;
    case '/stop':
      res.writeHead(200, header);
      res.end(JSON.stringify(stopProcess(body.name)));
      break;
    case '/restart':
      stopProcess(body.name);
      setTimeout(() => {
        res.writeHead(200, header);
        res.end(JSON.stringify(startProcess(body.name)));
      }, 500);
      break;
    case '/logs':
      res.writeHead(200, header);
      res.end(JSON.stringify({ code: 200, data: processLogs[body.name] || [] }));
      break;
    default:
      res.writeHead(404, header);
      res.end(JSON.stringify({ code: 404, message: 'Not Found' }));
  }
}

const PORT = 726;
const server = http.createServer(handleRequest).listen(PORT, () => {
  console.log(`Mannager 运行在端口 ${PORT}`);
  console.log(`Web: http://localhost:${PORT}/`);
  console.log(`插件目录: Plugs/`);
  
  const plugs = getPlugs();
  console.log(`已发现插件: ${plugs.map(p => p.info?.name || p.name).join(', ')}`);
  
  plugs.forEach(p => {
    if (p.info?.autostart === 'true') {
      console.log(`自启动: ${p.name}...`);
      startProcess(p.name);
    }
  });
});
