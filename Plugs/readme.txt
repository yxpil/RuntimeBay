插件目录 (RunTimeBay 可将插件解压后放到此目录)

========================================
内置插件列表
========================================

Base_Logs (端口: 727，MANAGER_PORT+1)
  统一日志服务器
  - 收集所有服务的日志
  - 日志文件保存在 logs/ 目录下 (按模块名分文件，如 Router.log)
  - API 接口:
    * GET/POST /generate-token  - 生成访问令牌
    * POST       /validate-token - 验证令牌
    * POST       /invalidate-token - 作废令牌
    * POST       /log            - 写入日志 (需 token)
    * POST       /logs           - 获取日志列表 (需 token)
    * GET        /stats          - 获取统计信息
    * POST       /clear           - 清理日志 (需 token)

Base_view (端口: 728，MANAGER_PORT+2)
  静态文件服务器
  - 托管所有静态资源
  - 访问路径: http://localhost:728/
  - 静态文件放在 static/ 目录下
  - API 路径前缀: /api/

Base_map (端口: 729，MANAGER_PORT+3)
  站点地图服务
  - 提供 robots.txt 和 sitemap.xml
  - 数据持久化在 sitemaps/ 目录 (每个模块一个 JSON 文件)
  - API 接口:
    * GET/POST /generate-token  - 生成访问令牌
    * POST       /register       - 注册站点地图 (需 token)
    * POST       /add-entry      - 添加 URL 条目 (需 token)
    * POST       /unregister     - 取消注册 (需 token)
    * GET        /               - 返回 robots.txt
    * GET        /sitemap.xml    - 返回站点地图 XML
    * POST       /list           - 列出所有站点地图
    * POST       /get            - 获取指定模块站点地图
    * GET        /stats          - 获取统计信息
    * POST       /clear          - 清空条目 (需 token)

端口说明:
  管理器启动插件时会设置环境变量 MANAGER_PORT=726，内置插件按偏移量分配端口:
    Base_Logs  -> 726 + 1 = 727
    Base_view  -> 726 + 2 = 728
    Base_map   -> 726 + 3 = 729
  若未设置 MANAGER_PORT，则使用上述默认端口。

========================================
插件目录结构
========================================

每个插件是一个独立子目录，必须包含:

  MyPlugin/
    index.js      插件主入口 (Node.js HTTP 服务)
    info.plug     插件元信息配置

可选目录/文件 (按业务需要):
    static/       静态资源 (Base_view 模式)
    logs/         本地日志 (不推荐，应使用 Base_Logs)
    sitemaps/     站点地图数据 (由 Base_map 管理，插件无需自建)

========================================
info.plug 配置格式
========================================

采用 key: value 格式，每行一项:

  name: 插件显示名称
  version: 1.0.0
  description: 插件功能描述
  port: 730
  autostart: true

字段说明:
  name         - 在管理后台显示的名称
  version      - 版本号 (可选)
  description  - 描述 (可选)
  port         - 预期监听端口，仅用于管理界面展示；实际端口需在 index.js 中自行 listen
  autostart    - 设为 true 时，DocApier 启动后会自动执行 node index.js
                 (也支持旧字段 auto: true)

示例 info.plug:

  name: 我的业务插件
  version: 1.0.0
  description: 提供某某 API
  port: 730
  autostart: false

========================================
插件编写规范 (index.js)
========================================

1. 使用 Node.js 内置 http 模块创建 HTTP 服务
2. 监听端口建议:
     const PORT = process.env.MANAGER_PORT
       ? parseInt(process.env.MANAGER_PORT) + N   // N 为自定义偏移，避免与 727/728/729 冲突
       : 730;                                      // 或直接写死默认端口
3. 处理 OPTIONS 预检，设置 CORS 头 (参考 Base_Logs)
4. 返回 JSON 时 Content-Type 设为 application/json
5. 插件进程由管理器 spawn 启动，工作目录 (cwd) 为插件目录本身

最小可运行模板:

  const http = require('http');

  const PORT = process.env.MANAGER_PORT
    ? parseInt(process.env.MANAGER_PORT) + 10
    : 730;

  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ code: 200, status: 'ok' }));
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ code: 404, message: 'Not Found' }));
  });

  server.listen(PORT, () => {
    console.log(`MyPlugin 运行在端口 ${PORT}`);
  });

========================================
如何注册插件
========================================

「注册」在本项目中指: 让系统识别并能启动、管理你的插件，分三步:

