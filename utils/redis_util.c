#include "redis_util.h"
#include <stdio.h>
#include <string.h>

static RedisConfig default_config() {
    RedisConfig config;
    strcpy(config.host, "127.0.0.1");
    config.port = 6379;
    strcpy(config.password, "");
    config.database = 0;
    config.max_active = 200;
    config.max_idle = 50;
    config.min_idle = 10;
    config.max_wait_ms = 100;
    return config;
}

static int parse_time_ms(const char *time_str) {
    int len = strlen(time_str);
    if (len > 2 && time_str[len - 2] == 'm' && time_str[len - 1] == 's') {
        char num_str[32];
        strncpy(num_str, time_str, len - 2);
        num_str[len - 2] = '\0';
        return atoi(num_str);
    }
    return atoi(time_str);
}

static void parse_yaml_value(yaml_document_t *doc, yaml_node_t *node, char *result, size_t max_len) {
    if (node->type == YAML_SCALAR_NODE) {
        strncpy(result, (char*)node->data.scalar.value, max_len - 1);
        result[max_len - 1] = '\0';
    }
}

static int get_yaml_mapping_value(yaml_document_t *doc, yaml_node_t *mapping, const char *key, char *result, size_t max_len) {
    yaml_node_pair_t *pair = mapping->data.mapping.pairs.start;
    for (; pair < mapping->data.mapping.pairs.top; pair++) {
        yaml_node_t *key_node = yaml_document_get_node(doc, pair->key);
        yaml_node_t *value_node = yaml_document_get_node(doc, pair->value);

        if (key_node && value_node && strcmp((char*)key_node->data.scalar.value, key) == 0) {
            parse_yaml_value(doc, value_node, result, max_len);
            return 1;
        }
    }
    return 0;
}

