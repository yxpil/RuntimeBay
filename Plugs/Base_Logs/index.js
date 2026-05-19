const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const LOG_DIR = path.join(__dirname, 'logs');
if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}

const logs = {};
const MAX_LOG_ENTRIES = 1000;

function generateToken() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

const tokens = new Set();

function parseBody(req) {
    return new Promise((resolve) => {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch {
                resolve({});
            }
        });
    });
}

function writeLog(moduleName, data) {
    const logEntry = {
        timestamp: Date.now(),
        data
    };
    
    if (!logs[moduleName]) {
        logs[moduleName] = [];
    }
    
    logs[moduleName].push(logEntry);
    
    if (logs[moduleName].length > MAX_LOG_ENTRIES) {
        logs[moduleName] = logs[moduleName].slice(-MAX_LOG_ENTRIES);
    }
    
    const logFilePath = path.join(LOG_DIR, `${moduleName}.log`);
    const logLine = `${new Date().toISOString()} - ${JSON.stringify(data)}\n`;
    fs.appendFileSync(logFilePath, logLine);
}

async function handleRequest(req, res) {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }
    
    const body = await parseBody(req);
    const token = parsedUrl.query.token || body.token;
    
    switch (pathname) {
        case '/generate-token': {
            const newToken = generateToken();
            tokens.add(newToken);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ code: 200, token: newToken }));
            break;
        }
        
        case '/validate-token': {
            const isValid = tokens.has(token);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ code: 200, valid: isValid }));
            break;
        }
        
        case '/invalidate-token': {
            tokens.delete(token);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ code: 200, message: 'Token invalidated' }));
            break;
        }
        
        case '/log': {
            if (!tokens.has(token)) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ code: 401, message: 'Unauthorized' }));
                return;
            }
            
            const { module: moduleName, data } = body;
            if (!moduleName || !data) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ code: 400, message: 'Missing module or data' }));
                return;
            }
            
            writeLog(moduleName, data);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ code: 200, message: 'Log written' }));
            break;
        }
        
        case '/logs': {
            if (!tokens.has(token)) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ code: 401, message: 'Unauthorized' }));
                return;
            }
            
            const { module: moduleName } = body;
            if (!moduleName) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ code: 200, data: Object.keys(logs) }));
            } else {
                const moduleLogs = logs[moduleName] || [];
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ code: 200, data: moduleLogs }));
            }
            break;
        }
        
        case '/clear': {
            if (!tokens.has(token)) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ code: 401, message: 'Unauthorized' }));
                return;
            }
            
            const { module: moduleName } = body;
            if (moduleName) {
                logs[moduleName] = [];
            } else {
                Object.keys(logs).forEach(key => {
                    logs[key] = [];
                });
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ code: 200, message: 'Logs cleared' }));
            break;
        }
        
        case '/stats': {
            const stats = {};
            Object.keys(logs).forEach(module => {
                stats[module] = logs[module].length;
            });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ code: 200, data: stats }));
            break;
        }
        
        default: {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ code: 404, message: 'Not Found' }));
        }
    }
}

const PORT = process.env.MANAGER_PORT ? parseInt(process.env.MANAGER_PORT) + 1 : 727;
const server = http.createServer(handleRequest).listen(PORT, () => {
    console.log(`Base_Logs 日志服务器运行在端口 ${PORT}`);
    console.log(`API: http://localhost:${PORT}/`);
    console.log(`可用接口: /generate-token, /validate-token, /log, /logs, /clear, /stats`);
});