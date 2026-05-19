#ifndef REDIS_UTIL_H
#define REDIS_UTIL_H

#include <hiredis/hiredis.h>
#include <yaml.h>
#include <string.h>
#include <stdlib.h>

typedef struct {
    char host[64];
    int port;
    char password[128];
    int database;
    int max_active;
    int max_idle;
    int min_idle;
    int max_wait_ms;
} RedisConfig;

typedef struct {
    redisContext *context;
    RedisConfig config;
} RedisUtil;

RedisConfig load_redis_config(const char *config_file);

RedisUtil* redis_util_new(const char *config_file);

char* redis_get(RedisUtil *util, const char *key);

int redis_set(RedisUtil *util, const char *key, const char *value);

int redis_setex(RedisUtil *util, const char *key, const char *value, int seconds);

int redis_del(RedisUtil *util, const char *key);

int redis_exists(RedisUtil *util, const char *key);

long long redis_incr(RedisUtil *util, const char *key);

long long redis_decr(RedisUtil *util, const char *key);

char* redis_hget(RedisUtil *util, const char *key, const char *field);

int redis_hset(RedisUtil *util, const char *key, const char *field, const char *value);

void redis_hgetall(RedisUtil *util, const char *key, char ***fields, char ***values, int *count);

void redis_util_free(RedisUtil *util);

#endif