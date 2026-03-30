/**
 * AntahkarnVrinda — Unified Device Agent
 * 
 * Every device runs this agent. It is BOTH a server and a client.
 * Communication: WebSocket (JSON protocol)
 * Discovery: mDNS/Bonjour
 * 
 * Architecture:
 *   Agent Process
 *   ├── WebSocket Server (accepts incoming connections)
 *   ├── WebSocket Client (connects to discovered peers)
 *   ├── mDNS Discovery (finds peers on LAN)
 *   └── Command Router
 *       ├── mirror:* handlers
 *       ├── file:* handlers
 *       ├── control:* handlers
 *       ├── device:* handlers
 *       └── clipboard:* handlers
 */

const os = require('os');
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { WebSocketServer, WebSocket } = require('ws');
const { Bonjour } = require('bonjour-service');

// ═══════════════════════════════════════════════════
//  DEVICE IDENTITY
// ═══════════════════════════════════════════════════
const DEVICE_ID = crypto.randomUUID();
const DEVICE_NAME = os.hostname();
const DEVICE_TYPE = 'desktop';
const AGENT_PORT = 8765;

// ═══════════════════════════════════════════════════
//  MESSAGE PROTOCOL
// ═══════════════════════════════════════════════════
function createMessage(category, action, payload = {}, to = null) {
    return JSON.stringify({
        type: 'command',
        category,
        action,
        from: DEVICE_ID,
        fromName: DEVICE_NAME,
        to,
        payload,
        id: crypto.randomUUID(),
        timestamp: Date.now()
    });
}

function createResponse(originalMsg, payload = {}, success = true) {
    return JSON.stringify({
        type: 'response',
        replyTo: originalMsg.id,
        from: DEVICE_ID,
        success,
        payload,
        timestamp: Date.now()
    });
}

// ═══════════════════════════════════════════════════
//  PEER REGISTRY
// ═══════════════════════════════════════════════════
class PeerRegistry {
    constructor() {
        this.peers = new Map(); // deviceId -> { ws, info, lastSeen }
    }

    add(deviceId, ws, info) {
        this.peers.set(deviceId, { ws, info, lastSeen: Date.now() });
    }

    remove(deviceId) {
        this.peers.delete(deviceId);
    }

    get(deviceId) {
        return this.peers.get(deviceId);
    }

    getAll() {
        return Array.from(this.peers.values()).map(p => ({
            id: p.info.deviceId,
            name: p.info.deviceName,
            type: p.info.deviceType,
            connected: p.ws.readyState === WebSocket.OPEN,
            lastSeen: p.lastSeen
        }));
    }

    broadcast(message, excludeId = null) {
        for (const [id, peer] of this.peers) {
            if (id !== excludeId && peer.ws.readyState === WebSocket.OPEN) {
                peer.ws.send(message);
            }
        }
    }

    sendTo(deviceId, message) {
        const peer = this.peers.get(deviceId);
        if (peer && peer.ws.readyState === WebSocket.OPEN) {
            peer.ws.send(message);
            return true;
        }
        return false;
    }
}

// ═══════════════════════════════════════════════════
//  COMMAND ROUTER
// ═══════════════════════════════════════════════════
class CommandRouter {
    constructor() {
        this.handlers = new Map();
    }

    register(category, action, handler) {
        const key = `${category}:${action}`;
        this.handlers.set(key, handler);
    }

    async route(msg, ws) {
        const key = `${msg.category}:${msg.action}`;
        const handler = this.handlers.get(key);
        if (handler) {
            try {
                const result = await handler(msg, ws);
                return result;
            } catch (err) {
                console.error(`[Router] Error in ${key}:`, err.message);
                return { error: err.message };
            }
        }
        console.warn(`[Router] No handler for ${key}`);
        return { error: `Unknown command: ${key}` };
    }
}

