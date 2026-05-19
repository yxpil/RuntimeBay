const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const SITEMAP_DIR = path.join(__dirname, 'sitemaps');
if (!fs.existsSync(SITEMAP_DIR)) {
    fs.mkdirSync(SITEMAP_DIR, { recursive: true });
}

const sitemaps = {};
const MAX_ENTRIES = 5000;

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

function generateSitemapXml(sitemapData) {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

    for (const entry of sitemapData.entries) {
        xml += '  <url>\n';
        xml += `    <loc>${escapeXml(entry.loc)}</loc>\n`;
        if (entry.lastmod) {
            xml += `    <lastmod>${escapeXml(entry.lastmod)}</lastmod>\n`;
        }
        if (entry.changefreq) {
            xml += `    <changefreq>${escapeXml(entry.changefreq)}</changefreq>\n`;
        }
        if (entry.priority) {
            xml += `    <priority>${entry.priority}</priority>\n`;
        }
        xml += '  </url>\n';
    }

    xml += '</urlset>';
    return xml;
}

function escapeXml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function saveSitemapToFile(moduleName, data) {
    const filePath = path.join(SITEMAP_DIR, `${moduleName}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function loadSitemapFromFile(moduleName) {
    const filePath = path.join(SITEMAP_DIR, `${moduleName}.json`);
    if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
    return null;
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

        case '/register': {
            if (!tokens.has(token)) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ code: 401, message: 'Unauthorized' }));
                return;
            }

            const { module: moduleName, data } = body;
            if (!moduleName) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ code: 400, message: 'Missing module name' }));
                return;
            }

            sitemaps[moduleName] = data || { name: moduleName, entries: [], createdAt: Date.now() };
            sitemaps[moduleName].updatedAt = Date.now();
            saveSitemapToFile(moduleName, sitemaps[moduleName]);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ code: 200, message: 'Sitemap registered', module: moduleName }));
            break;
        }

        case '/add-entry': {
            if (!tokens.has(token)) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ code: 401, message: 'Unauthorized' }));
                return;
            }

            const { module: moduleName, entry } = body;
            if (!moduleName || !entry || !entry.loc) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ code: 400, message: 'Missing module name or entry' }));
                return;
            }

            if (!sitemaps[moduleName]) {
                sitemaps[moduleName] = { name: moduleName, entries: [], createdAt: Date.now() };
            }

            sitemaps[moduleName].entries.push({
                ...entry,
                addedAt: Date.now()
            });

            if (sitemaps[moduleName].entries.length > MAX_ENTRIES) {
                sitemaps[moduleName].entries = sitemaps[moduleName].entries.slice(-MAX_ENTRIES);
            }

            sitemaps[moduleName].updatedAt = Date.now();
            saveSitemapToFile(moduleName, sitemaps[moduleName]);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ code: 200, message: 'Entry added', total: sitemaps[moduleName].entries.length }));
            break;
        }

        case '/unregister': {
            if (!tokens.has(token)) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ code: 401, message: 'Unauthorized' }));
                return;
            }

            const { module: moduleName } = body;
            if (!moduleName) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ code: 400, message: 'Missing module name' }));
                return;
            }

            if (sitemaps[moduleName]) {
                delete sitemaps[moduleName];
                const filePath = path.join(SITEMAP_DIR, `${moduleName}.json`);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ code: 200, message: 'Sitemap unregistered' }));
            break;
        }

        case '/': {
            const robotsTxt = `User-agent: *
Allow: /
Sitemap: http://localhost:729/sitemap.xml`;
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end(robotsTxt);
            break;
        }

        case '/sitemap.xml': {
            const sitemapList = Object.keys(sitemaps);
            if (sitemapList.length === 0) {
                res.writeHead(200, { 'Content-Type': 'application/xml' });
                res.end('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>');
                return;
            }
            const sitemap = sitemaps[sitemapList[0]];
            res.writeHead(200, { 'Content-Type': 'application/xml' });
            res.end(generateSitemapXml(sitemap));
            break;
        }

        case '/list': {
            const list = Object.keys(sitemaps).map(name => ({
                name,
                entryCount: sitemaps[name].entries?.length || 0,
                createdAt: sitemaps[name].createdAt,
                updatedAt: sitemaps[name].updatedAt
            }));

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ code: 200, data: list }));
            break;
        }

        case '/get': {
            const { module: moduleName, format } = body;
            if (!moduleName) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ code: 400, message: 'Missing module name' }));
                return;
            }

            const sitemap = sitemaps[moduleName] || loadSitemapFromFile(moduleName);
            if (!sitemap) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ code: 404, message: 'Sitemap not found' }));
                return;
            }

            if (format === 'xml') {
                res.writeHead(200, { 'Content-Type': 'application/xml' });
                res.end(generateSitemapXml(sitemap));
            } else {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ code: 200, data: sitemap }));
            }
            break;
        }

        case '/stats': {
            const stats = {};
            Object.keys(sitemaps).forEach(module => {
                stats[module] = {
                    entryCount: sitemaps[module].entries?.length || 0,
                    updatedAt: sitemaps[module].updatedAt
                };
            });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ code: 200, data: stats }));
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
                if (sitemaps[moduleName]) {
                    sitemaps[moduleName].entries = [];
                    sitemaps[moduleName].updatedAt = Date.now();
                    saveSitemapToFile(moduleName, sitemaps[moduleName]);
                }
            } else {
                Object.keys(sitemaps).forEach(key => {
                    sitemaps[key].entries = [];
                    sitemaps[key].updatedAt = Date.now();
                    saveSitemapToFile(key, sitemaps[key]);
                });
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ code: 200, message: 'Sitemap cleared' }));
            break;
        }

        default: {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ code: 404, message: 'Not Found' }));
        }
    }
}

function loadAllSitemaps() {
    if (!fs.existsSync(SITEMAP_DIR)) return;

    const files = fs.readdirSync(SITEMAP_DIR);
    for (const file of files) {
        if (file.endsWith('.json')) {
            const moduleName = file.replace('.json', '');
            try {
                sitemaps[moduleName] = JSON.parse(fs.readFileSync(path.join(SITEMAP_DIR, file), 'utf-8'));
            } catch (e) {
                console.error(`Failed to load sitemap ${file}:`, e.message);
            }
        }
    }
}

loadAllSitemaps();

const PORT = process.env.MANAGER_PORT ? parseInt(process.env.MANAGER_PORT) + 3 : 729;
const server = http.createServer(handleRequest).listen(PORT, () => {
    console.log(`Base_map 站点地图服务器运行在端口 ${PORT}`);
    console.log(`API: http://localhost:${PORT}/`);
    console.log(`可用接口: /generate-token, /register, /add-entry, /unregister, /list, /get, /clear, /stats`);
});

module.exports = server;