RedisConfig load_redis_config(const char *config_file) {
    FILE *fp = fopen(config_file, "r");
    if (!fp) {
        printf("Config file not found: %s, using default config\n", config_file);
        return default_config();
    }

    yaml_parser_t parser;
    yaml_document_t document;

    if (!yaml_parser_initialize(&parser)) {
        fclose(fp);
        return default_config();
    }

    yaml_parser_set_input_file(&parser, fp);

    if (!yaml_parser_load(&parser, &document)) {
        yaml_parser_delete(&parser);
        fclose(fp);
        return default_config();
    }

    RedisConfig config = default_config();

    yaml_node_t *root = yaml_document_get_node(&document, 1);
    if (!root || root->type != YAML_MAPPING_NODE) {
        yaml_document_delete(&document);
        yaml_parser_delete(&parser);
        fclose(fp);
        return config;
    }

    yaml_node_pair_t *pair = root->data.mapping.pairs.start;
    for (; pair < root->data.mapping.pairs.top; pair++) {
        yaml_node_t *key_node = yaml_document_get_node(&document, pair->key);
        yaml_node_t *value_node = yaml_document_get_node(&document, pair->value);

        if (!key_node || !value_node || key_node->type != YAML_SCALAR_NODE) continue;

        if (strcmp((char*)key_node->data.scalar.value, "spring") == 0 && value_node->type == YAML_MAPPING_NODE) {
            yaml_node_pair_t *spring_pair = value_node->data.mapping.pairs.start;
            for (; spring_pair < value_node->data.mapping.pairs.top; spring_pair++) {
                yaml_node_t *spring_key = yaml_document_get_node(&document, spring_pair->key);
                yaml_node_t *spring_value = yaml_document_get_node(&document, spring_pair->value);

                if (!spring_key || !spring_value || spring_key->type != YAML_SCALAR_NODE) continue;

                if (strcmp((char*)spring_key->data.scalar.value, "redis") == 0 && spring_value->type == YAML_MAPPING_NODE) {
                    yaml_node_pair_t *redis_pair = spring_value->data.mapping.pairs.start;
                    for (; redis_pair < spring_value->data.mapping.pairs.top; redis_pair++) {
                        yaml_node_t *redis_key = yaml_document_get_node(&document, redis_pair->key);
                        yaml_node_t *redis_value = yaml_document_get_node(&document, redis_pair->value);

                        if (!redis_key || !redis_value || redis_key->type != YAML_SCALAR_NODE) continue;

                        char key_str[128];
                        strncpy(key_str, (char*)redis_key->data.scalar.value, sizeof(key_str) - 1);

                        if (strcmp(key_str, "host") == 0 && redis_value->type == YAML_SCALAR_NODE) {
                            strncpy(config.host, (char*)redis_value->data.scalar.value, sizeof(config.host) - 1);
                        } else if (strcmp(key_str, "port") == 0 && redis_value->type == YAML_SCALAR_NODE) {
                            config.port = atoi((char*)redis_value->data.scalar.value);
                        } else if (strcmp(key_str, "password") == 0 && redis_value->type == YAML_SCALAR_NODE) {
                            strncpy(config.password, (char*)redis_value->data.scalar.value, sizeof(config.password) - 1);
                        } else if (strcmp(key_str, "database") == 0 && redis_value->type == YAML_SCALAR_NODE) {
                            config.database = atoi((char*)redis_value->data.scalar.value);
                        } else if (strcmp(key_str, "lettuce") == 0 && redis_value->type == YAML_MAPPING_NODE) {
                            yaml_node_pair_t *lettuce_pair = redis_value->data.mapping.pairs.start;
                            for (; lettuce_pair < redis_value->data.mapping.pairs.top; lettuce_pair++) {
                                yaml_node_t *lettuce_key = yaml_document_get_node(&document, lettuce_pair->key);
                                yaml_node_t *lettuce_value = yaml_document_get_node(&document, lettuce_pair->value);

                                if (!lettuce_key || !lettuce_value || lettuce_key->type != YAML_SCALAR_NODE) continue;

                                if (strcmp((char*)lettuce_key->data.scalar.value, "pool") == 0 && lettuce_value->type == YAML_MAPPING_NODE) {
                                    yaml_node_pair_t *pool_pair = lettuce_value->data.mapping.pairs.start;
                                    for (; pool_pair < lettuce_value->data.mapping.pairs.top; pool_pair++) {
                                        yaml_node_t *pool_key = yaml_document_get_node(&document, pool_pair->key);
                                        yaml_node_t *pool_value = yaml_document_get_node(&document, pool_pair->value);

                                        if (!pool_key || !pool_value || pool_key->type != YAML_SCALAR_NODE) continue;

                                        char pool_key_str[64];
                                        strncpy(pool_key_str, (char*)pool_key->data.scalar.value, sizeof(pool_key_str) - 1);

                                        if (strcmp(pool_key_str, "max-active") == 0 && pool_value->type == YAML_SCALAR_NODE) {
                                            config.max_active = atoi((char*)pool_value->data.scalar.value);
                                        } else if (strcmp(pool_key_str, "max-idle") == 0 && pool_value->type == YAML_SCALAR_NODE) {
                                            config.max_idle = atoi((char*)pool_value->data.scalar.value);
                                        } else if (strcmp(pool_key_str, "min-idle") == 0 && pool_value->type == YAML_SCALAR_NODE) {
                                            config.min_idle = atoi((char*)pool_value->data.scalar.value);
                                        } else if (strcmp(pool_key_str, "max-wait") == 0 && pool_value->type == YAML_SCALAR_NODE) {
                                            config.max_wait_ms = parse_time_ms((char*)pool_value->data.scalar.value);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    yaml_document_delete(&document);
    yaml_parser_delete(&parser);
    fclose(fp);

    return config;
}

RedisUtil* redis_util_new(const char *config_file) {
    RedisUtil *util = (RedisUtil*)malloc(sizeof(RedisUtil));
    if (!util) return NULL;

    util->config = load_redis_config(config_file);

    redisOptions options = {0};
    options.addr = (redisAcceptFn*)&redisTCP;
    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_port = htons(util->config.port);
    inet_pton(AF_INET, util->config.host, &addr.sin_addr);
    options.endpoint = &addr;
    options.connect_timeout = util->config.max_wait_ms;

    util->context = redisConnectWithOptions(&options);
    if (util->context == NULL || util->context->err) {
        if (util->context) {
            printf("Redis connection error: %s\n", util->context->errstr);
            redisFree(util->context);
        } else {
            printf("Redis connection error: can't allocate redis context\n");
        }
        free(util);
        return NULL;
    }

    if (strlen(util->config.password) > 0) {
        redisReply *reply = redisCommand(util->context, "AUTH %s", util->config.password);
        if (reply == NULL || util->context->err) {
            printf("Redis AUTH error\n");
            if (reply) freeReplyObject(reply);
            redisFree(util->context);
            free(util);
            return NULL;
        }
        freeReplyObject(reply);
    }

    if (util->config.database != 0) {
        redisReply *reply = redisCommand(util->context, "SELECT %d", util->config.database);
        if (reply == NULL || util->context->err) {
            printf("Redis SELECT error\n");
            if (reply) freeReplyObject(reply);
            redisFree(util->context);
            free(util);
            return NULL;
        }
        freeReplyObject(reply);
    }

    return util;
}

char* redis_get(RedisUtil *util, const char *key) {
    redisReply *reply = redisCommand(util->context, "GET %s", key);
    if (reply == NULL || util->context->err) {
        if (reply) freeReplyObject(reply);
        return NULL;
    }

    if (reply->type != REDIS_REPLY_STRING) {
        freeReplyObject(reply);
        return NULL;
    }

    char *result = strdup(reply->str);
    freeReplyObject(reply);
    return result;
}

int redis_set(RedisUtil *util, const char *key, const char *value) {
    redisReply *reply = redisCommand(util->context, "SET %s %s", key, value);
    if (reply == NULL || util->context->err) {
        if (reply) freeReplyObject(reply);
        return -1;
    }

    int result = (strcmp(reply->str, "OK") == 0) ? 0 : -1;
    freeReplyObject(reply);
    return result;
}

int redis_setex(RedisUtil *util, const char *key, const char *value, int seconds) {
    redisReply *reply = redisCommand(util->context, "SETEX %s %d %s", key, seconds, value);
    if (reply == NULL || util->context->err) {
        if (reply) freeReplyObject(reply);
        return -1;
    }

    int result = (strcmp(reply->str, "OK") == 0) ? 0 : -1;
    freeReplyObject(reply);
    return result;
}

int redis_del(RedisUtil *util, const char *key) {
    redisReply *reply = redisCommand(util->context, "DEL %s", key);
    if (reply == NULL || util->context->err) {
        if (reply) freeReplyObject(reply);
        return -1;
    }

    int result = reply->integer;
    freeReplyObject(reply);
    return result;
}

int redis_exists(RedisUtil *util, const char *key) {
    redisReply *reply = redisCommand(util->context, "EXISTS %s", key);
    if (reply == NULL || util->context->err) {
        if (reply) freeReplyObject(reply);
        return -1;
    }

    int result = reply->integer;
    freeReplyObject(reply);
    return result;
}

long long redis_incr(RedisUtil *util, const char *key) {
    redisReply *reply = redisCommand(util->context, "INCR %s", key);
    if (reply == NULL || util->context->err) {
        if (reply) freeReplyObject(reply);
        return -1;
    }

    long long result = reply->integer;
    freeReplyObject(reply);
    return result;
}

long long redis_decr(RedisUtil *util, const char *key) {
    redisReply *reply = redisCommand(util->context, "DECR %s", key);
    if (reply == NULL || util->context->err) {
        if (reply) freeReplyObject(reply);
        return -1;
    }

    long long result = reply->integer;
    freeReplyObject(reply);
    return result;
}

char* redis_hget(RedisUtil *util, const char *key, const char *field) {
    redisReply *reply = redisCommand(util->context, "HGET %s %s", key, field);
    if (reply == NULL || util->context->err) {
        if (reply) freeReplyObject(reply);
        return NULL;
    }

    if (reply->type != REDIS_REPLY_STRING) {
        freeReplyObject(reply);
        return NULL;
    }

    char *result = strdup(reply->str);
    freeReplyObject(reply);
    return result;
}

int redis_hset(RedisUtil *util, const char *key, const char *field, const char *value) {
    redisReply *reply = redisCommand(util->context, "HSET %s %s %s", key, field, value);
    if (reply == NULL || util->context->err) {
        if (reply) freeReplyObject(reply);
        return -1;
    }

    int result = reply->integer;
    freeReplyObject(reply);
    return result;
}

void redis_hgetall(RedisUtil *util, const char *key, char ***fields, char ***values, int *count) {
    *fields = NULL;
    *values = NULL;
    *count = 0;

    redisReply *reply = redisCommand(util->context, "HGETALL %s", key);
    if (reply == NULL || util->context->err) {
        if (reply) freeReplyObject(reply);
        return;
    }

    if (reply->type != REDIS_REPLY_ARRAY || reply->elements < 2) {
        freeReplyObject(reply);
        return;
    }

    *count = reply->elements / 2;
    *fields = (char**)malloc(sizeof(char*) * (*count));
    *values = (char**)malloc(sizeof(char*) * (*count));

    for (int i = 0; i < *count; i++) {
        redisReply *field_reply = reply->element[i * 2];
        redisReply *value_reply = reply->element[i * 2 + 1];

        (*fields)[i] = strdup(field_reply->str);
        (*values)[i] = strdup(value_reply->str);
    }

    freeReplyObject(reply);
}

void redis_util_free(RedisUtil *util) {
    if (util) {
        if (util->context) {
            redisFree(util->context);
        }
        free(util);
    }
}