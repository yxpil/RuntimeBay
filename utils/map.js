const http = require('http');

const MAP_SERVER_PORT = 729;
let mapToken = null;
let mapServerAvailable = false;

async function fetchMapToken() {
    return new Promise((resolve) => {
        const req = http.request({
            hostname: 'localhost',
            port: MAP_SERVER_PORT,
            path: '/generate-token',
            method: 'GET',
            timeout: 2000
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    if (result.code === 200) {
                        mapToken = result.token;
                        mapServerAvailable = true;
                        resolve(mapToken);
                    } else {
                        resolve(null);
                    }
                } catch {
                    resolve(null);
                }
            });
        });
        req.on('error', () => resolve(null));
        req.on('timeout', () => {
            req.destroy();
            resolve(null);
        });
        req.end();
    });
}

function request(path, body) {
    return new Promise((resolve, reject) => {
        if (!mapToken) {
            fetchMapToken().then(() => {
                if (!mapToken) {
                    reject(new Error('Map server unavailable'));
                    return;
                }
                doRequest(path, body).then(resolve).catch(reject);
            });
            return;
        }
        doRequest(path, body).then(resolve).catch(reject);
    });
}

function doRequest(path, body) {
    return new Promise((resolve, reject) => {
        const bodyStr = JSON.stringify(body || {});
        const req = http.request({
            hostname: 'localhost',
            port: MAP_SERVER_PORT,
            path: `${path}?token=${mapToken}`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(bodyStr)
            },
            timeout: 3000
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch {
                    reject(new Error('Invalid response'));
                }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
        req.write(bodyStr);
        req.end();
    });
}

const sitemap = {
    async register(moduleName, data) {
        return request('/register', { module: moduleName, data });
    },
    
    async addEntry(moduleName, entry) {
        return request('/add-entry', { module: moduleName, entry });
    },
    
    async unregister(moduleName) {
        return request('/unregister', { module: moduleName });
    },
    
    async list() {
        return request('/list', {});
    },
    
    async get(moduleName, format) {
        return request('/get', { module: moduleName, format });
    },
    
    async clear(moduleName) {
        return request('/clear', { module: moduleName });
    },
    
    async stats() {
        return request('/stats', {});
    }
};

module.exports = {
    sitemap,
    fetchMapToken
};