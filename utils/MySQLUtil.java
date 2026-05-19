package com.runtimebay.utils;

import org.yaml.snakeyaml.Yaml;

import java.io.FileInputStream;
import java.io.FileNotFoundException;
import java.io.InputStream;
import java.sql.*;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class MySQLUtil {
    private static String URL;
    private static String USERNAME;
    private static String PASSWORD;
    private static int MAX_POOL_SIZE;
    private static int MIN_IDLE;
    private static int IDLE_TIMEOUT;
    private static int CONNECTION_TIMEOUT;

    static {
        loadConfig();
    }

    private static void loadConfig() {
        try {
            Yaml yaml = new Yaml();
            InputStream inputStream = new FileInputStream("mysql.page");
            Map<String, Object> config = yaml.load(inputStream);

            Map<String, Object> spring = (Map<String, Object>) config.get("spring");
            Map<String, Object> datasource = (Map<String, Object>) spring.get("datasource");
            Map<String, Object> primary = (Map<String, Object>) datasource.get("primary");

            URL = (String) primary.get("url");
            USERNAME = (String) primary.get("username");
            PASSWORD = (String) primary.get("password");
            MAX_POOL_SIZE = (Integer) primary.getOrDefault("maximum-pool-size", 20);
            MIN_IDLE = (Integer) primary.getOrDefault("minimum-idle", 5);
            IDLE_TIMEOUT = (Integer) primary.getOrDefault("idle-timeout", 300000);
            CONNECTION_TIMEOUT = (Integer) primary.getOrDefault("connection-timeout", 20000);

            inputStream.close();
        } catch (FileNotFoundException e) {
            URL = "jdbc:mysql://127.0.0.1:3306/runtimebay?useUnicode=true&characterEncoding=utf8&useSSL=false&serverTimezone=Asia/Shanghai&rewriteBatchedStatements=true";
            USERNAME = "root";
            PASSWORD = "qipa1234";
            MAX_POOL_SIZE = 20;
            MIN_IDLE = 5;
            IDLE_TIMEOUT = 300000;
            CONNECTION_TIMEOUT = 20000;
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private static Connection getConnection() throws SQLException {
        return DriverManager.getConnection(URL, USERNAME, PASSWORD);
    }

    public static int executeUpdate(String sql, Object... params) {
        try (Connection conn = getConnection();
             PreparedStatement pstmt = conn.prepareStatement(sql)) {
            for (int i = 0; i < params.length; i++) {
                pstmt.setObject(i + 1, params[i]);
            }
            return pstmt.executeUpdate();
        } catch (SQLException e) {
            e.printStackTrace();
            return -1;
        }
    }

    public static List<Map<String, Object>> executeQuery(String sql, Object... params) {
        List<Map<String, Object>> resultList = new ArrayList<>();
        try (Connection conn = getConnection();
             PreparedStatement pstmt = conn.prepareStatement(sql)) {
            for (int i = 0; i < params.length; i++) {
                pstmt.setObject(i + 1, params[i]);
            }
            try (ResultSet rs = pstmt.executeQuery()) {
                ResultSetMetaData metaData = rs.getMetaData();
                int columnCount = metaData.getColumnCount();
                while (rs.next()) {
                    Map<String, Object> row = new HashMap<>();
                    for (int i = 1; i <= columnCount; i++) {
                        row.put(metaData.getColumnLabel(i), rs.getObject(i));
                    }
                    resultList.add(row);
                }
            }
        } catch (SQLException e) {
            e.printStackTrace();
        }
        return resultList;
    }

    public static Object executeScalar(String sql, Object... params) {
        try (Connection conn = getConnection();
             PreparedStatement pstmt = conn.prepareStatement(sql)) {
            for (int i = 0; i < params.length; i++) {
                pstmt.setObject(i + 1, params[i]);
            }
            try (ResultSet rs = pstmt.executeQuery()) {
                if (rs.next()) {
                    return rs.getObject(1);
                }
            }
        } catch (SQLException e) {
            e.printStackTrace();
        }
        return null;
    }

    public static boolean execute(String sql) {
        try (Connection conn = getConnection();
             Statement stmt = conn.createStatement()) {
            return stmt.execute(sql);
        } catch (SQLException e) {
            e.printStackTrace();
            return false;
        }
    }

    public static int[] executeBatch(List<String> sqlList) {
        try (Connection conn = getConnection();
             Statement stmt = conn.createStatement()) {
            for (String sql : sqlList) {
                stmt.addBatch(sql);
            }
            return stmt.executeBatch();
        } catch (SQLException e) {
            e.printStackTrace();
            return new int[0];
        }
    }
}