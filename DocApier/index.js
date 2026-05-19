const http = require('http');
const handleRequest = require('./Src/router');
const { createLogger } = require('../utils/logger');
const logger = createLogger('DocApier');

const PORT = 726;

const server = http.createServer(handleRequest).listen(PORT, async () => {
  await logger.info(`APIBay 管理后台运行在端口 ${PORT}`);
  await logger.info(`Web: http://localhost:${PORT}/`);
  await logger.info(`Elua: ${require('./Src/config').Elua}`);
  await logger.info(`Data path: ${require('./Src/storage').dataPath}`);
  await logger.info('功能: API文档 + 测试 + 路由 + 进程管理');
  require('./Src/router').initAutoStart();
});

module.exports = server;