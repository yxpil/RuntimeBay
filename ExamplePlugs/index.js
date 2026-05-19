const http = require('http');
const PORT = 3001;

http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ name: 'Server1', time: new Date().toISOString() }));
}).listen(PORT, () => {
  console.log(`Server1 运行在端口 ${PORT}`);
  console.log(`访问: http://localhost:${PORT}/`);
});
