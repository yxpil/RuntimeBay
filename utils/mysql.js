const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const mysql = require('mysql2/promise');

let config;
try {
    const configFile = fs.readFileSync(path.join(__dirname, '..', 'mysql.page'), 'utf8');
    config = yaml.load(configFile);
} catch (error) {
    config = {
        spring: {
            datasource: {
                primary: {
                    url: 'jdbc:mysql://127.0.0.1:3306/runtimebay?useUnicode=true&characterEncoding=utf8&useSSL=false&serverTimezone=Asia/Shanghai&rewriteBatchedStatements=true',
                    username: 'root',
                    password: 'qipa1234',
                    'maximum-pool-size': 20,
                    'minimum-idle': 5,
                    'idle-timeout': 300000,
                    'connection-timeout': 20000
                }
            }
        }
    };
}

const dbConfig = config.spring.datasource.primary;

const mysqlConfig = {
    host: extractHost(dbConfig.url),
    port: extractPort(dbConfig.url),
    user: dbConfig.username,
    password: dbConfig.password,
    database: extractDatabase(dbConfig.url),
    charset: 'utf8mb4',
    timezone: 'Asia/Shanghai',
    connectTimeout: dbConfig['connection-timeout'] || 20000,
    waitForConnections: true,
    connectionLimit: dbConfig['maximum-pool-size'] || 20,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
};

function extractHost(url) {
    const match = url.match(/jdbc:mysql:\/\/([^:]+):(\d+)/);
    return match ? match[1] : '127.0.0.1';
}

function extractPort(url) {
    const match = url.match(/jdbc:mysql:\/\/([^:]+):(\d+)/);
    return match ? parseInt(match[2]) : 3306;
}

function extractDatabase(url) {
    const match = url.match(/\/([^?]+)\?/);
    return match ? match[1] : 'runtimebay';
}

let pool = null;

function getPool() {
    if (!pool) {
        pool = mysql.createPool(mysqlConfig);
    }
    return pool;
}

class MySQLUtil {
    static async executeUpdate(sql, params = []) {
        const connection = await getPool().getConnection();
        try {
            const [result] = await connection.execute(sql, params);
            return result.affectedRows;
        } catch (error) {
            console.error('MySQL Update Error:', error);
            return -1;
        } finally {
            connection.release();
        }
    }

    static async executeQuery(sql, params = []) {
        const connection = await getPool().getConnection();
        try {
            const [rows] = await connection.execute(sql, params);
            return rows;
        } catch (error) {
            console.error('MySQL Query Error:', error);
            return [];
        } finally {
            connection.release();
        }
    }

    static async executeScalar(sql, params = []) {
        const rows = await this.executeQuery(sql, params);
        if (rows.length > 0) {
            const firstRow = rows[0];
            const keys = Object.keys(firstRow);
            if (keys.length > 0) {
                return firstRow[keys[0]];
            }
        }
        return null;
    }

    static async execute(sql) {
        const connection = await getPool().getConnection();
        try {
            const [result] = await connection.execute(sql);
            return result;
        } catch (error) {
            console.error('MySQL Execute Error:', error);
            return null;
        } finally {
            connection.release();
        }
    }

    static async executeBatch(sqlList) {
        const connection = await getPool().getConnection();
        try {
            await connection.beginTransaction();
            const results = [];
            for (const sql of sqlList) {
                const [result] = await connection.execute(sql);
                results.push(result.affectedRows);
            }
            await connection.commit();
            return results;
        } catch (error) {
            await connection.rollback();
            console.error('MySQL Batch Error:', error);
            return [];
        } finally {
            connection.release();
        }
    }

    static async close() {
        if (pool) {
            await pool.end();
            pool = null;
        }
    }
}

module.exports = MySQLUtil;