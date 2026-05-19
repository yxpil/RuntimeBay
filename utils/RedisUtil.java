package com.runtimebay.utils;

import org.yaml.snakeyaml.Yaml;
import redis.clients.jedis.Jedis;
import redis.clients.jedis.JedisPool;
import redis.clients.jedis.JedisPoolConfig;

import java.io.FileInputStream;
import java.io.FileNotFoundException;
import java.io.InputStream;
import java.util.Map;
import java.util.concurrent.TimeUnit;

public class RedisUtil {
    private static JedisPool jedisPool;
    private static String HOST;
    private static int PORT;
    private static String PASSWORD;
    private static int DATABASE;
    private static int MAX_ACTIVE;
    private static int MAX_IDLE;
    private static int MIN_IDLE;
    private static int MAX_WAIT;

    static {
        loadConfig();
        initPool();
    }

    private static void loadConfig() {
        try {
            Yaml yaml = new Yaml();
            InputStream inputStream = new FileInputStream("redis.page");
            Map<String, Object> config = yaml.load(inputStream);

            Map<String, Object> spring = (Map<String, Object>) config.get("spring");
            Map<String, Object> redis = (Map<String, Object>) spring.get("redis");

            HOST = (String) redis.getOrDefault("host", "127.0.0.1");
            PORT = (Integer) redis.getOrDefault("port", 6379);
            PASSWORD = (String) redis.getOrDefault("password", "");
            DATABASE = (Integer) redis.getOrDefault("database", 0);

            Map<String, Object> lettuce = (Map<String, Object>) redis.get("lettuce");
            Map<String, Object> pool = (Map<String, Object>) lettuce.get("pool");

            MAX_ACTIVE = (Integer) pool.getOrDefault("max-active", 200);
            MAX_IDLE = (Integer) pool.getOrDefault("max-idle", 50);
            MIN_IDLE = (Integer) pool.getOrDefault("min-idle", 10);
            MAX_WAIT = parseTime((String) pool.getOrDefault("max-wait", "100ms"));

            inputStream.close();
        } catch (FileNotFoundException e) {
            HOST = "127.0.0.1";
            PORT = 6379;
            PASSWORD = "";
            DATABASE = 0;
            MAX_ACTIVE = 200;
            MAX_IDLE = 50;
            MIN_IDLE = 10;
            MAX_WAIT = 100;
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private static int parseTime(String time) {
        if (time.endsWith("ms")) {
            return Integer.parseInt(time.replace("ms", ""));
        }
        return Integer.parseInt(time);
    }

    private static void initPool() {
        JedisPoolConfig config = new JedisPoolConfig();
        config.setMaxTotal(MAX_ACTIVE);
        config.setMaxIdle(MAX_IDLE);
        config.setMinIdle(MIN_IDLE);
        config.setMaxWaitMillis(MAX_WAIT);
        config.setTestOnBorrow(true);
        config.setTestOnReturn(false);
        config.setTestWhileIdle(true);

        jedisPool = new JedisPool(config, HOST, PORT, 2000,
                PASSWORD == null || PASSWORD.isEmpty() ? null : PASSWORD, DATABASE);
    }

    public static Jedis getConnection() {
        return jedisPool.getResource();
    }

    public static String get(String key) {
        try (Jedis jedis = getConnection()) {
            return jedis.get(key);
        }
    }

    public static String set(String key, String value) {
        try (Jedis jedis = getConnection()) {
            return jedis.set(key, value);
        }
    }

    public static String set(String key, String value, long timeout, TimeUnit unit) {
        try (Jedis jedis = getConnection()) {
            return jedis.set(key, value, "NX", "EX", unit.toSeconds(timeout));
        }
    }

    public static Long del(String key) {
        try (Jedis jedis = getConnection()) {
            return jedis.del(key);
        }
    }

    public static Boolean exists(String key) {
        try (Jedis jedis = getConnection()) {
            return jedis.exists(key);
        }
    }

    public static Long incr(String key) {
        try (Jedis jedis = getConnection()) {
            return jedis.incr(key);
        }
    }

    public static Long decr(String key) {
        try (Jedis jedis = getConnection()) {
            return jedis.decr(key);
        }
    }

    public static void close() {
        if (jedisPool != null && !jedisPool.isClosed()) {
            jedisPool.close();
        }
    }
}