// ═══════════════════════════════════════════════════
//  FILE HANDLER
// ═══════════════════════════════════════════════════
function registerFileHandlers(router, uploadsDir) {
    // List files in a directory
    router.register('file', 'list', async (msg) => {
        const dir = msg.payload?.dir || uploadsDir;
        const safePath = path.resolve(uploadsDir, msg.payload?.dir || '.');
        
        // Security: prevent path traversal
        if (!safePath.startsWith(uploadsDir)) {
            return { error: 'Access denied' };
        }

        try {
            const entries = fs.readdirSync(safePath, { withFileTypes: true });
            const files = entries.map(e => ({
                name: e.name,
                isDir: e.isDirectory(),
                size: e.isFile() ? fs.statSync(path.join(safePath, e.name)).size : 0,
                lastModified: fs.statSync(path.join(safePath, e.name)).mtimeMs
            }));
            return { files, dir: safePath };
        } catch (err) {
            return { error: err.message };
        }
    });

    // Receive pushed file (base64 chunks)
    router.register('file', 'push', async (msg) => {
        const { name, data, encoding } = msg.payload;
        const filePath = path.join(uploadsDir, name);
        
        try {
            const buffer = Buffer.from(data, encoding || 'base64');
            fs.writeFileSync(filePath, buffer);
            return { success: true, path: filePath, size: buffer.length };
        } catch (err) {
            return { error: err.message };
        }
    });

    // Pull a file (send back as base64)
    router.register('file', 'pull', async (msg) => {
        const filePath = path.resolve(uploadsDir, msg.payload.name);
        if (!filePath.startsWith(uploadsDir)) return { error: 'Access denied' };

        try {
            const data = fs.readFileSync(filePath);
            return {
                name: path.basename(filePath),
                data: data.toString('base64'),
                size: data.length,
                encoding: 'base64'
            };
        } catch (err) {
            return { error: err.message };
        }
    });

    // Delete a file
    router.register('file', 'delete', async (msg) => {
        const filePath = path.resolve(uploadsDir, msg.payload.name);
        if (!filePath.startsWith(uploadsDir)) return { error: 'Access denied' };

        try {
            fs.unlinkSync(filePath);
            return { success: true };
        } catch (err) {
            return { error: err.message };
        }
    });
}

// ═══════════════════════════════════════════════════
//  DEVICE HANDLER
// ═══════════════════════════════════════════════════
function registerDeviceHandlers(router) {
    router.register('device', 'info', async () => {
        return {
            deviceId: DEVICE_ID,
            deviceName: DEVICE_NAME,
            deviceType: DEVICE_TYPE,
            platform: process.platform,
            arch: process.arch,
            uptime: os.uptime(),
            freeMemory: os.freemem(),
            totalMemory: os.totalmem(),
            cpus: os.cpus().length,
            networkInterfaces: getLocalIPs()
        };
    });

    router.register('device', 'heartbeat', async () => {
        return { alive: true, timestamp: Date.now() };
    });

    router.register('device', 'battery', async () => {
        // Desktop doesn't always have battery info
        return { level: -1, charging: true, source: 'AC' };
    });

    router.register('device', 'storage', async () => {
        try {
            const home = os.homedir();
            return { homedir: home, platform: process.platform };
        } catch {
            return { error: 'Cannot read storage info' };
        }
    });
}

// ═══════════════════════════════════════════════════
//  CLIPBOARD HANDLER
// ═══════════════════════════════════════════════════
function registerClipboardHandlers(router) {
    let clipboardCache = '';

    router.register('clipboard', 'get', async () => {
        // In Electron, we'd use clipboard.readText()
        // For standalone mode, return cached value
        return { text: clipboardCache };
    });

    router.register('clipboard', 'set', async (msg) => {
        clipboardCache = msg.payload.text || '';
        return { success: true };
    });
}

// ═══════════════════════════════════════════════════
//  MIRROR HANDLER (Desktop = receiver/decoder)
// ═══════════════════════════════════════════════════
function registerMirrorHandlers(router, peerRegistry, onMirrorEvent) {
    router.register('mirror', 'offer', async (msg, ws) => {
        // Android is offering to stream its screen
        if (onMirrorEvent) onMirrorEvent('offer', msg);
        return { accepted: true };
    });

    router.register('mirror', 'frame', async (msg) => {
        // Forward frame data to the UI
        if (onMirrorEvent) onMirrorEvent('frame', msg);
        return { received: true };
    });

    router.register('mirror', 'stop', async (msg) => {
        if (onMirrorEvent) onMirrorEvent('stop', msg);
        return { stopped: true };
    });
}

