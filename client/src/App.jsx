import React, { useState, useRef, useEffect, Component } from 'react';

// ═══════════════════════════════════════════════════
//  AGENT BRIDGE — Works in Electron (preload) or Browser (WebSocket)
// ═══════════════════════════════════════════════════
const isElectron = typeof window !== 'undefined' && !!window.agent;

class AgentBridge {
  constructor() {
    this.ws = null;
    this.listeners = new Map();
    this.pendingCallbacks = new Map();
    this.peers = [];
    this.identity = { id: '', name: 'Connecting...', type: 'desktop' };
  }

  async connect() {
    if (isElectron) {
      this.identity = await window.agent.getIdentity();
      this.peers = await window.agent.getPeers();
      window.agent.onPeersUpdated((peers) => {
        this.peers = peers;
        this._emit('peers', peers);
      });
      window.agent.onMirrorEvent((event) => {
        this._emit('mirror', event);
      });
    } else {
      // Browser mode — connect to agent's WebSocket directly
      const wsUrl = `ws://${window.location.hostname}:8765`;
      this.ws = new WebSocket(wsUrl);
      this.ws.onopen = () => {
        console.log('[Bridge] Connected to agent');
        this._send('device', 'identify', {
          deviceId: 'browser-' + Math.random().toString(36).slice(2),
          deviceName: 'Browser Client',
          deviceType: 'browser'
        });
      };
      this.ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          this._handleMessage(msg);
        } catch { }
      };
      this.ws.onerror = () => console.warn('[Bridge] WebSocket error');
      this.ws.onclose = () => {
        console.warn('[Bridge] Disconnected, retrying in 3s...');
        setTimeout(() => this.connect(), 3000);
      };
    }
  }

  _send(category, action, payload = {}, to = null) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const id = crypto.randomUUID();
      this.ws.send(JSON.stringify({
        type: 'command', category, action, from: this.identity.id,
        to, payload, id, timestamp: Date.now()
      }));
      return id;
    }
  }

  _handleMessage(msg) {
    if (msg.type === 'response') {
      const cb = this.pendingCallbacks.get(msg.replyTo);
      if (cb) { cb(msg.payload); this.pendingCallbacks.delete(msg.replyTo); }
    }
    if (msg.type === 'command' && msg.category === 'mirror' && msg.action === 'frame') {
      this._emit('frame', msg.payload);
      this._emit('mirror', { type: 'frame', data: msg });
    }
  }

  async getIdentity() {
    if (isElectron) return window.agent.getIdentity();
    return this.identity;
  }

  async getPeers() {
    if (isElectron) return window.agent.getPeers();
    return this.peers;
  }

  async listFiles() {
    if (isElectron) return window.agent.listFiles();
    return [];
  }

  async sendCommand(peerId, category, action, payload) {
    if (isElectron) return window.agent.sendCommand(peerId, category, action, payload);
    this._send(category, action, payload, peerId);
  }

  on(event, callback) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event).push(callback);
  }

  _emit(event, data) {
    const cbs = this.listeners.get(event) || [];
    cbs.forEach(cb => cb(data));
  }
}

const bridge = new AgentBridge();

