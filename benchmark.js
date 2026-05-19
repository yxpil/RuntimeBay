const http = require('http');

const TOTAL = 1000;
const CONCURRENT = 10;
const URL = 'http://localhost:8081/Example';

console.log('='.repeat(50));
console.log('  APIBay Router 并发性能测试');
console.log('='.repeat(50));
console.log(`  目标: ${URL}`);
console.log(`  总请求: ${TOTAL}`);
console.log(`  并发数: ${CONCURRENT}`);
console.log('='.repeat(50));
console.log('');

let success = 0, fail = 0, totalTime = 0, minTime = 99999, maxTime = 0;
let completed = 0;

async function doRequest() {
  return new Promise((resolve) => {
    const start = Date.now();
    const req = http.request(URL, (res) => {
      const time = Date.now() - start;
      if (res.statusCode < 500) success++; else fail++;
      totalTime += time;
      minTime = Math.min(minTime, time);
      maxTime = Math.max(maxTime, time);
      completed++;
      if (completed % 50 === 0) {
        process.stdout.write(`  进度: ${completed}/${TOTAL}\r`);
      }
      resolve();
    });
    req.on('error', () => {
      fail++;
      completed++;
      resolve();
    });
    req.end();
  });
}

async function runBench() {
  console.log('  开始压测...\n');
  
  const startTime = Date.now();
  
  for (let i = 0; i < TOTAL; i += CONCURRENT) {
    const batch = [];
    for (let c = 0; c < Math.min(CONCURRENT, TOTAL - i); c++) {
      batch.push(doRequest());
    }
    await Promise.all(batch);
  }
  
  const totalMs = Date.now() - startTime;
  const qps = Math.round(TOTAL / (totalMs / 1000));
  
  console.log('\n');
  console.log('='.repeat(50));
  console.log('  测试结果');
  console.log('='.repeat(50));
  console.log(`  ✅ 成功: ${success} 次`);
  console.log(`  ❌ 失败: ${fail} 次`);
  console.log(`  📊 成功率: ${Math.round(success/TOTAL*100)}%`);
  console.log('');
  console.log(`  ⚡ QPS: ${qps} 请求/秒`);
  console.log(`  ⏱️  总耗时: ${totalMs}ms`);
  console.log('');
  console.log(`  📈 平均响应: ${Math.round(totalTime/TOTAL)}ms`);
  console.log(`  🚀 最快: ${minTime}ms`);
  console.log(`  🐢 最慢: ${maxTime}ms`);
  console.log('='.repeat(50));
}

runBench();
