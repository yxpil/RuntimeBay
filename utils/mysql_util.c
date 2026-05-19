#include "mysql_util.h"
#include <stdio.h>
#include <string.h>
#include <ctype.h>

static MySQLConfig default_config() {
    MySQLConfig config;
    strcpy(config.host, "127.0.0.1");
    config.port = 3306;
    strcpy(config.user, "root");
    strcpy(config.password, "qipa1234");
    strcpy(config.database, "runtimebay");
    config.max_pool_size = 20;
    config.min_idle = 5;
    config.idle_timeout = 300000;
    config.connection_timeout = 20000;
    return config;
}

static void extract_jdbc_url(const char *url, MySQLConfig *config) {
    const char *host_start = strstr(url, "jdbc:mysql://");
    if (host_start) {
        host_start += strlen("jdbc:mysql://");
        const char *port_start = strchr(host_start, ':');
        const char *db_start = strchr(host_start, '/');

        if (port_start && db_start && port_start < db_start) {
            size_t host_len = port_start - host_start;
            if (host_len > sizeof(config->host) - 1) host_len = sizeof(config->host) - 1;
            strncpy(config->host, host_start, host_len);
            config->host[host_len] = '\0';

            port_start++;
            size_t port_len = db_start - port_start;
            char port_str[16];
            if (port_len > sizeof(port_str) - 1) port_len = sizeof(port_str) - 1;
            strncpy(port_str, port_start, port_len);
            port_str[port_len] = '\0';
            config->port = atoi(port_str);

            const char *db_end = strchr(db_start, '?');
            if (db_end) {
                size_t db_len = db_end - db_start - 1;
                if (db_len > sizeof(config->database) - 1) db_len = sizeof(config->database) - 1;
                strncpy(config->database, db_start + 1, db_len);
                config->database[db_len] = '\0';
            }
        }
    }
}

static void trim_whitespace(char *str) {
    char *end;
    while(isspace((unsigned char)*str)) str++;
    if(*str == 0) return;
    end = str + strlen(str) - 1;
    while(end > str && isspace((unsigned char)*end)) end--;
    end[1] = '\0';
}

