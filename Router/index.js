const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { createLogger } = require('../utils/logger');
const logger = createLogger('Router');

const isWindows = os.platform() === 'win32';
const CARGO_BIN = isWindows
  ? path.join(__dirname, 'target', 'release', 'router.exe')
  : path.join(__dirname, 'target', 'release', 'router');
const JS_FALLBACK = path.join(__dirname, 'old_index.js');
const CONFIG_FILE = path.join(__dirname, 'router.router');

let currentChild = null;
let restartAttempts = 0;
const maxRestartAttempts = 3;

async function buildIfNeeded() {
  if (!fs.existsSync(CARGO_BIN)) {
    await logger.info('Rust 二进制文件不存在，正在编译...');
    const cargoCmd = isWindows ? 'cargo.exe' : 'cargo';
    const result = spawnSync(cargoCmd, ['build', '--release'], {
      cwd: __dirname,
      stdio: 'inherit',
      timeout: 300000
    });
    if (result.status !== 0) {
      await logger.error('Rust 编译失败，将降级到 JS 版本');
      return false;
    }
    await logger.info('Rust 编译完成');
  }
  return true;
}

function killChild() {
  if (currentChild) {
    try {
      currentChild.kill('SIGINT');
    } catch (err) {
      logger.error('终止进程时出错:', { error: err.message });
    }
    currentChild = null;
  }
}

async function startRustProcess() {
  await logger.info('启动 Rust 版本...');

  const child = spawn(CARGO_BIN, [], {
    cwd: __dirname,
    stdio: 'inherit',
    env: { ...process.env }
  });

  currentChild = child;

  child.on('exit', (code, signal) => {
    logger.info(`Rust 进程退出，代码: ${code}, 信号: ${signal}`);

    if (currentChild === child) {
      currentChild = null;
    }

    if (signal !== 'SIGINT') {
      if (restartAttempts < maxRestartAttempts) {
        restartAttempts++;
        logger.info(`尝试重启 Rust 进程 (${restartAttempts}/${maxRestartAttempts})`);
        setTimeout(() => startRustProcess(), 2000);
      } else {
        logger.error('Rust 进程多次重启失败，将降级到 JS 版本');
        restartAttempts = 0;
        startJsFallback();
      }
    }
  });

  child.on('error', (err) => {
    logger.error(`Rust 进程启动失败: ${err.message}`);
    if (currentChild === child) {
      currentChild = null;
    }
    startJsFallback();
  });
}

async function startJsFallback() {
  if (!fs.existsSync(JS_FALLBACK)) {
    await logger.error('JS 降级版本不存在，无法启动');
    process.exit(1);
    return;
  }

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    🚨 性能降级模式 🚨                         ║');
  console.log('║                                                              ║');
  console.log('║   Rust 编译失败或不可用，当前使用 JavaScript 版本             ║');
  console.log('║   性能可能不如 Rust 版本，但功能完整                           ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  await logger.info('启动 JS 降级版本...');

  const child = spawn('node', [JS_FALLBACK], {
    cwd: __dirname,
    stdio: 'inherit',
    env: { ...process.env }
  });

  currentChild = child;

  child.on('exit', (code) => {
    logger.info(`JS 进程退出，代码: ${code}`);
    if (currentChild === child) {
      currentChild = null;
    }
    process.exit(code || 0);
  });
}

async function restartGateway() {
  await logger.info('检测到配置文件变更，重启网关...');
  restartAttempts = 0;
  killChild();

  setTimeout(async () => {
    const rustAvailable = await buildIfNeeded();
    if (rustAvailable) {
      await startRustProcess();
    } else {
      await startJsFallback();
    }
  }, 1000);
}

async function watchConfigFile() {
  if (fs.existsSync(CONFIG_FILE)) {
    fs.watch(CONFIG_FILE, async (eventType, filename) => {
      if (eventType === 'change') {
        await logger.info(`配置文件 ${filename} 已修改`);
        await restartGateway();
      }
    });
    await logger.info('已启动配置文件监听');
  } else {
    await logger.warn(`配置文件 ${CONFIG_FILE} 不存在，跳过监听`);
  }
}

async function start() {
  await watchConfigFile();

  const rustAvailable = await buildIfNeeded();

  if (rustAvailable) {
    try {
      await startRustProcess();
    } catch (err) {
      await logger.error(`Rust 进程启动异常: ${err.message}`);
      await startJsFallback();
    }
  } else {
    await startJsFallback();
  }
}

start();

process.on('SIGINT', async () => {
  await logger.info('收到中断信号，正在关闭...');
  killChild();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await logger.info('收到终止信号，正在关闭...');
  killChild();
  process.exit(0);
});