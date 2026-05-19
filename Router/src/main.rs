use hyper::service::{make_service_fn, service_fn};
use hyper::{Request, Response, Server, Uri};
use hyper::{Body, Method, StatusCode, header};
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::sync::Arc;

struct Route {
    path: String,
    target_host: String,
    target_port: u16,
    target_path: String,
}

struct Config {
    port: u16,
    error_pages_config: HashMap<String, String>,
    routes: Vec<Route>,
}

fn load_config() -> Config {
    let config_path = "router.router";
    let content = fs::read_to_string(config_path).unwrap_or_default();

    let mut config = Config {
        port: 8081,
        error_pages_config: HashMap::new(),
        routes: Vec::new(),
    };

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        if trimmed.starts_with("port:") {
            if let Some(port_str) = trimmed.split(':').nth(1) {
                config.port = port_str.trim().parse().unwrap_or(8081);
            }
        } else if trimmed.contains(':') && !trimmed.starts_with("From") {
            let parts: Vec<&str> = trimmed.splitn(2, ':').collect();
            if parts.len() >= 2 {
                let key = parts[0].trim().to_string();
                let value = parts[1].trim().to_string();
                config.error_pages_config.insert(key, value);
            }
        } else if trimmed.starts_with("From") {
            if let Some(caps) = regex::Regex::new(r"From\s+([^\s]+)\s+TO\s+(\S+)").unwrap().captures(trimmed) {
                let target = caps[1].trim();
                let route_path = caps[2].to_string();

                let target_re = regex::Regex::new(r"^([^:]+):(\d+)(\/.*)?$").unwrap();
                if let Some(target_caps) = target_re.captures(target) {
                    let target_host = target_caps[1].to_string();
                    let target_port: u16 = target_caps[2].parse().unwrap_or(80);
                    let target_path = target_caps.get(3).map(|m| m.as_str().to_string()).unwrap_or_default();

                    config.routes.push(Route {
                        path: route_path,
                        target_host,
                        target_port,
                        target_path,
                    });
                } else {
                    config.routes.push(Route {
                        path: route_path,
                        target_host: target.to_string(),
                        target_port: 80,
                        target_path: String::new(),
                    });
                }
            }
        }
    }

    config
}

fn load_error_pages(config: &Config) -> HashMap<String, Vec<u8>> {
    let mut cache = HashMap::new();
    let error_pages_dir = config.error_pages_config.get("ErrorPages").map(|s| s.as_str()).unwrap_or("ErrorPages");

    for code in ["404", "500"] {
        let default_page = format!("{}.html", code);
        let page_name = config.error_pages_config.get(code).map(|s| s.as_str()).unwrap_or(default_page.as_str());
        let page_path_str = format!("{}/{}", error_pages_dir, page_name);
        let page_path = Path::new(&page_path_str);

        if page_path.exists() {
            if let Ok(content) = fs::read(page_path) {
                cache.insert(code.to_string(), content);
                println!("  错误页: {}.html -> 已缓存到内存", code);
            }
        }
    }

    cache
}

async fn proxy_request(req: Request<Body>, target_host: &str, target_port: u16, strip_path: &str, target_path: &str) -> Result<Response<Body>, hyper::Error> {
    let uri = req.uri().clone();
    let path_and_query = uri.path_and_query().map(|pq| pq.as_str()).unwrap_or("/");

    let new_path: String = if !strip_path.is_empty() && strip_path != "/" && path_and_query.starts_with(strip_path) {
        let rest = &path_and_query[strip_path.len()..];
        if rest.is_empty() { "/" } else { rest }.to_string()
    } else {
        path_and_query.to_string()
    };

    let final_path: String = if !target_path.is_empty() {
        if new_path == "/" {
            target_path.to_string()
        } else {
            format!("{}{}", target_path, new_path)
        }
    } else {
        new_path
    };

    let target_uri = format!("http://{}:{}{}", target_host, target_port, final_path)
        .parse::<Uri>()
        .expect("Invalid target URI");

    let mut req_builder = Request::builder()
        .method(req.method())
        .uri(target_uri.clone());

    let headers = req_builder.headers_mut().unwrap();
    for (key, value) in req.headers() {
        headers.insert(key, value.clone());
    }

    let forwarded_for = req.headers().get("x-forwarded-for").map(|h| h.to_str().unwrap_or("unknown")).unwrap_or("unknown");
    let host = req.headers().get("host").map(|h| h.to_str().unwrap_or("localhost")).unwrap_or("localhost");

    headers.insert("host", format!("{}:{}", target_host, target_port).parse().unwrap());
    headers.insert("x-forwarded-for", forwarded_for.parse().unwrap());
    headers.insert("x-forwarded-proto", "http".parse().unwrap());
    headers.insert("x-forwarded-host", host.parse().unwrap());
    headers.insert("connection", "close".parse().unwrap());

    let client = hyper::Client::new();
    client.request(req_builder.body(req.into_body()).unwrap()).await
}

