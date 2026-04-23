const http = require('http');
const handleRequest = require('./Src/router');

const PORT = 726;

const server = http.createServer(handleRequest).listen(PORT, () => {
  console.log('[DocApier] APIBay 管理后台运行在端口', PORT);
  console.log('[DocApier] Web: http://localhost:' + PORT + '/');
  console.log('[DocApier] Elua:', require('./Src/config').Elua);
  console.log('[DocApier] Data path:', require('./Src/storage').dataPath);
  console.log('[DocApier] 功能: API文档 + 测试 + 路由 + 进程管理');
  require('./Src/router').initAutoStart();
});

module.exports = server;