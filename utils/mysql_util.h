#ifndef MYSQL_UTIL_H
#define MYSQL_UTIL_H

#include <mysql/mysql.h>
#include <yaml.h>
#include <string.h>
#include <stdlib.h>

typedef struct {
    char host[64];
    int port;
    char user[64];
    char password[128];
    char database[64];
    int max_pool_size;
    int min_idle;
    int idle_timeout;
    int connection_timeout;
} MySQLConfig;

typedef struct {
    MYSQL *conn;
    MySQLConfig config;
} MySQLUtil;

MySQLConfig load_mysql_config(const char *config_file);

MySQLUtil* mysql_util_new(const char *config_file);

int mysql_execute_update(MySQLUtil *util, const char *sql);

int mysql_execute_query(MySQLUtil *util, const char *sql, char ***results, int *row_count, int *col_count);

char* mysql_execute_scalar(MySQLUtil *util, const char *sql);

int mysql_execute(MySQLUtil *util, const char *sql);

int mysql_execute_batch(MySQLUtil *util, const char **sql_list, int count);

void mysql_free_results(char **results, int row_count, int col_count);

void mysql_util_free(MySQLUtil *util);

#endif