MySQLConfig load_mysql_config(const char *config_file) {
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

    MySQLConfig config = default_config();

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

                if (strcmp((char*)spring_key->data.scalar.value, "datasource") == 0 && spring_value->type == YAML_MAPPING_NODE) {
                    yaml_node_pair_t *ds_pair = spring_value->data.mapping.pairs.start;
                    for (; ds_pair < spring_value->data.mapping.pairs.top; ds_pair++) {
                        yaml_node_t *ds_key = yaml_document_get_node(&document, ds_pair->key);
                        yaml_node_t *ds_value = yaml_document_get_node(&document, ds_pair->value);

                        if (!ds_key || !ds_value || ds_key->type != YAML_SCALAR_NODE) continue;

                        if (strcmp((char*)ds_key->data.scalar.value, "primary") == 0 && ds_value->type == YAML_MAPPING_NODE) {
                            yaml_node_pair_t *primary_pair = ds_value->data.mapping.pairs.start;
                            for (; primary_pair < ds_value->data.mapping.pairs.top; primary_pair++) {
                                yaml_node_t *primary_key = yaml_document_get_node(&document, primary_pair->key);
                                yaml_node_t *primary_value = yaml_document_get_node(&document, primary_pair->value);

                                if (!primary_key || !primary_value || primary_key->type != YAML_SCALAR_NODE) continue;

                                char key_str[64];
                                strncpy(key_str, (char*)primary_key->data.scalar.value, sizeof(key_str) - 1);
                                char value_str[256];
                                strncpy(value_str, (char*)primary_value->data.scalar.value, sizeof(value_str) - 1);
                                trim_whitespace(value_str);

                                if (strcmp(key_str, "url") == 0) {
                                    extract_jdbc_url(value_str, &config);
                                } else if (strcmp(key_str, "username") == 0) {
                                    strncpy(config.user, value_str, sizeof(config.user) - 1);
                                } else if (strcmp(key_str, "password") == 0) {
                                    strncpy(config.password, value_str, sizeof(config.password) - 1);
                                } else if (strcmp(key_str, "maximum-pool-size") == 0) {
                                    config.max_pool_size = atoi(value_str);
                                } else if (strcmp(key_str, "minimum-idle") == 0) {
                                    config.min_idle = atoi(value_str);
                                } else if (strcmp(key_str, "idle-timeout") == 0) {
                                    config.idle_timeout = atoi(value_str);
                                } else if (strcmp(key_str, "connection-timeout") == 0) {
                                    config.connection_timeout = atoi(value_str);
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

MySQLUtil* mysql_util_new(const char *config_file) {
    MySQLUtil *util = (MySQLUtil*)malloc(sizeof(MySQLUtil));
    if (!util) return NULL;

    util->config = load_mysql_config(config_file);

    util->conn = mysql_init(NULL);
    if (!util->conn) {
        printf("MySQL initialization failed\n");
        free(util);
        return NULL;
    }

    unsigned int timeout = util->config.connection_timeout / 1000;
    mysql_options(util->conn, MYSQL_OPT_CONNECT_TIMEOUT, &timeout);

    if (!mysql_real_connect(util->conn,
                            util->config.host,
                            util->config.user,
                            util->config.password,
                            util->config.database,
                            util->config.port,
                            NULL,
                            0)) {
        printf("MySQL connection failed: %s\n", mysql_error(util->conn));
        mysql_close(util->conn);
        free(util);
        return NULL;
    }

    mysql_set_character_set(util->conn, "utf8mb4");

    return util;
}

int mysql_execute_update(MySQLUtil *util, const char *sql) {
    if (!util || !util->conn || !sql) return -1;

    if (mysql_query(util->conn, sql) != 0) {
        printf("MySQL query error: %s\n", mysql_error(util->conn));
        return -1;
    }

    return mysql_affected_rows(util->conn);
}

int mysql_execute_query(MySQLUtil *util, const char *sql, char ***results, int *row_count, int *col_count) {
    *results = NULL;
    *row_count = 0;
    *col_count = 0;

    if (!util || !util->conn || !sql) return -1;

    if (mysql_query(util->conn, sql) != 0) {
        printf("MySQL query error: %s\n", mysql_error(util->conn));
        return -1;
    }

    MYSQL_RES *result = mysql_store_result(util->conn);
    if (!result) {
        printf("MySQL store result error: %s\n", mysql_error(util->conn));
        return -1;
    }

    *col_count = mysql_num_fields(result);
    *row_count = mysql_num_rows(result);

    if (*row_count == 0) {
        mysql_free_result(result);
        return 0;
    }

    size_t alloc_size = (*row_count) * (*col_count) * sizeof(char*);
    *results = (char**)malloc(alloc_size);
    if (!*results) {
        mysql_free_result(result);
        return -1;
    }

    MYSQL_ROW row;
    int row_idx = 0;
    while ((row = mysql_fetch_row(result)) != NULL) {
        for (int i = 0; i < *col_count; i++) {
            if (row[i]) {
                (*results)[row_idx * (*col_count) + i] = strdup(row[i]);
            } else {
                (*results)[row_idx * (*col_count) + i] = strdup("");
            }
        }
        row_idx++;
    }

    mysql_free_result(result);
    return 0;
}

char* mysql_execute_scalar(MySQLUtil *util, const char *sql) {
    char **results = NULL;
    int row_count = 0;
    int col_count = 0;

    int ret = mysql_execute_query(util, sql, &results, &row_count, &col_count);
    if (ret != 0 || row_count == 0 || col_count == 0) {
        return NULL;
    }

    char *value = strdup(results[0]);
    mysql_free_results(results, row_count, col_count);
    return value;
}

int mysql_execute(MySQLUtil *util, const char *sql) {
    if (!util || !util->conn || !sql) return -1;

    return mysql_query(util->conn, sql) == 0 ? 0 : -1;
}

int mysql_execute_batch(MySQLUtil *util, const char **sql_list, int count) {
    if (!util || !util->conn || !sql_list || count <= 0) return -1;

    int success_count = 0;

    for (int i = 0; i < count; i++) {
        if (mysql_query(util->conn, sql_list[i]) == 0) {
            success_count++;
        } else {
            printf("Batch SQL error at index %d: %s\n", i, mysql_error(util->conn));
            if (mysql_commit(util->conn) != 0) {
                printf("MySQL commit error: %s\n", mysql_error(util->conn));
            }
        }
    }

    if (mysql_commit(util->conn) != 0) {
        printf("MySQL commit error: %s\n", mysql_error(util->conn));
    }

    return success_count;
}

void mysql_free_results(char **results, int row_count, int col_count) {
    if (!results) return;

    for (int i = 0; i < row_count * col_count; i++) {
        if (results[i]) {
            free(results[i]);
        }
    }
    free(results);
}

void mysql_util_free(MySQLUtil *util) {
    if (util) {
        if (util->conn) {
            mysql_close(util->conn);
        }
        free(util);
    }
}