// ═══════════════════════════════════════════════════
//  CONTROL HANDLER (Desktop sends control to Android)
// ═══════════════════════════════════════════════════
function registerControlHandlers(router, peerRegistry) {
    // These are outbound commands — desktop creates them and sends to Android
    // The Android agent handles the actual injection
    router.register('control', 'tap', async (msg) => {
        return { dispatched: true, x: msg.payload.x, y: msg.payload.y };
    });

    router.register('control', 'swipe', async (msg) => {
        return { dispatched: true };
    });

    router.register('control', 'key', async (msg) => {
        return { dispatched: true, keyCode: msg.payload.keyCode };
    });

    router.register('control', 'text_input', async (msg) => {
        return { dispatched: true, text: msg.payload.text };
    });
}

// ═══════════════════════════════════════════════════
//  UTILITY
// ═══════════════════════════════════════════════════
function getLocalIPs() {
    const interfaces = os.networkInterfaces();
    const ips = [];
    for (const [name, addrs] of Object.entries(interfaces)) {
        for (const addr of addrs) {
            if (addr.family === 'IPv4' && !addr.internal) {
                ips.push({ interface: name, address: addr.address });
            }
        }
    }
    return ips;
}

// ═══════════════════════════════════════════════════
//  AGENT CORE
// ═══════════════════════════════════════════════════
class DeviceAgent {
    constructor(options = {}) {
        this.port = options.port || AGENT_PORT;
        this.uploadsDir = options.uploadsDir || path.join(__dirname, 'uploads');
        this.peerRegistry = new PeerRegistry();
        this.router = new CommandRouter();
        this.bonjour = new Bonjour();
        this.wss = null;
        this.server = null;
        this.mirrorCallback = options.onMirrorEvent || null;
        this.onPeersChanged = options.onPeersChanged || null;

        // Ensure uploads directory
        if (!fs.existsSync(this.uploadsDir)) {
            fs.mkdirSync(this.uploadsDir, { recursive: true });
        }

        // Register all handlers
        registerFileHandlers(this.router, this.uploadsDir);
        registerDeviceHandlers(this.router);
        registerClipboardHandlers(this.router);
        registerMirrorHandlers(this.router, this.peerRegistry, this.mirrorCallback);
        registerControlHandlers(this.router, this.peerRegistry);
    }

    // Start the agent (both server + discovery)
    async start() {
        // 1. Start WebSocket Server
        this.server = http.createServer();
        this.wss = new WebSocketServer({ server: this.server });

        this.wss.on('connection', (ws, req) => {
            const remoteIp = req.socket.remoteAddress;
            console.log(`[Agent] Incoming connection from ${remoteIp}`);

            ws.on('message', async (raw) => {
                try {
                    const msg = JSON.parse(raw.toString());
                    await this._handleMessage(msg, ws);
                } catch (err) {
                    console.error('[Agent] Bad message:', err.message);
                }
            });

            ws.on('close', () => {
                // Remove from peer registry
                for (const [id, peer] of this.peerRegistry.peers) {
                    if (peer.ws === ws) {
                        this.peerRegistry.remove(id);
                        console.log(`[Agent] Peer disconnected: ${id}`);
                        if (this.onPeersChanged) this.onPeersChanged(this.peerRegistry.getAll());
                        break;
                    }
                }
            });

            // Request identity from connecting peer
            ws.send(createMessage('device', 'identify'));
        });

        await new Promise((resolve, reject) => {
            this.server.listen(this.port, '0.0.0.0', () => {
                console.log(`[Agent] WebSocket server listening on port ${this.port}`);
                resolve();
            });
            this.server.on('error', reject);
        });

        // 2. Start mDNS Broadcasting
        const serviceName = `Vrinda-${DEVICE_NAME}-${DEVICE_ID.substring(0, 4)}`;
        try {
            this.mdnsService = this.bonjour.publish({
                name: serviceName,
                type: 'antahkarn',
                port: this.port,
                txt: {
                    id: DEVICE_ID,
                    name: DEVICE_NAME,
                    type: DEVICE_TYPE,
                    version: '2.0'
                }
            });
            console.log(`[Agent] mDNS broadcasting: ${serviceName}`);
        } catch (err) {
            console.warn(`[Agent] mDNS broadcast failed (non-fatal): ${err.message}`);
        }

        // 3. Start mDNS Discovery
        this.browser = this.bonjour.find({ type: 'antahkarn' }, (service) => {
            const peerId = service.txt?.id;
            if (peerId && peerId !== DEVICE_ID) {
                console.log(`[Agent] Discovered peer: ${service.txt.name} (${peerId})`);
                this._connectToPeer(service);
            }
        });

        // 4. Start heartbeat
        this._heartbeatInterval = setInterval(() => {
            this.peerRegistry.broadcast(createMessage('device', 'heartbeat'));
        }, 5000);

        console.log(`[Agent] Device Agent started. ID: ${DEVICE_ID}`);
        return { port: this.port, deviceId: DEVICE_ID };
    }

