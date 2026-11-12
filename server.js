const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const FILE = path.join(__dirname, 'index.html');

const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/index.html') {
    fs.readFile(FILE, (err, data) => {
      if (err) {
        res.writeHead(500);
        res.end('Myanmar Weather server error');
        return;
      }

      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8'
      });
      res.end(data);
    });
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Myanmar Weather running on port ${PORT}`);
});
