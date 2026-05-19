const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const STATIC_DIR = path.join(__dirname, 'static');
if (!fs.existsSync(STATIC_DIR)) {
    fs.mkdirSync(STATIC_DIR, { recursive: true });
}

const WATCHDOG_CONFIG = {
    enabled: false,
    interval: 30000,
    timeout: 10000
};

const mimeTypes = {
    '.html': 'text/html',
    '.htm': 'text/html',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.css': 'text/css',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain',
    '.pdf': 'application/pdf',
    '.zip': 'application/zip',
    '.rar': 'application/x-rar-compressed',
    '.7z': 'application/x-7z-compressed',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.ogg': 'audio/ogg',
    '.mp3': 'audio/mpeg'
};

function getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return mimeTypes[ext] || 'application/octet-stream';
}

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

function serveStaticFile(req, res, filePath) {
    fs.stat(filePath, (err, stats) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/html' });
            res.end('<h1>404 Not Found</h1>');
            return;
        }

        if (stats.isDirectory()) {
            const indexPath = path.join(filePath, 'index.html');
            if (fs.existsSync(indexPath)) {
                serveStaticFile(req, res, indexPath);
            } else {
                listDirectory(req, res, filePath);
            }
            return;
        }

        const mimeType = getMimeType(filePath);
        const stream = fs.createReadStream(filePath);
        
        res.writeHead(200, { 
            'Content-Type': mimeType,
            'Content-Length': stats.size,
            'Cache-Control': 'max-age=3600'
        });
        
        stream.pipe(res);
    });
}

function listDirectory(req, res, dirPath) {
    fs.readdir(dirPath, (err, files) => {
        if (err) {
            res.writeHead(500, { 'Content-Type': 'text/html' });
            res.end('<h1>500 Internal Server Error</h1>');
            return;
        }

        const baseUrl = req.url.endsWith('/') ? req.url : req.url + '/';
        let html = '<!DOCTYPE html><html><head><title>Directory Listing</title>';
        html += '<style>body{font-family:monospace;margin:20px;}a{display:block;margin:5px;padding:5px;border-bottom:1px solid #eee;}a:hover{background:#f5f5f5;}</style></head><body>';
        html += `<h1>Index of ${baseUrl}</h1><hr>`;
        
        if (baseUrl !== '/') {
            html += `<a href="${path.dirname(baseUrl)}">../</a>`;
        }
        
        files.forEach(file => {
            const filePath = path.join(dirPath, file);
            const stats = fs.statSync(filePath);
            const isDir = stats.isDirectory();
            html += `<a href="${baseUrl}${file}">${file}${isDir ? '/' : ''}</a>`;
        });
        
        html += '</body></html>';
        
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);
    });
}

function uploadFile(filePath, content) {
    return new Promise((resolve, reject) => {
        const dir = path.dirname(filePath);
        fs.mkdir(dir, { recursive: true }, (err) => {
            if (err) return reject(err);
            fs.writeFile(filePath, content, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    });
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
    
    if (pathname.startsWith('/api/')) {
        const apiPath = pathname.slice(5);
        const body = await parseBody(req);
        
        switch (apiPath) {
            case 'watchdog/config': {
                if (req.method === 'GET') {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ code: 200, data: WATCHDOG_CONFIG }));
                } else if (req.method === 'POST') {
                    if (body.enabled !== undefined) WATCHDOG_CONFIG.enabled = body.enabled;
                    if (body.interval) WATCHDOG_CONFIG.interval = body.interval;
                    if (body.timeout) WATCHDOG_CONFIG.timeout = body.timeout;
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ code: 200, message: 'Watchdog config updated', data: WATCHDOG_CONFIG }));
                }
                break;
            }
            
            case 'watchdog/status': {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                    code: 200, 
                    data: { 
                        enabled: WATCHDOG_CONFIG.enabled,
                        timestamp: Date.now()
                    } 
                }));
                break;
            }
            
            case 'upload': {
                if (req.method !== 'POST') {
                    res.writeHead(405, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ code: 405, message: 'Method Not Allowed' }));
                    return;
                }
                
                const { path: filePath, content, base64 } = body;
                if (!filePath) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ code: 400, message: 'Missing path' }));
                    return;
                }
                
                try {
                    const fullPath = path.join(STATIC_DIR, filePath);
                    const fileContent = base64 ? Buffer.from(content, 'base64') : content;
                    await uploadFile(fullPath, fileContent);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ code: 200, message: 'File uploaded', path: filePath }));
                } catch (err) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ code: 500, message: err.message }));
                }
                break;
            }
            
            case 'delete': {
                if (req.method !== 'POST') {
                    res.writeHead(405, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ code: 405, message: 'Method Not Allowed' }));
                    return;
                }
                
                const { path: filePath } = body;
                if (!filePath) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ code: 400, message: 'Missing path' }));
                    return;
                }
                
                const fullPath = path.join(STATIC_DIR, filePath);
                try {
                    fs.unlinkSync(fullPath);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ code: 200, message: 'File deleted' }));
                } catch (err) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ code: 500, message: err.message }));
                }
                break;
            }
            
            case 'list': {
                const { dir = '' } = body;
                const fullPath = path.join(STATIC_DIR, dir);
                try {
                    const files = fs.readdirSync(fullPath);
                    const fileList = files.map(file => {
                        const filePath = path.join(fullPath, file);
                        const stats = fs.statSync(filePath);
                        return {
                            name: file,
                            type: stats.isDirectory() ? 'directory' : 'file',
                            size: stats.size,
                            mtime: stats.mtime.getTime()
                        };
                    });
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ code: 200, data: fileList }));
                } catch (err) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ code: 500, message: err.message }));
                }
                break;
            }
            
            default: {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ code: 404, message: 'API Not Found' }));
            }
        }
    } else {
        const filePath = path.join(STATIC_DIR, pathname);
        serveStaticFile(req, res, filePath);
    }
}

const PORT = process.env.MANAGER_PORT ? parseInt(process.env.MANAGER_PORT) + 2 : 728;
const server = http.createServer(handleRequest).listen(PORT, () => {
    console.log(`Base_view 静态文件服务器运行在端口 ${PORT}`);
    console.log(`静态文件目录: ${STATIC_DIR}`);
    console.log(`API: http://localhost:${PORT}/api/`);
    console.log(`静态文件: http://localhost:${PORT}/`);
});