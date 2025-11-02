const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 8000;

// MIME types for static files
const mimeTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon'
};

function serveStaticFile(res, filePath) {
    const ext = path.extname(filePath);
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    
    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('File not found');
            return;
        }
        
        res.writeHead(200, { 
            'Content-Type': contentType,
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        });
        res.end(data);
    });
}

function proxyRequest(req, res, targetUrl) {
    console.log(`Proxying request to: ${targetUrl}`);
    
    // Set a hard timeout on the response
    const responseTimeout = setTimeout(() => {
        console.error('Response timeout for:', targetUrl);
        if (!res.headersSent) {
            res.writeHead(504, { 'Content-Type': 'text/plain' });
            res.end('Request timeout - took longer than 3 seconds');
        }
    }, 3000);
    
    const options = {
        method: req.method,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/x-protobuf, application/json, */*',
            'Accept-Encoding': 'gzip, deflate, br'
        },
        timeout: 3000 // 3 second timeout
    };
    
    const protocol = targetUrl.startsWith('https:') ? https : http;
    
    const proxyReq = protocol.request(targetUrl, options, (proxyRes) => {
        clearTimeout(responseTimeout);
        
        // Set CORS headers
        res.writeHead(proxyRes.statusCode, {
            ...proxyRes.headers,
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        });
        
        proxyRes.pipe(res);
        
        proxyRes.on('end', () => {
            console.log('Completed request for:', targetUrl);
        });
    });
    
    // Add timeout handling
    proxyReq.on('timeout', () => {
        console.error('Proxy timeout for:', targetUrl);
        clearTimeout(responseTimeout);
        proxyReq.destroy();
        if (!res.headersSent) {
            res.writeHead(504, { 'Content-Type': 'text/plain' });
            res.end('Gateway timeout - request took too long');
        }
    });
    
    proxyReq.on('error', (err) => {
        console.error('Proxy error:', err);
        clearTimeout(responseTimeout);
        if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Proxy error: ' + err.message);
        }
    });
    
    if (req.method === 'POST') {
        req.pipe(proxyReq);
    } else {
        proxyReq.end();
    }
}

const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(200, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        });
        res.end();
        return;
    }
    
    // Proxy API requests to poe.ninja
    if (pathname.startsWith('/api/')) {
        const targetPath = pathname.substring(4); // Remove '/api' prefix
        const queryString = parsedUrl.search || '';
        const targetUrl = `https://poe.ninja${targetPath}${queryString}`;
        proxyRequest(req, res, targetUrl);
        return;
    }
    
    // Serve static files
    let filePath = pathname === '/' ? './index.html' : `.${pathname}`;
    
    // Security check - prevent directory traversal
    if (filePath.includes('..')) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden');
        return;
    }
    
    // Check if file exists
    fs.access(filePath, fs.constants.F_OK, (err) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('File not found');
            return;
        }
        
        serveStaticFile(res, filePath);
    });
});

server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`);
    console.log('API requests will be proxied to poe.ninja');
    console.log('Static files served from current directory');
});

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down server...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});