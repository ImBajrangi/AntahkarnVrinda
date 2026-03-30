const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());

app.get('/api/identity', (req, res) => {
    res.json({ id: 'preview-node', name: 'Preview Studio' });
});

app.get('/api/peers', (req, res) => {
    res.json([
        { id: 'mobile-1', name: 'iPhone 15', type: 'phone', ip: '127.0.0.1', port: 3000 }
    ]);
});

app.get('/api/files', (req, res) => res.json([
    { id: 'f1', name: 'Design_Proposal_Antahkarn.pdf', path: 'f1', size: 2400000, lastModified: Date.now() - 3600000 },
    { id: 'f2', name: 'Video_Assets_Studio.mp4', path: 'f2', size: 154000000, lastModified: Date.now() - 86400000 }
]));

io.on('connection', (socket) => {
    console.log('[Socket] Connected');
});

server.listen(3000, '0.0.0.0', () => {
    console.log('API Server running on port 3000');
});
