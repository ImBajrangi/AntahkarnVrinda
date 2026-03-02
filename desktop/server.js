const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const crypto = require('crypto');
const { Server } = require('socket.io');
const { Bonjour } = require('bonjour-service');

const MACHINE_ID = crypto.randomUUID();
const DEVICE_NAME = os.hostname();

function startServer(uploadsDir, staticDistDir, port = 3000) {
    const app = express();
    const server = http.createServer(app);
    const io = new Server(server, { cors: { origin: '*' } });
    const bonjour = new Bonjour();

    // Ensure uploads directory exists
    if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
    }

    // Middleware
    app.use(cors());
    app.use(express.json());

    // === 1. SIGNALING via Socket.io ===

    // Track connected peers
    const activeTransfers = new Map();

    io.on('connection', (socket) => {
        console.log(`[Socket] New connection from ${socket.id}`);

        // When a peer asks for a transfer
        socket.on('transfer_request', (data, callback) => {
            // data: { fromId, fromName, filesCount, totalSize }
            console.log(`[Socket] Incoming transfer request from ${data.fromName}`);

            // In a real app we might prompt the user here. For now, auto-accept.
            const transferId = crypto.randomUUID();
            activeTransfers.set(transferId, { status: 'accepted', from: data.fromId });

            callback({ status: 'accepted', transferId });
        });

        socket.on('disconnect', () => {
            console.log(`[Socket] Disconnected: ${socket.id}`);
        });
    });

    // === 2. FILE TRANSFER over Express ===

    const storage = multer.diskStorage({
        destination: (req, file, cb) => {
            let destPath = uploadsDir;
            if (req.body.relativePath) {
                const dirPath = path.dirname(req.body.relativePath);
                if (dirPath !== '.') {
                    destPath = path.join(uploadsDir, dirPath);
                    if (!fs.existsSync(destPath)) {
                        fs.mkdirSync(destPath, { recursive: true });
                    }
                }
            }
            cb(null, destPath);
        },
        filename: (req, file, cb) => {
            cb(null, file.originalname);
        }
    });

    const upload = multer({ storage });

    // Upload endpoint (receives pushed files from a peer)
    app.post('/api/p2p/upload', upload.array('files'), (req, res) => {
        const transferId = req.headers['x-transfer-id'];

        if (!transferId || !activeTransfers.has(transferId)) {
            return res.status(403).json({ error: 'Unauthorized manual transfer' });
        }

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No files uploaded' });
        }

        activeTransfers.delete(transferId); // cleanup

        res.json({
            message: `Successfully received ${req.files.length} file(s)`,
            files: req.files.map(f => f.originalname)
        });

        // Notify the UI that new files arrived
        io.emit('files_updated');
    });

    function getAllFiles(dirPath, arrayOfFiles = []) {
        if (!fs.existsSync(dirPath)) return arrayOfFiles;
        const files = fs.readdirSync(dirPath);
        files.forEach((file) => {
            if (file.startsWith('.')) return;
            const fullPath = path.join(dirPath, file);
            if (fs.statSync(fullPath).isDirectory()) {
                arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
            } else {
                const stats = fs.statSync(fullPath);
                const relativePath = fullPath.replace(uploadsDir, '');
                arrayOfFiles.push({
                    id: relativePath,
                    name: file,
                    path: relativePath,
                    size: stats.size,
                    lastModified: stats.mtime
                });
            }
        });

        return arrayOfFiles;
    }

    app.get('/api/files', (req, res) => {
        try { res.json(getAllFiles(uploadsDir)); }
        catch (e) { res.status(500).json({ error: 'Failed to list files' }); }
    });

    app.get('/api/download', (req, res) => {
        const filepath = req.query.path;
        if (!filepath) return res.status(400).json({ error: 'Required' });
        const normalizedPath = path.normalize(filepath).replace(/^(\.\.(\/|\\|$))+/, '');
        const absolutePath = path.join(uploadsDir, normalizedPath);
        if (!absolutePath.startsWith(uploadsDir)) return res.status(403).json({ error: 'Invalid' });
        if (fs.existsSync(absolutePath)) res.download(absolutePath);
        else res.status(404).json({ error: 'Not found' });
    });

    app.delete('/api/files', (req, res) => {
        const filepath = req.query.path;
        if (!filepath) return res.status(400).json({ error: 'Required' });
        const normalizedPath = path.normalize(filepath).replace(/^(\.\.(\/|\\|$))+/, '');
        const absolutePath = path.join(uploadsDir, normalizedPath);
        if (!absolutePath.startsWith(uploadsDir)) return res.status(403).json({ error: 'Invalid' });

        try {
            if (fs.existsSync(absolutePath)) {
                fs.unlinkSync(absolutePath);
                const dirPath = path.dirname(absolutePath);
                if (dirPath !== uploadsDir && fs.readdirSync(dirPath).length === 0) {
                    fs.rmdirSync(dirPath);
                }
                io.emit('files_updated'); // tell ui
                res.json({ message: 'Deleted' });
            } else res.status(404).json({ error: 'Not found' });
        } catch (e) { res.status(500).json({ error: 'Failed' }); }
    });

    // Endpoint for the React UI to get its own identity info
    app.get('/api/identity', (req, res) => {
        res.json({ id: MACHINE_ID, name: DEVICE_NAME });
    });

    // Serve static frontend
    if (fs.existsSync(staticDistDir)) {
        app.use(express.static(staticDistDir));
        app.use((req, res) => {
            res.sendFile(path.join(staticDistDir, 'index.html'));
        });
    }

    return new Promise((resolve, reject) => {
        server.listen(port, '0.0.0.0', () => {
            console.log(`HTTP/WS Server running on port ${port}`);

            // === 3. DISCOVERY via mDNS ===
            console.log(`[mDNS] Broadcasting service _localshare._tcp on port ${port}`);
            bonjour.publish({
                name: `LocalShare Network - ${DEVICE_NAME}-${MACHINE_ID.substring(0, 4)}`,
                type: 'localshare',
                port: port,
                txt: { id: MACHINE_ID, type: 'desktop', deviceName: DEVICE_NAME }
            });

            // Provide a clean programmatic way to scan for peers
            app.get('/api/peers', (req, res) => {
                const browser = bonjour.find({ type: 'localshare' });
                const peers = [];

                // Wait 2 seconds for responses 
                setTimeout(() => {
                    browser.services.forEach(s => {
                        // Avoid self-discovery
                        const txtRecord = s.txt || {};
                        if (txtRecord.id && txtRecord.id !== MACHINE_ID) {
                            // extract the IP
                            const ip = s.addresses.find(a => a.includes('.')) || s.addresses[0];
                            peers.push({
                                id: txtRecord.id,
                                name: txtRecord.deviceName || s.host,
                                type: txtRecord.type || 'unknown',
                                ip: ip,
                                port: s.port
                            });
                        }
                    });
                    res.json(peers);
                }, 2000);
            });

            resolve({ app, server, io, port });
        }).on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                const server2 = server.listen(port + 1, '0.0.0.0', () => {
                    // Provide fallback broadcast
                    bonjour.publish({
                        name: `LocalShare Network - ${DEVICE_NAME}-${MACHINE_ID.substring(0, 4)}`,
                        type: 'localshare',
                        port: port + 1,
                        txt: { id: MACHINE_ID, type: 'desktop', deviceName: DEVICE_NAME }
                    });
                    resolve({ app, server: server2, io, port: port + 1 });
                });
            } else {
                reject(err);
            }
        });
    });
}

module.exports = { startServer };
