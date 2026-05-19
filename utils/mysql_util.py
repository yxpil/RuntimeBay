import yaml
import pymysql
from pymysql import cursors
from dbutils.pooled_db import PooledDB

class MySQLUtil:
    _pool = None
    _config = None

    @classmethod
    def _load_config(cls):
        if cls._config is not None:
            return cls._config

        try:
            with open('mysql.page', 'r', encoding='utf-8') as f:
                cls._config = yaml.safe_load(f)
        except FileNotFoundError:
            cls._config = {
                'spring': {
                    'datasource': {
                        'primary': {
                            'url': 'jdbc:mysql://127.0.0.1:3306/runtimebay?useUnicode=true&characterEncoding=utf8&useSSL=false&serverTimezone=Asia/Shanghai&rewriteBatchedStatements=true',
                            'username': 'root',
                            'password': 'qipa1234',
                            'maximum-pool-size': 20,
                            'minimum-idle': 5,
                            'idle-timeout': 300000,
                            'connection-timeout': 20000
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
        db_config = config['spring']['datasource']['primary']

        url = db_config['url']
        host = cls._extract_host(url)
        port = cls._extract_port(url)
        database = cls._extract_database(url)

        cls._pool = PooledDB(
            creator=pymysql,
            maxconnections=db_config.get('maximum-pool-size', 20),
            mincached=db_config.get('minimum-idle', 5),
            maxcached=db_config.get('maximum-pool-size', 20),
            blocking=True,
            maxusage=None,
            setsession=[],
            ping=1,
            host=host,
            port=port,
            user=db_config['username'],
            password=db_config['password'],
            database=database,
            charset='utf8mb4',
            cursorclass=cursors.DictCursor
        )
        return cls._pool

    @staticmethod
    def _extract_host(url):
        import re
        match = re.search(r'jdbc:mysql://([^:]+):(\d+)', url)
        return match.group(1) if match else '127.0.0.1'

    @staticmethod
    def _extract_port(url):
        import re
        match = re.search(r'jdbc:mysql://([^:]+):(\d+)', url)
        return int(match.group(2)) if match else 3306

    @staticmethod
    def _extract_database(url):
        import re
        match = re.search(r'/([^?]+)\?', url)
        return match.group(1) if match else 'runtimebay'

    @classmethod
    def execute_update(cls, sql, params=None):
        if params is None:
            params = []
        conn = cls._get_pool().connection()
        try:
            with conn.cursor() as cursor:
                result = cursor.execute(sql, params)
                conn.commit()
                return result
        except Exception as e:
            conn.rollback()
            print(f"MySQL Update Error: {e}")
            return -1
        finally:
            conn.close()

    @classmethod
    def execute_query(cls, sql, params=None):
        if params is None:
            params = []
        conn = cls._get_pool().connection()
        try:
            with conn.cursor() as cursor:
                cursor.execute(sql, params)
                return cursor.fetchall()
        except Exception as e:
            print(f"MySQL Query Error: {e}")
            return []
        finally:
            conn.close()

    @classmethod
    def execute_scalar(cls, sql, params=None):
        if params is None:
            params = []
        rows = cls.execute_query(sql, params)
        if rows and len(rows) > 0:
            first_row = rows[0]
            keys = list(first_row.keys())
            if keys:
                return first_row[keys[0]]
        return None

    @classmethod
    def execute(cls, sql):
        conn = cls._get_pool().connection()
        try:
            with conn.cursor() as cursor:
                result = cursor.execute(sql)
                conn.commit()
                return result
        except Exception as e:
            conn.rollback()
            print(f"MySQL Execute Error: {e}")
            return False
        finally:
            conn.close()

    @classmethod
    def execute_batch(cls, sql_list):
        conn = cls._get_pool().connection()
        try:
            conn.begin()
            with conn.cursor() as cursor:
                results = []
                for sql in sql_list:
                    result = cursor.execute(sql)
                    results.append(result)
                conn.commit()
                return results
        except Exception as e:
            conn.rollback()
            print(f"MySQL Batch Error: {e}")
            return []
        finally:
            conn.close()

    @classmethod
    def close(cls):
        if cls._pool is not None:
            cls._pool.close()
            cls._pool = None