【步骤 1】放入插件目录
  将插件文件夹 (含 index.js 和 info.plug) 复制到:
    RunTimeBay_Ver2.0_RS/Plugs/你的插件名/

  文件夹名即为插件 ID，管理 API 均使用此名称。

【步骤 2】配置自启动 (可选)
  在 info.plug 中设置:
    autostart: true
  DocApier (端口 726) 启动时会自动调用 initAutoStart() 拉起该插件。

【步骤 3】通过管理后台启停
  浏览器打开: http://localhost:726/
  在「服务进程管理」中查看 Plugs 列表，可启动/停止/重启插件。

  或通过 HTTP API (需管理后台登录 token):

    GET  http://localhost:726/Plugs?pwd=<token>
         列出所有插件及运行状态

    POST http://localhost:726/PlugStart
         Body: { "name": "你的插件名" }

    POST http://localhost:726/PlugStop
         Body: { "name": "你的插件名" }

    POST http://localhost:726/PlugRestart
         Body: { "name": "你的插件名" }

【步骤 4】接入网关 Router (可选)
  若需通过统一入口 8081 访问插件，编辑 Router/router.router，添加路由:

    From 127.0.0.1:730 TO /my-api

  表示: 访问 http://localhost:8081/my-api 会转发到插件 730 端口。

  内置示例:
    From 127.0.0.1:728 TO /          (静态站)
    From 127.0.0.1:729 TO /robots.txt
    From 127.0.0.1:729/sitemap.xml TO /sitemap.xml

========================================
如何调用日志服务器 (Base_Logs)
========================================

推荐方式: 使用项目提供的 utils/logger.js 封装 (与 Router、DocApier 相同用法)。

【方式 A】在插件或服务代码中使用 createLogger

  const { createLogger } = require('../utils/logger');   // 路径按实际相对位置调整
  const logger = createLogger('MyPlugin');               // 模块名，对应 logs/MyPlugin.log

  // 以下方法均为 async，可按需 await
  await logger.info('服务已启动');
  await logger.warn('配置缺失', { key: 'foo' });
  await logger.error('处理失败', { err: 'timeout' });
  await logger.debug('调试信息', { step: 1 });

  日志数据结构 (写入 Base_Logs):
    { level, message, data, timestamp }

  注意: 需先启动 Base_Logs 插件 (端口 727)，否则 logger 会静默失败。

【方式 B】直接调用 HTTP API

  1) 获取 token:
     curl http://localhost:727/generate-token

     响应: { "code": 200, "token": "xxxxxxxx" }

  2) 写入日志:
     curl -X POST "http://localhost:727/log?token=YOUR_TOKEN" \
       -H "Content-Type: application/json" \
       -d '{
         "module": "MyPlugin",
         "data": {
           "level": "INFO",
           "message": "用户登录",
           "data": { "userId": 123 },
           "timestamp": 1716000000000
         }
       }'

  3) 查询日志:
     curl -X POST "http://localhost:727/logs?token=YOUR_TOKEN" \
       -H "Content-Type: application/json" \
       -d '{ "module": "MyPlugin" }'

     不传 module 则返回所有模块名列表。

  4) 查看统计:
     curl http://localhost:727/stats

  5) 清理日志:
     curl -X POST "http://localhost:727/clear?token=YOUR_TOKEN" \
       -H "Content-Type: application/json" \
       -d '{ "module": "MyPlugin" }'

  本地文件路径: Plugs/Base_Logs/logs/<模块名>.log

========================================
如何更新站点地图 (Base_map)
========================================

推荐方式: 使用项目提供的 utils/map.js 封装。

【方式 A】在代码中使用 sitemap 助手

  const { sitemap } = require('../utils/map');   // 路径按实际相对位置调整

  // 1. 注册模块 (首次使用，创建空站点地图)
  await sitemap.register('MyPlugin');
  // 或带初始数据:
  await sitemap.register('MyPlugin', {
    name: 'MyPlugin',
    entries: [],
    createdAt: Date.now()
  });

  // 2. 添加 URL 条目 (核心「更新」操作)
  await sitemap.addEntry('MyPlugin', {
    loc: 'https://example.com/page/1',
    lastmod: '2026-05-19',       // 可选，ISO 日期
    changefreq: 'weekly',        // 可选: always/hourly/daily/weekly/monthly/yearly/never
    priority: 0.8                // 可选，0.0 ~ 1.0
  });

  // 3. 查询
  const list = await sitemap.list();
  const detail = await sitemap.get('MyPlugin');           // JSON
  const xml = await sitemap.get('MyPlugin', 'xml');       // XML 字符串

  // 4. 清空条目 (保留注册)
  await sitemap.clear('MyPlugin');

  // 5. 完全注销模块
  await sitemap.unregister('MyPlugin');

  注意: 需先启动 Base_map 插件 (端口 729)。token 由 map.js 自动向 /generate-token 申请。