// ═══════════════════════════════════════════════════
//  UTILITY
// ═══════════════════════════════════════════════════
function formatBytes(bytes, decimals = 1) {
  if (!+bytes) return '0 B';
  const k = 1024, dm = Math.max(0, decimals);
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

// ═══════════════════════════════════════════════════
//  DEVICE ICONS
// ═══════════════════════════════════════════════════
function PhoneIcon({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="14" y="4" width="20" height="40" rx="3" />
      <line x1="20" y1="40" x2="28" y2="40" />
      <circle cx="24" cy="10" r="1" fill="currentColor" />
    </svg>
  );
}
function LaptopIcon({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="8" y="8" width="32" height="24" rx="2" />
      <line x1="4" y1="36" x2="44" y2="36" />
    </svg>
  );
}
function DesktopIcon({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="6" y="6" width="36" height="28" rx="2" />
      <line x1="24" y1="34" x2="24" y2="42" />
      <line x1="16" y1="42" x2="32" y2="42" />
    </svg>
  );
}
function DeviceIcon({ type, className = '' }) {
  switch (type) {
    case 'android': case 'ios': case 'phone': return <PhoneIcon className={className} />;
    case 'windows': return <DesktopIcon className={className} />;
    default: return <LaptopIcon className={className} />;
  }
}

// ═══════════════════════════════════════════════════
//  MIRROR VIEWER
// ═══════════════════════════════════════════════════
function MirrorViewer({ peerId, onClose }) {
  const canvasRef = useRef(null);
  const [fps, setFps] = useState(0);
  const frameCount = useRef(0);

  useEffect(() => {
    let lastTime = Date.now();
    const handleFrame = (frame) => {
      if (!canvasRef.current || !frame.data) return;

      const ctx = canvasRef.current.getContext('2d');
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvasRef.current.width, canvasRef.current.height);
        frameCount.current++;
      };
      // We assume Android sends JPEG or H.264-Base64
      // For H.264, we would use a WASM decoder here. 
      // Falling back to a clean data-URI for the 'perfectly working' initial bridge.
      img.src = `data:image/jpeg;base64,${frame.data}`;
    };

    bridge.on('frame', handleFrame);

    const fpsInterval = setInterval(() => {
      setFps(frameCount.current);
      frameCount.current = 0;
    }, 1000);

    return () => {
      bridge.sendCommand(peerId, 'mirror', 'stop', {});
      clearInterval(fpsInterval);
    };
  }, [peerId]);

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-10">
      <div className="w-full max-w-sm flex flex-col gap-4">
        <div className="flex items-center justify-between text-white">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="mono text-xs font-bold uppercase tracking-widest">Live Mirror</span>
            <span className="mono text-[10px] opacity-40">| {fps} FPS</span>
          </div>
          <button onClick={onClose} className="hover:opacity-60 transition-opacity">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="aspect-[9/16] bg-black border border-white/10 rounded-xl overflow-hidden shadow-2xl relative">
          <canvas ref={canvasRef} width={720} height={1280} className="w-full h-full object-contain" />
          <div className="absolute inset-0 pointer-events-none border border-white/5 rounded-xl" />
        </div>

        <div className="flex justify-center gap-4 mt-4">
          <button className="bg-white/10 hover:bg-white/20 text-white p-3 rounded-full transition-colors">
            <span className="material-symbols-outlined">home</span>
          </button>
          <button className="bg-white/10 hover:bg-white/20 text-white p-3 rounded-full transition-colors">
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
//  MAIN APP
// ═══════════════════════════════════════════════════
function App() {
  const [identity, setIdentity] = useState({ id: '', name: 'Starting...', type: 'desktop' });
  const [peers, setPeers] = useState([]);
  const [files, setFiles] = useState([]);
  const [transfers, setTransfers] = useState([]); // Real transfer tracking
  const [activeTab, setActiveTab] = useState('radar');
  const [statusMsg, setStatusMsg] = useState('');
  const [mirrorPeerId, setMirrorPeerId] = useState(null);
  const [browsingPeerId, setBrowsingPeerId] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    // 1. Initial Load from Cache (Seamless feel)
    const cachedPeers = localStorage.getItem('antahkarn_peers');
    if (cachedPeers) setPeers(JSON.parse(cachedPeers));

    // Universal response handler
    bridge.on('response', (resp) => {
      if (resp.category === 'file' && resp.action === 'list') {
        const payload = resp.payload || {};
        if (Array.isArray(payload.files)) setFiles(payload.files);
      }
    });

    // Real-time peer status updates (hardware sync)
    bridge.on('status', (data) => {
      setPeers(prev => {
        const next = prev.map(p => p.id === data.peerId ? { ...p, status: data.status } : p);
        localStorage.setItem('antahkarn_peers', JSON.stringify(next));
        return next;
      });
    });

    // Identity and Peer discovery
    bridge.connect().then(async () => {
      const id = await bridge.getIdentity();
      if (id) setIdentity(id);
    });

    bridge.on('peers', (newPeers) => {
      const list = Array.isArray(newPeers) ? newPeers : [];
      setPeers(list);
      localStorage.setItem('antahkarn_peers', JSON.stringify(list));
    });

    // 2. Real-World Status Poller
    const fetchData = async () => {
      try {
        const p = await bridge.getPeers();
        if (Array.isArray(p)) {
          setPeers(p);
          p.forEach(peer => bridge.sendCommand(peer.id, 'device', 'status', {}));
        }
      } catch { }
    };
    
    fetchData();
    const interval = setInterval(fetchData, 8000);
    return () => clearInterval(interval);
  }, []);

  const sendControl = (peerId, action, payload) => {
    bridge.sendCommand(peerId, 'control', action, payload);
    setStatusMsg(`Sent ${action} to ${peerId.substring(0, 8)}...`);
  };

  // ─── RENDER ──────────────────────────────────────
  return (
    <div className="min-h-screen bg-wash flex flex-col font-sans">

      {/* ═══ TOP BAR ═══ */}
      <header className="bg-canvas border-b border-black flex items-center justify-between h-14 px-6">
        <div className="flex items-center gap-2.5">
          <span className="material-symbols-outlined text-xl">wifi_tethering</span>
          <h1 className="font-heading font-bold text-lg tracking-tight">AntahkarnVrinda</h1>
          <span className="mono text-[9px] bg-black text-white px-1.5 py-0.5 rounded-sm font-bold ml-2">v2.0 AGENT</span>
        </div>
        <nav className="hidden md:flex items-center gap-8 h-full">
          {['radar', 'shared', 'history', 'settings'].map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={activeTab === tab ? 'nav-link-active h-full flex items-center' : 'nav-link h-full flex items-center'}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-2 border border-black rounded-card px-3 py-1.5">
          <span className="w-2 h-2 rounded-full bg-green-500" />
          <span className="mono text-[11px] font-bold">{identity.name}</span>
        </div>
      </header>

      {/* ═══ MAIN CONTENT ═══ */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 md:p-10">

        {/* ─── RADAR TAB ─── */}
        {activeTab === 'radar' && (
          <div className="flex flex-col gap-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 border border-black rounded-card px-4 py-2 bg-canvas">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-sm">Agent: <strong className="font-heading">{identity.name}</strong></span>
              </div>
              <div className="flex items-center gap-2 bg-black text-white px-5 py-2 rounded-card">
                <span className="material-symbols-outlined text-sm">check_circle</span>
                <span className="text-sm font-medium">Unified Mesh Active</span>
              </div>
            </div>

            <div className="border-2 border-dashed border-black/20 rounded-card bg-canvas min-h-[400px] md:min-h-[500px] p-4 md:p-8 flex flex-col">
              {peers.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center gap-4">
                  <span className="material-symbols-outlined text-6xl text-black/10">wifi_tethering</span>
                  <div>
                    <h3 className="font-heading text-2xl font-bold tracking-tight mb-1">SCANNING...</h3>
                    <p className="mono text-xs text-black/40 uppercase tracking-widest">Searching for agent nodes on network</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 flex-1 content-center">
                  {peers.map(peer => (
                    <div key={peer.id} className="peer-card flex flex-col items-center text-center min-h-[200px] justify-center gap-3 cursor-pointer group">
                      <DeviceIcon type={peer.type} className="w-12 h-12 text-black/70 group-hover:text-black transition-colors" />
                      <div className="flex flex-col gap-1">
                        <h4 className="font-heading font-bold text-lg leading-tight">{peer.name}</h4>
                        <p className="mono text-[10px] text-black/50 uppercase tracking-wide">{peer.type || 'device'}</p>
                      </div>
                      <div className="flex flex-col items-center gap-2">
                        <div className="status-badge text-green-600 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                          {peer.status?.ram ? `${peer.status.ram.percent || '??'}% RAM` : (peer.connected ? 'SYNCED' : 'DISCOVERED')}
                        </div>
                        {peer.status?.battery && (
                          <div className="mono text-[9px] font-bold text-black/40 flex items-center gap-1">
                            <span className="material-symbols-outlined text-[10px]">{peer.status.battery.charging ? 'battery_charging_full' : 'battery_full'}</span>
                            {peer.status.battery.level}%
                          </div>
                        )}
                        <div className="flex gap-1.5 mt-2 flex-wrap justify-center">
                          <button onClick={() => sendControl(peer.id, 'tap', { x: 540, y: 960 })}
                            className="text-[10px] mono border border-black px-2 py-1 hover:bg-black hover:text-white transition-colors">
                            TAP
                          </button>
                          <button onClick={() => {
                            setMirrorPeerId(peer.id);
                            bridge.sendCommand(peer.id, 'mirror', 'start', { quality: 'high' });
                          }}
                            className="text-[10px] mono border border-black px-2 py-1 hover:bg-black hover:text-white transition-colors">
                            MIRROR
                          </button>
                          <button onClick={() => {
                            setBrowsingPeerId(peer.id);
                            setActiveTab('history');
                            bridge.sendCommand(peer.id, 'file', 'list', {});
                          }}
                            className="text-[10px] mono border border-black px-2 py-1 hover:bg-black hover:text-white transition-colors text-nowrap">
                            FILES
                          </button>
                          <button onClick={async () => {
                            try {
                              const res = await bridge.sendCommand(peer.id, 'clipboard', 'get', {});
                              if (res && res.payload) {
                                setStatusMsg(`CLIPBOARD [${peer.name}]: ${res.payload.text || 'Empty'}`);
                              }
                            } catch (e) {
                              setStatusMsg("Clipboard fetch failed.");
                            }
                          }}
                            className="text-[10px] mono border border-black px-2 py-1 hover:bg-black hover:text-white transition-colors text-nowrap">
                            CLIPBOARD
                          </button>
                          <button onClick={async () => {
                            const cmd = prompt("Enter shell command for " + peer.name);
                            if (cmd) {
                              try {
                                const res = await bridge.sendCommand(peer.id, 'shell', 'run', { command: cmd });
                                if (res && res.payload) {
                                  alert(`STDOUT:\n${res.payload.stdout}\n\nSTDERR:\n${res.payload.stderr}`);
                                }
                              } catch (e) {
                                alert("Failed to execute command.");
                              }
                            }
                          }}
                            className="text-[10px] mono border border-black px-2 py-1 hover:bg-black hover:text-white transition-colors text-nowrap">
                            TERMINAL
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  <div className="border border-dashed border-black/20 rounded-card flex flex-col items-center justify-center min-h-[200px] text-black/30">
                    <span className="material-symbols-outlined text-3xl text-accent/50 mb-2">cell_tower</span>
                    <span className="mono text-xs text-accent/70 font-medium">Discovering...</span>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-black/10 pt-4">
              <div className="flex items-center gap-2 text-black/60">
                <span className="material-symbols-outlined text-sm">schedule</span>
                <span className="mono text-[11px]">{statusMsg || 'Ready'}</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-32 h-1.5 bg-black/5 rounded-full overflow-hidden">
                  <div className="h-full bg-green-500 rounded-full" style={{ width: '100%' }} />
                </div>
                <span className="mono text-[10px] text-black/40 font-bold uppercase tracking-widest">
                  {peers.length > 0 ? `${peers.length} PEERS` : 'IDLE'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ─── HISTORY TAB ─── */}
        {activeTab === 'history' && (
          <div>
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="font-heading text-4xl md:text-5xl font-bold tracking-tight">Transfer History</h2>
                <p className="mono text-xs text-black/40 uppercase mt-2">Total: {Array.isArray(files) ? files.length : 0} files</p>
              </div>
              <button className="primary-button-filled text-xs flex items-center gap-2">
                <span className="material-symbols-outlined text-sm">ios_share</span> Export Log
              </button>
            </div>

            <div className="border-t-2 border-black overflow-x-auto">
              <div className="min-w-[600px]">
                <div className="grid grid-cols-[100px_1fr_100px_80px] gap-4 py-3 border-b border-black/10">
                  <span className="mono text-[10px] font-bold uppercase tracking-widest text-black/50">Date</span>
                  <span className="mono text-[10px] font-bold uppercase tracking-widest text-black/50">File Name</span>
                  <span className="mono text-[10px] font-bold uppercase tracking-widest text-black/50">Type</span>
                  <span className="mono text-[10px] font-bold uppercase tracking-widest text-black/50 text-right">Size</span>
                </div>

                {(!Array.isArray(files) || files.length === 0) ? (
                  <div className="py-16 text-center">
                    <span className="material-symbols-outlined text-4xl text-black/10 mb-3 block">folder_open</span>
                    <p className="text-black/30 text-sm">No transfers yet. Files received from peers will appear here.</p>
                  </div>
                ) : (
                  files.map((file) => (
                    <div key={file?.id || file?.name || Math.random()} className="grid grid-cols-[100px_1fr_100px_80px] gap-4 py-4 border-b border-black/5 hover:bg-wash transition-colors group items-center">
                      <span className="mono text-xs text-black/40">
                        {file?.lastModified ? new Date(file.lastModified).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '---'}
                      </span>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="material-symbols-outlined text-sm text-black/40">description</span>
                        <span className="font-medium text-sm truncate">{file?.name || 'Unknown'}</span>
                      </div>
                      <span className="mono text-[10px] text-black/50">{file?.isDir ? 'DIR' : 'FILE'}</span>
                      <span className="mono text-xs text-black/60 text-right">{formatBytes(file?.size || 0)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* ─── SHARED TAB ─── */}
        {activeTab === 'shared' && (
          <div className="flex flex-col gap-10">
            <div className="flex items-end justify-between">
              <div className="flex flex-col gap-3">
                <h2 className="font-heading text-6xl font-bold tracking-tighter leading-none">SHARED</h2>
                <p className="text-black/40 font-medium text-lg">Active peer-to-peer file distribution.</p>
              </div>
              <button className="share-btn">
                <span className="material-symbols-outlined">add</span> Share New File
              </button>
            </div>

            <div className="border-t-[3px] border-black bg-canvas overflow-hidden">
              <table className="shared-table">
                <thead>
                  <tr>
                    <th className="w-[40%]">File Name</th>
                    <th className="w-[20%]">Size/Type</th>
                    <th className="w-[20%]">Peer</th>
                    <th className="w-[20%]">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(!Array.isArray(transfers) || transfers.length === 0) ? (
                    <tr>
                      <td colSpan="4" className="py-20 text-center">
                        <span className="material-symbols-outlined text-4xl text-black/10 block mb-2">share</span>
                        <p className="text-black/30 text-sm">No active file distribution detected.</p>
                      </td>
                    </tr>
                  ) : (
                    transfers.map((item, i) => (
                      <tr key={i} className="group hover:bg-wash transition-colors">
                        <td className="font-bold text-sm tracking-tight">{item.name}</td>
                        <td className="mono text-[11px] text-black/50">{item.size}</td>
                        <td className="text-sm font-medium">{item.peer}</td>
                        <td>
                          <div className="flex items-center gap-2">
                            <span className={`w-1.5 h-1.5 rounded-full ${item.status === 'ACTIVE' ? 'bg-black' : 'border border-black'}`} />
                            <span className={item.status === 'ACTIVE' ? 'text-black' : 'text-black/30'}>{item.status}</span>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ─── SETTINGS TAB ─── */}
        {activeTab === 'settings' && (
          <div className="max-w-lg mx-auto">
            <div className="border border-black rounded-card bg-canvas p-10">
              <h2 className="font-heading text-3xl font-bold mb-10">Agent Settings</h2>
              <div className="space-y-10">
                <div>
                  <span className="mono text-[10px] text-black/40 uppercase tracking-widest block mb-2">Device ID</span>
                  <p className="font-heading text-sm font-bold text-black/60">{identity.id || 'loading...'}</p>
                </div>
                <div>
                  <span className="mono text-[10px] text-black/40 uppercase tracking-widest block mb-2">Broadcast Name</span>
                  <input type="text" className="underlined-input font-heading text-xl font-bold" defaultValue={identity.name} readOnly />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-base">Visible to others</h4>
                    <p className="text-sm text-black/40 mt-0.5">Allow nearby agents to discover you</p>
                  </div>
                  <div className="w-12 h-7 border-2 border-black rounded-full relative cursor-pointer bg-black">
                    <div className="absolute top-0.5 right-0.5 w-5 h-5 bg-white rounded-full" />
                  </div>
                </div>
                <div>
                  <span className="mono text-[10px] text-black/40 uppercase tracking-widest block mb-2">Architecture</span>
                  <p className="mono text-xs text-black/50">Unified Agent v2.0 — WebSocket + mDNS</p>
                </div>
                <div>
                  <span className="mono text-[10px] text-black/40 uppercase tracking-widest block mb-2">Agent Port</span>
                  <p className="mono text-xs text-black/50">8765</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ═══ MOBILE BOTTOM NAV ═══ */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 border-t border-black bg-canvas flex items-center justify-around">
        {[
          { id: 'radar', icon: 'wifi_tethering', label: 'Radar' },
          { id: 'history', icon: 'folder', label: 'Files' },
          { id: 'shared', icon: 'group', label: 'Shared' },
          { id: 'settings', icon: 'settings', label: 'Settings' },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex flex-col items-center gap-0.5 ${activeTab === tab.id ? 'text-black' : 'text-black/30'}`}>
            <span className="material-symbols-outlined">{tab.icon}</span>
            <span className="mono text-[9px] font-bold uppercase">{tab.label}</span>
          </button>
        ))}
      </nav>

      {mirrorPeerId && <MirrorViewer peerId={mirrorPeerId} onClose={() => setMirrorPeerId(null)} />}

      <input type="file" multiple className="hidden" ref={fileInputRef} />
    </div>
  );
}

// ═══ ERROR BOUNDARY ═══
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '80px 20px', textAlign: 'center', fontFamily: 'monospace' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '16px' }}>AGENT ERROR</h1>
          <p style={{ color: '#dc2626', marginBottom: '16px' }}>{this.state.error?.message}</p>
          <button onClick={() => window.location.reload()}
            style={{ padding: '8px 24px', background: '#000', color: '#fff', border: 'none', cursor: 'pointer' }}>
            REBOOT
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const Root = () => (
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);

export default Root;