    // Connect to a discovered peer as a client
    async _connectToPeer(service) {
        const ip = service.addresses?.[0] || service.host;
        const port = service.port;
        const peerId = service.txt?.id;

        if (this.peerRegistry.get(peerId)) return; // Already connected

        try {
            const ws = new WebSocket(`ws://${ip}:${port}`);
            
            ws.on('open', () => {
                console.log(`[Agent] Connected to peer: ${service.txt.name}`);
                // Send our identity
                ws.send(createMessage('device', 'identify', {
                    deviceId: DEVICE_ID,
                    deviceName: DEVICE_NAME,
                    deviceType: DEVICE_TYPE
                }));
                this.peerRegistry.add(peerId, ws, {
                    deviceId: peerId,
                    deviceName: service.txt.name,
                    deviceType: service.txt.type,
                    ip, port
                });
                if (this.onPeersChanged) this.onPeersChanged(this.peerRegistry.getAll());
            });

            ws.on('message', async (raw) => {
                try {
                    const msg = JSON.parse(raw.toString());
                    await this._handleMessage(msg, ws);
                } catch (err) {
                    console.error('[Agent] Bad message from peer:', err.message);
                }
            });

            ws.on('close', () => {
                this.peerRegistry.remove(peerId);
                console.log(`[Agent] Peer disconnected: ${peerId}`);
                if (this.onPeersChanged) this.onPeersChanged(this.peerRegistry.getAll());
            });

            ws.on('error', (err) => {
                console.warn(`[Agent] Peer connection error: ${err.message}`);
            });

        } catch (err) {
            console.warn(`[Agent] Failed to connect to ${ip}:${port}: ${err.message}`);
        }
    }

    // Handle an incoming message
    async _handleMessage(msg, ws) {
        // Special: identity response — register the peer
        if (msg.category === 'device' && msg.action === 'identify' && msg.payload?.deviceId) {
            this.peerRegistry.add(msg.payload.deviceId, ws, msg.payload);
            console.log(`[Agent] Peer identified: ${msg.payload.deviceName} (${msg.payload.deviceType})`);
            if (this.onPeersChanged) this.onPeersChanged(this.peerRegistry.getAll());
            return;
        }

        // Route to appropriate handler
        if (msg.type === 'command') {
            const result = await this.router.route(msg, ws);
            ws.send(createResponse(msg, result, !result.error));
        }
    }

    // Send a command to a specific peer
    sendCommand(peerId, category, action, payload = {}) {
        const msg = createMessage(category, action, payload, peerId);
        return this.peerRegistry.sendTo(peerId, msg);
    }

    // Broadcast a command to all peers
    broadcastCommand(category, action, payload = {}) {
        this.peerRegistry.broadcast(createMessage(category, action, payload));
    }

    // Get connected peers
    getPeers() {
        return this.peerRegistry.getAll();
    }

    // Stop the agent
    async stop() {
        clearInterval(this._heartbeatInterval);
        if (this.mdnsService) {
            try { this.bonjour.unpublishAll(); } catch {}
        }
        if (this.browser) {
            try { this.browser.stop(); } catch {}
        }
        if (this.wss) this.wss.close();
        if (this.server) this.server.close();
        this.bonjour.destroy();
        console.log('[Agent] Stopped.');
    }
}

module.exports = { DeviceAgent, createMessage, createResponse, DEVICE_ID, DEVICE_NAME };
