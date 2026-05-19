const http = require('http');

const LOG_SERVER_PORT = 727;
let logToken = null;
let logServerAvailable = false;

async function fetchLogToken() {
    return new Promise((resolve) => {
        const req = http.request({
            hostname: 'localhost',
            port: LOG_SERVER_PORT,
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
                        logToken = result.token;
                        logServerAvailable = true;
                        resolve(logToken);
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

async function sendLog(moduleName, level, message, data = {}) {
    if (!logServerAvailable && !logToken) {
        await fetchLogToken();
    }
    
    if (!logToken) {
        return;
    }

    const logData = {
        level,
        message,
        data,
        timestamp: Date.now()
    };

    return new Promise((resolve) => {
        const body = JSON.stringify({
            module: moduleName,
            data: logData
        });

        const req = http.request({
            hostname: 'localhost',
            port: LOG_SERVER_PORT,
            path: `/log?token=${logToken}`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body)
            },
            timeout: 2000
        }, (res) => {
            res.on('data', () => {});
            res.on('end', () => resolve());
        });

        req.on('error', () => resolve());
        req.on('timeout', () => {
            req.destroy();
            resolve();
        });

        req.write(body);
        req.end();
    });
}

function createLogger(moduleName) {
    return {
        info: async (message, data) => await sendLog(moduleName, 'INFO', message, data),
        warn: async (message, data) => await sendLog(moduleName, 'WARN', message, data),
        error: async (message, data) => await sendLog(moduleName, 'ERROR', message, data),
        debug: async (message, data) => await sendLog(moduleName, 'DEBUG', message, data)
    };
}

function showLogHint() {
    console.log('日志已统一管理，请访问日志服务器查看详细日志');
    console.log(`日志文件目录: ${__dirname}/../Plugs/Base_Logs/logs/`);
}

module.exports = {
    createLogger,
    fetchLogToken,
    showLogHint
};
