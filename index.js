const { spawn } = require('child_process');
const path = require('path');

const runtime = process.argv.includes('--bun') ? 'bun' : 'node';

const services = [
  { name: 'Router',    dir: 'Router',    port: 8081, color: '\x1b[36m' },
  { name: 'DocApier',  dir: 'DocApier',  port: 726,  color: '\x1b[35m' },
];

console.log('\x1b[33m%s\x1b[0m', '='.repeat(50));
console.log('\x1b[33m%s\x1b[0m', `  APIBay 服务启动器 (${runtime.toUpperCase()})`);
console.log('\x1b[33m%s\x1b[0m', '='.repeat(50));

services.forEach(svc => {
  const cwd = path.join(__dirname, svc.dir);
  const child = spawn(runtime, ['index.js'], { cwd, env: process.env });

  const prefix = `${svc.color}[${svc.name}]\x1b[0m`;

  child.stdout.on('data', (data) => {
    data.toString().split('\n').filter(Boolean).forEach(line => {
      console.log(`${prefix} ${line}`);
    });
  });

  child.stderr.on('data', (data) => {
    data.toString().split('\n').filter(Boolean).forEach(line => {
      console.log(`${prefix} \x1b[31m${line}\x1b[0m`);
    });
  });

  child.on('exit', (code) => {
    console.log(`${prefix} 退出, 代码: ${code}`);
  });
});

setTimeout(() => {
  console.log('\n\x1b[33m%s\x1b[0m', '='.repeat(50));
  console.log('  所有服务已启动!');
  console.log('  运行环境: \x1b[32m' + runtime.toUpperCase() + '\x1b[0m');
  console.log('  网关入口:  \x1b[36mhttp://localhost:8081/\x1b[0m');
  console.log('  管理后台:  \x1b[35mhttp://localhost:726/\x1b[0m');
  console.log('     ├─ API文档 + 测试');
  console.log('     ├─ 路由配置');
  console.log('     └─ 服务进程管理');
  console.log('\x1b[33m%s\x1b[0m', '='.repeat(50), '\n');
}, 1500);

process.on('SIGINT', () => {
  console.log('\n正在关闭所有服务...');
  process.exit(0);
});