fn get_error_response(error_code: &str, error_pages: &HashMap<String, Vec<u8>>, is_dev: bool) -> Response<Body> {
    let body = error_pages.get(error_code).cloned().unwrap_or_else(|| {
        if error_code == "500" {
            "<center style=\"margin-top:100px\"><h1>500 Internal Server Error</h1><p>APIBay Router - Backend Service Error</p></center>".as_bytes().to_vec()
        } else {
            "<center style=\"margin-top:100px\"><h1>404 Not Found</h1><p>APIBay Router</p></center>".as_bytes().to_vec()
        }
    });

    let status_code = if error_code == "500" {
        StatusCode::INTERNAL_SERVER_ERROR
    } else {
        StatusCode::NOT_FOUND
    };

    let mut resp = Response::builder()
        .status(status_code)
        .header(header::CONTENT_TYPE, "text/html");

    if is_dev {
        resp = resp
            .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
            .header(header::ACCESS_CONTROL_ALLOW_METHODS, "GET, POST, PUT, DELETE, OPTIONS")
            .header(header::ACCESS_CONTROL_ALLOW_HEADERS, "*");
    }

    resp.body(Body::from(body)).unwrap()
}

async fn handle_request(
    req: Request<Body>,
    routes: Arc<Vec<Route>>,
    error_pages: Arc<HashMap<String, Vec<u8>>>,
    is_dev: bool
) -> Result<Response<Body>, hyper::Error> {
    let pathname = req.uri().path();

    let mut matched = None;
    let mut max_len = 0;

    for route in routes.iter() {
        if pathname.starts_with(&route.path) && route.path.len() > max_len {
            matched = Some(route.clone());
            max_len = route.path.len();
        }
    }

    if let Some(route) = matched {
        match proxy_request(req, &route.target_host, route.target_port, &route.path, &route.target_path).await {
            Ok(mut res) => {
                let status = res.status();

                if status == StatusCode::INTERNAL_SERVER_ERROR {
                    println!("[Router] 检测到后端服务返回 500 错误，路由: {} -> {}:{}{}", route.path, route.target_host, route.target_port, route.target_path);
                    return Ok(get_error_response("500", &error_pages, is_dev));
                }

                if status == StatusCode::NOT_FOUND {
                    println!("[Router] 检测到后端服务返回 404 错误，路由: {} -> {}:{}{}", route.path, route.target_host, route.target_port, route.target_path);
                    return Ok(get_error_response("404", &error_pages, is_dev));
                }

                if is_dev {
                    let headers = res.headers_mut();
                    headers.insert(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*".parse().unwrap());
                    headers.insert(header::ACCESS_CONTROL_ALLOW_METHODS, "GET, POST, PUT, DELETE, OPTIONS".parse().unwrap());
                    headers.insert(header::ACCESS_CONTROL_ALLOW_HEADERS, "*".parse().unwrap());
                }
                Ok(res)
            }
            Err(e) => {
                println!("[Router] 代理请求失败: {} -> {}:{}{}: {}", route.path, route.target_host, route.target_port, route.target_path, e);
                Ok(get_error_response("500", &error_pages, is_dev))
            }
        }
    } else {
        Ok(get_error_response("404", &error_pages, is_dev))
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let config = load_config();
    let error_pages = load_error_pages(&config);

    println!("Router 配置加载完成");
    for route in &config.routes {
        println!("  路由: {} -> {}:{}{}", route.path, route.target_host, route.target_port, route.target_path);
    }

    let is_dev = std::env::var("NODE_ENV").unwrap_or_default() == "development";

    let route_count = config.routes.len();
    let routes = Arc::new(config.routes);
    let error_pages = Arc::new(error_pages);

    let make_svc = make_service_fn(move |_| {
        let routes = routes.clone();
        let error_pages = error_pages.clone();
        async move {
            Ok::<_, hyper::Error>(service_fn(move |req| {
                let routes = routes.clone();
                let error_pages = error_pages.clone();
                async move {
                    if req.method() == Method::OPTIONS {
                        let mut resp = Response::builder()
                            .status(StatusCode::NO_CONTENT);
                        if is_dev {
                            resp = resp
                                .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
                                .header(header::ACCESS_CONTROL_ALLOW_METHODS, "GET, POST, PUT, DELETE, OPTIONS")
                                .header(header::ACCESS_CONTROL_ALLOW_HEADERS, "*");
                        }
                        Ok(resp.body(Body::empty()).unwrap())
                    } else {
                        handle_request(req, routes, error_pages, is_dev).await
                    }
                }
            }))
        }
    });

    let addr = format!("0.0.0.0:{}", config.port).parse().unwrap();
    let server = Server::bind(&addr).serve(make_svc);

    println!("Router 运行在端口 {} [{}]", config.port, if is_dev { "DEV 开发模式" } else { "PROD 生产模式" });
    println!("网关入口: http://localhost:{}/", config.port);
    println!("CORS 跨域: {}", if is_dev { "✅ 已开启 (*)" } else { "❌ 已关闭" });
    println!("已加载 {} 条路由规则", route_count);
    println!("热重载: ✅ 配置文件变更自动生效");

    server.await?;

    Ok(())
}