【方式 B】直接调用 HTTP API

  1) 获取 token:
     curl http://localhost:729/generate-token

  2) 注册站点地图:
     curl -X POST "http://localhost:729/register?token=YOUR_TOKEN" \
       -H "Content-Type: application/json" \
       -d '{ "module": "MyPlugin" }'

  3) 添加 URL (更新站点地图):
     curl -X POST "http://localhost:729/add-entry?token=YOUR_TOKEN" \
       -H "Content-Type: application/json" \
       -d '{
         "module": "MyPlugin",
         "entry": {
           "loc": "https://example.com/products/42",
           "lastmod": "2026-05-19",
           "changefreq": "daily",
           "priority": 0.9
         }
       }'

  4) 查看合并后的 XML (对外暴露):
     curl http://localhost:729/sitemap.xml
     或通过网关: curl http://localhost:8081/sitemap.xml

  5) 查看 robots.txt:
     curl http://localhost:729/
     或: curl http://localhost:8081/robots.txt

  6) 列出所有模块:
     curl -X POST http://localhost:729/list \
       -H "Content-Type: application/json" \
       -d '{}'

  7) 获取指定模块:
     curl -X POST http://localhost:729/get \
       -H "Content-Type: application/json" \
       -d '{ "module": "MyPlugin", "format": "xml" }'

  持久化文件: Plugs/Base_map/sitemaps/MyPlugin.json
  单模块最多 5000 条 URL，超出后保留最新条目。

========================================
完整插件示例 (含日志 + 站点地图)
========================================

目录: Plugs/Demo_Hello/

info.plug:
  name: 示例插件
  version: 1.0.0
  description: 演示日志与站点地图集成
  port: 730
  autostart: false

index.js 核心逻辑片段:

  const http = require('http');
  const path = require('path');
  const { createLogger } = require(path.join(__dirname, '../../utils/logger'));
  const { sitemap } = require(path.join(__dirname, '../../utils/map'));

  const logger = createLogger('Demo_Hello');
  const PORT = process.env.MANAGER_PORT ? parseInt(process.env.MANAGER_PORT) + 10 : 730;

  async function onBoot() {
    await logger.info('Demo_Hello 启动');
    await sitemap.register('Demo_Hello');
    await sitemap.addEntry('Demo_Hello', {
      loc: `http://localhost:${PORT}/`,
      changefreq: 'weekly',
      priority: 1.0
    });
  }

  http.createServer(async (req, res) => {
    if (req.url === '/hello') {
      await logger.info('收到 /hello 请求');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ code: 200, msg: 'hello' }));
      return;
    }
    res.writeHead(404);
    res.end();
  }).listen(PORT, () => {
    console.log(`Demo_Hello 端口 ${PORT}`);
    onBoot().catch(e => console.error(e));
  });

========================================
开发与调试建议
========================================

1. 先手动启动内置基础插件:
     DocApier 管理后台 -> 启动 Base_Logs、Base_map、Base_view
   或设置 info.plug 中 autostart: true 后重启 DocApier。

2. 启动顺序建议: Base_Logs -> Base_map -> Base_view -> 业务插件
   业务插件依赖日志/地图时，需确保基础服务已就绪。

3. 查看插件进程输出:
     POST http://localhost:726/PlugLogs  Body: { "name": "插件名" }

4. 自定义插件端口勿与 726/727/728/729/8081 冲突；新插件建议从 730 起。

5. token 仅在服务进程内存中有效，重启 Base_Logs / Base_map 后需重新 generate-token
   (utils/logger.js 和 utils/map.js 会在下次写日志/写地图时自动重新申请)。

========================================
相关文件索引
========================================

  Plugs/Base_Logs/index.js    日志服务实现
  Plugs/Base_map/index.js     站点地图服务实现
  Plugs/Base_view/index.js    静态文件服务实现
  utils/logger.js             日志客户端封装
  utils/map.js                站点地图客户端封装
  DocApier/Src/router.js      插件扫描、启停、自启动
  Router/router.router        网关路由配置
