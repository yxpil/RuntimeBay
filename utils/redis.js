const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const redis = require('ioredis');

let config;
try {
    const configFile = fs.readFileSync(path.join(__dirname, '..', 'redis.page'), 'utf8');
    config = yaml.load(configFile);
} catch (error) {
    config = {
        spring: {
            redis: {
                host: '127.0.0.1',
                port: 6379,
                password: '',
                database: 0,
                lettuce: {
                    pool: {
                        'max-active': 200,
                        'max-idle': 50,
                        'min-idle': 10,
                        'max-wait': '100ms'
                    }
                }
            }
        }
    };
}

const redisConfig = config.spring.redis;
const poolConfig = redisConfig.lettuce.pool;

const redisOptions = {
    host: redisConfig.host || '127.0.0.1',
    port: redisConfig.port || 6379,
    password: redisConfig.password || '',
    db: redisConfig.database || 0,
    maxRetriesPerRequest: 3,
    retryDelayOnFailover: 100,
    enableReadyCheck: true,
    lazyConnect: false
};

class RedisUtil {
    constructor() {
        this.client = new redis(redisOptions);
        this.client.on('error', (err) => {
            console.error('Redis Client Error:', err);
        });
    }

    async get(key) {
        return await this.client.get(key);
    }

    async set(key, value, ttl = null) {
        if (ttl) {
            return await this.client.set(key, value, 'EX', ttl);
        }
        return await this.client.set(key, value);
    }

    async setNX(key, value, ttl = null) {
        if (ttl) {
            return await this.client.set(key, value, 'NX', 'EX', ttl);
        }
        return await this.client.set(key, value, 'NX');
    }

    async del(key) {
        return await this.client.del(key);
    }

    async exists(key) {
        return await this.client.exists(key);
    }

    async incr(key) {
        return await this.client.incr(key);
    }

    async decr(key) {
        return await this.client.decr(key);
    }

    async hget(key, field) {
        return await this.client.hget(key, field);
    }

    async hset(key, field, value) {
        return await this.client.hset(key, field, value);
    }

    async hgetall(key) {
        return await this.client.hgetall(key);
    }

    async lpush(key, ...values) {
        return await this.client.lpush(key, ...values);
    }

    async rpop(key) {
        return await this.client.rpop(key);
    }

    async sadd(key, ...members) {
        return await this.client.sadd(key, ...members);
    }

    async smembers(key) {
        return await this.client.smembers(key);
    }

    async expire(key, seconds) {
        return await this.client.expire(key, seconds);
    }

    async ttl(key) {
        return await this.client.ttl(key);
    }

    async close() {
        return await this.client.quit();
    }
}

module.exports = new RedisUtil();