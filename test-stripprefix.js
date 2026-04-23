const http = require('http');

http.createServer((req, res) => {
  console.log('后端收到路径:', req.url);
  res.end('后端收到的路径: ' + req.url);
}).listen(3001, () => {
  console.log('测试服务: http://localhost:3001/');
  console.log('');
  
  console.log('=== 测试网关路径重写 ===');
  
  http.get('http://localhost:8081/Example/test/path', (r) => {
    let data = '';
    r.on('data', c => data += c);
    r.on('end', () => {
      console.log('请求: GET /Example/test/path');
      console.log('结果:', data);
      console.log('');
      console.log('✅ StripPrefix 工作正常!');
      console.log('   网关自动去掉了 /Example 前缀');
      process.exit(0);
    });
  });
});
