import yaml
import redis
from redis.connection import ConnectionPool

class RedisUtil:
    _pool = None
    _config = None

    @classmethod
    def _load_config(cls):
        if cls._config is not None:
            return cls._config

        try:
            with open('redis.page', 'r', encoding='utf-8') as f:
                cls._config = yaml.safe_load(f)
        except FileNotFoundError:
            cls._config = {
                'spring': {
                    'redis': {
                        'host': '127.0.0.1',
                        'port': 6379,
                        'password': '',
                        'database': 0,
                        'lettuce': {
                            'pool': {
                                'max-active': 200,
                                'max-idle': 50,
                                'min-idle': 10,
                                'max-wait': '100ms'
                            }
                        }
                    }
                }
            }
        return cls._config

    @classmethod
    def _get_pool(cls):
        if cls._pool is not None:
            return cls._pool

        config = cls._load_config()
        redis_config = config['spring']['redis']
        pool_config = redis_config['lettuce']['pool']

        max_wait = pool_config.get('max-wait', '100ms')
        if isinstance(max_wait, str) and max_wait.endswith('ms'):
            max_wait_ms = int(max_wait.replace('ms', ''))
        else:
            max_wait_ms = int(max_wait)

        cls._pool = ConnectionPool(
            host=redis_config.get('host', '127.0.0.1'),
            port=redis_config.get('port', 6379),
            password=redis_config.get('password') or None,
            db=redis_config.get('database', 0),
            max_connections=pool_config.get('max-active', 200),
            max_idle=int(pool_config.get('max-idle', 50)),
            min_idle=int(pool_config.get('min-idle', 10)),
            socket_timeout=max_wait_ms / 1000,
            socket_connect_timeout=max_wait_ms / 1000
        )
        return cls._pool

    @classmethod
    def get_connection(cls):
        return redis.Redis(connection_pool=cls._get_pool())

    @classmethod
    def get(cls, key):
        with cls.get_connection() as client:
            return client.get(key)

    @classmethod
    def set(cls, key, value, ex=None, px=None, nx=False, xx=False):
        with cls.get_connection() as client:
            return client.set(key, value, ex=ex, px=px, nx=nx, xx=xx)

    @classmethod
    def setnx(cls, key, value):
        with cls.get_connection() as client:
            return client.setnx(key, value)

    @classmethod
    def setex(cls, key, time, value):
        with cls.get_connection() as client:
            return client.setex(key, time, value)

    @classmethod
    def delete(cls, *keys):
        with cls.get_connection() as client:
            return client.delete(*keys)

    @classmethod
    def exists(cls, *keys):
        with cls.get_connection() as client:
            return client.exists(*keys)

    @classmethod
    def incr(cls, key):
        with cls.get_connection() as client:
            return client.incr(key)

    @classmethod
    def decr(cls, key):
        with cls.get_connection() as client:
            return client.decr(key)

    @classmethod
    def hget(cls, name, key):
        with cls.get_connection() as client:
            return client.hget(name, key)

    @classmethod
    def hset(cls, name, key, value):
        with cls.get_connection() as client:
            return client.hset(name, key, value)

    @classmethod
    def hgetall(cls, name):
        with cls.get_connection() as client:
            return client.hgetall(name)

    @classmethod
    def lpush(cls, name, *values):
        with cls.get_connection() as client:
            return client.lpush(name, *values)

    @classmethod
    def rpop(cls, name):
        with cls.get_connection() as client:
            return client.rpop(name)

    @classmethod
    def sadd(cls, name, *values):
        with cls.get_connection() as client:
            return client.sadd(name, *values)

    @classmethod
    def smembers(cls, name):
        with cls.get_connection() as client:
            return client.smembers(name)

    @classmethod
    def expire(cls, name, time):
        with cls.get_connection() as client:
            return client.expire(name, time)

    @classmethod
    def ttl(cls, name):
        with cls.get_connection() as client:
            return client.ttl(name)

    @classmethod
    def close(cls):
        if cls._pool is not None:
            cls._pool.disconnect()
            cls._pool = None