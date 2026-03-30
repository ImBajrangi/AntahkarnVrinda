/**
 * AntahkarnVrinda — Electron Main Process (v2)
 * 
 * Wraps the Device Agent in an Electron window.
 * The agent runs as the backend; React UI is the frontend.
 */

const { app, BrowserWindow, ipcMain, clipboard } = require('electron');
const path = require('path');
const { DeviceAgent } = require('./agent');

let mainWindow;
let agent;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1100,
        height: 850,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        titleBarStyle: 'hiddenInset',
        show: false,
        backgroundColor: '#F7F7F5'
    });

    // Start the Device Agent
    const uploadsDir = path.join(app.getPath('downloads'), 'AntahkarnVrinda');
    agent = new DeviceAgent({
        port: 8765,
        uploadsDir,
        onPeersChanged: (peers) => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('peers-updated', peers);
            }
        },
        onMirrorEvent: (type, data) => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('mirror-event', { type, data });
            }
        }
    });

    agent.start().then(({ port, deviceId }) => {
        console.log(`[Electron] Agent running on port ${port}, ID: ${deviceId}`);

        // Load the React UI
        const isDev = !app.isPackaged;
        if (isDev) {
            // In dev, try Vite dev server first, fallback to dist
            mainWindow.loadURL('http://localhost:5174').catch(() => {
                mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
            });
        } else {
            mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
        }

        mainWindow.once('ready-to-show', () => {
            mainWindow.show();
        });
    }).catch(err => {
        console.error('[Electron] Agent failed to start:', err);
        // Still show the window with an error state
        mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
        mainWindow.once('ready-to-show', () => mainWindow.show());
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// ═══ IPC Handlers (React UI ↔ Agent) ═══

ipcMain.handle('agent:get-identity', () => {
    return {
        id: agent ? require('./agent').DEVICE_ID : 'unknown',
        name: agent ? require('./agent').DEVICE_NAME : 'Unknown',
        type: 'desktop'
    };
});

ipcMain.handle('agent:get-peers', () => {
    return agent ? agent.getPeers() : [];
});

ipcMain.handle('agent:send-command', (_, { peerId, category, action, payload }) => {
    if (!agent) return false;
    return agent.sendCommand(peerId, category, action, payload);
});

ipcMain.handle('agent:list-files', () => {
    if (!agent) return [];
    const uploadsDir = path.join(app.getPath('downloads'), 'AntahkarnVrinda');
    const fs = require('fs');
    try {
        if (!fs.existsSync(uploadsDir)) return [];
        return fs.readdirSync(uploadsDir, { withFileTypes: true }).map(e => ({
            id: e.name,
            name: e.name,
            isDir: e.isDirectory(),
            size: e.isFile() ? fs.statSync(path.join(uploadsDir, e.name)).size : 0,
            lastModified: fs.statSync(path.join(uploadsDir, e.name)).mtimeMs,
            path: path.join(uploadsDir, e.name)
        }));
    } catch { return []; }
});

ipcMain.handle('agent:clipboard-get', () => {
    return clipboard.readText();
});

ipcMain.handle('agent:clipboard-set', (_, text) => {
    clipboard.writeText(text);
    return true;
});

// ═══ App Lifecycle ═══

app.whenReady().then(createWindow);

app.on('window-all-closed', async () => {
    if (agent) await agent.stop();
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (mainWindow === null) createWindow();
});

app.on('before-quit', async () => {
    if (agent) await agent.stop();
});
