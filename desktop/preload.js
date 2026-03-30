/**
 * Preload script — Exposes Agent IPC to the React renderer securely.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('agent', {
    // Identity
    getIdentity: () => ipcRenderer.invoke('agent:get-identity'),
    
    // Peers
    getPeers: () => ipcRenderer.invoke('agent:get-peers'),
    onPeersUpdated: (callback) => {
        ipcRenderer.on('peers-updated', (_, peers) => callback(peers));
    },
    
    // Commands
    sendCommand: (peerId, category, action, payload) =>
        ipcRenderer.invoke('agent:send-command', { peerId, category, action, payload }),
    
    // Files
    listFiles: () => ipcRenderer.invoke('agent:list-files'),
    
    // Clipboard
    clipboardGet: () => ipcRenderer.invoke('agent:clipboard-get'),
    clipboardSet: (text) => ipcRenderer.invoke('agent:clipboard-set', text),
    
    // Mirror events
    onMirrorEvent: (callback) => {
        ipcRenderer.on('mirror-event', (_, event) => callback(event));
    }
});
