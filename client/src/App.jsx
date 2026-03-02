import { useState, useCallback, useRef, useEffect } from 'react';
import { io } from 'socket.io-client';

const getApiUrl = () => {
  if (import.meta.env.PROD) return '';
  if (typeof window !== 'undefined' && (window.location.port === '3000' || window.location.port === '3001')) {
    return `${window.location.protocol}//${window.location.hostname}:${window.location.port}`;
  }
  return 'http://localhost:3000';
};
const API_URL = getApiUrl();
const socket = io(API_URL);

function formatBytes(bytes, decimals = 1) {
  if (!+bytes) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

// SVG Device Icons matching the template aesthetic (line-art style)
function LaptopIcon({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="8" y="8" width="32" height="24" rx="2" />
      <line x1="4" y1="36" x2="44" y2="36" />
      <line x1="18" y1="32" x2="30" y2="36" />
    </svg>
  );
}
function PhoneIcon({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="14" y="4" width="20" height="40" rx="3" />
      <line x1="20" y1="40" x2="28" y2="40" />
      <circle cx="24" cy="10" r="1" fill="currentColor" />
    </svg>
  );
}
function DesktopIcon({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="6" y="6" width="36" height="28" rx="2" />
      <circle cx="24" cy="20" r="2" />
      <line x1="20" y1="34" x2="28" y2="34" />
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

function App() {
  const [identity, setIdentity] = useState({ id: '', name: 'Loading...' });
  const [peers, setPeers] = useState([]);
  const [files, setFiles] = useState([]);
  const [activeTab, setActiveTab] = useState('radar');
  const [uploadingTo, setUploadingTo] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadingFile, setUploadingFile] = useState('');
  const [statusMsg, setStatusMsg] = useState({ text: '', type: '' });
  const [selectedPeerTarget, setSelectedPeerTarget] = useState(null);

  const fileInputRef = useRef(null);

  useEffect(() => {
    fetch(`${API_URL}/api/identity`).then(r => r.json()).then(setIdentity).catch(() => { });
    fetchFiles();
    socket.on('files_updated', () => { fetchFiles(); setStatusMsg({ text: 'New file received!', type: 'success' }); });
    return () => socket.off('files_updated');
  }, []);

  useEffect(() => {
    const fetchPeers = () => fetch(`${API_URL}/api/peers`).then(r => r.json()).then(setPeers).catch(() => { });
    fetchPeers();
    const interval = setInterval(fetchPeers, 3000);
    return () => clearInterval(interval);
  }, []);

  const fetchFiles = () => fetch(`${API_URL}/api/files`).then(r => r.json()).then(setFiles).catch(() => { });

  const handleDropOnPeer = async (e, peer) => {
    e.preventDefault();
    if (uploadingTo) return;
    const selected = [];
    if (e.dataTransfer?.items) {
      const promises = [];
      for (let i = 0; i < e.dataTransfer.items.length; i++) {
        const item = e.dataTransfer.items[i];
        if (item.kind === 'file') {
          const entry = item.webkitGetAsEntry();
          if (entry) promises.push(traverseFileTree(entry, '', selected));
        }
      }
      await Promise.all(promises);
    } else if (e.dataTransfer) {
      selected.push(...Array.from(e.dataTransfer.files));
    }
    if (selected.length > 0) initiateTransfer(selected, peer);
  };

  const traverseFileTree = (item, path, fileList) => new Promise((resolve) => {
    if (item.isFile) {
      item.file((file) => { fileList.push(file); resolve(); });
    } else if (item.isDirectory) {
      item.createReader().readEntries(async (entries) => {
        await Promise.all(entries.map(e => traverseFileTree(e, path + item.name + '/', fileList)));
        resolve();
      });
    }
  });

  const initiateTransfer = (selectedFiles, peer) => {
    const filesArray = Array.from(selectedFiles);
    setUploadingTo(peer.id);
    setUploadProgress(0);
    setUploadingFile(filesArray[0]?.name || 'file');
    setStatusMsg({ text: '', type: '' });

    socket.emit('transfer_request', {
      fromId: identity.id, fromName: identity.name, toId: peer.id,
      filesCount: filesArray.length, totalSize: filesArray.reduce((a, f) => a + f.size, 0)
    }, (response) => {
      if (response?.status === 'accepted') {
        pushFiles(filesArray, peer, response.transferId);
      } else {
        setStatusMsg({ text: `${peer.name} rejected the transfer`, type: 'error' });
        setUploadingTo(null);
      }
    });
  };

  const pushFiles = (filesArray, peer, transferId) => {
    const formData = new FormData();
    filesArray.forEach(f => formData.append('files', f));
    const xhr = new XMLHttpRequest();
    xhr.upload.addEventListener("progress", (e) => { if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100)); });
    xhr.addEventListener("load", () => { setStatusMsg({ text: `Sent ${filesArray.length} file(s) to ${peer.name}`, type: 'success' }); setUploadingTo(null); });
    xhr.addEventListener("error", () => { setStatusMsg({ text: 'Transfer failed', type: 'error' }); setUploadingTo(null); });
    xhr.open("POST", `http://${peer.ip}:${peer.port}/api/p2p/upload`);
    xhr.setRequestHeader('x-transfer-id', transferId);
    xhr.send(formData);
  };

  const deleteFile = (path) => fetch(`${API_URL}/api/files?path=${encodeURIComponent(path)}`, { method: 'DELETE' }).then(fetchFiles);
  const downloadFile = (path, name) => { const a = document.createElement('a'); a.href = `${API_URL}/api/download?path=${encodeURIComponent(path)}`; a.download = name; document.body.appendChild(a); a.click(); a.remove(); };

  // ─── RENDER ──────────────────────────────────────────
  return (
    <div className="min-h-screen bg-wash flex flex-col font-sans">

      {/* ═══ TOP BAR ═══ matching radar_main / history_log templates */}
      <header className="bg-canvas border-b border-black flex items-center justify-between h-14 px-6">
        <div className="flex items-center gap-2.5">
          <span className="material-symbols-outlined text-xl">wifi_tethering</span>
          <h1 className="font-heading font-bold text-lg tracking-tight">Notion Canvas</h1>
        </div>
        <nav className="hidden md:flex items-center gap-8 h-full">
          <button onClick={() => setActiveTab('radar')} className={activeTab === 'radar' ? 'nav-link-active h-full flex items-center' : 'nav-link h-full flex items-center'}>Radar</button>
          <button onClick={() => setActiveTab('shared')} className={activeTab === 'shared' ? 'nav-link-active h-full flex items-center' : 'nav-link h-full flex items-center'}>Shared</button>
          <button onClick={() => setActiveTab('history')} className={activeTab === 'history' ? 'nav-link-active h-full flex items-center' : 'nav-link h-full flex items-center'}>History</button>
          <button onClick={() => setActiveTab('settings')} className={activeTab === 'settings' ? 'nav-link-active h-full flex items-center' : 'nav-link h-full flex items-center'}>Settings</button>
        </nav>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 border border-black rounded-card px-3 py-1.5">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            <span className="mono text-[11px] font-bold">{identity.name}</span>
          </div>
        </div>
      </header>

      {/* ═══ MAIN ═══ */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 md:p-10">

        {/* ─── RADAR TAB ─── matches radar_main.png */}
        {activeTab === 'radar' && (
          <div className="flex flex-col gap-8">

            {/* Sub-header: This Device + Connection Status */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 border border-black rounded-card px-4 py-2 bg-canvas">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-sm">This Device: <strong className="font-heading">{identity.name}</strong></span>
              </div>
              <div className="flex items-center gap-2 bg-black text-white px-5 py-2 rounded-card">
                <span className="material-symbols-outlined text-sm">check_circle</span>
                <span className="text-sm font-medium">Connected to Local Mesh</span>
              </div>
            </div>

            {/* Device Grid Area - dashed border like radar_main */}
            <div className="border-2 border-dashed border-black/20 rounded-card bg-canvas min-h-[400px] md:min-h-[500px] p-4 md:p-8 flex flex-col select-none overflow-hidden">

              {peers.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center gap-4">
                  <span className="material-symbols-outlined text-6xl text-black/10">wifi_tethering</span>
                  <div>
                    <h3 className="font-heading text-2xl font-bold tracking-tight mb-1">SCANNING...</h3>
                    <p className="mono text-xs text-black/40 uppercase tracking-widest">Searching for nearby nodes</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 flex-1 content-center">
                  {peers.map(peer => {
                    const isUploading = uploadingTo === peer.id;
                    return (
                      <div
                        key={peer.id}
                        onDragOver={e => e.preventDefault()}
                        onDrop={e => handleDropOnPeer(e, peer)}
                        onClick={() => { if (!isUploading) { setSelectedPeerTarget(peer); fileInputRef.current?.click(); } }}
                        className="peer-card flex flex-col items-center text-center min-h-[200px] justify-center gap-3 cursor-pointer group"
                      >
                        {isUploading ? (
                          <>
                            {/* Transfer state matching transfer_state_active */}
                            <h4 className="font-heading font-bold text-lg">{peer.name}</h4>
                            <p className="mono text-[10px] text-black/40">{peer.ip}</p>
                            {/* Circular progress */}
                            <div className="relative w-24 h-24 my-2">
                              <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
                                <circle cx="50" cy="50" r="42" fill="none" stroke="#F7F7F5" strokeWidth="8" />
                                <circle cx="50" cy="50" r="42" fill="none" stroke="#000" strokeWidth="8"
                                  strokeDasharray={`${2 * Math.PI * 42}`}
                                  strokeDashoffset={`${2 * Math.PI * 42 * (1 - uploadProgress / 100)}`}
                                  strokeLinecap="butt" className="transition-all duration-300" />
                              </svg>
                              <div className="absolute inset-0 flex flex-col items-center justify-center">
                                <span className="material-symbols-outlined text-lg">upload</span>
                                <span className="font-heading font-bold text-lg">{uploadProgress}%</span>
                              </div>
                            </div>
                            <p className="font-heading font-bold text-sm">Sending...</p>
                            <p className="mono text-[10px] text-black/40 truncate max-w-full">{uploadingFile}</p>
                          </>
                        ) : (
                          <>
                            <DeviceIcon type={peer.type} className="w-12 h-12 text-black/70 group-hover:text-black transition-colors" />
                            <div className="flex flex-col gap-1">
                              <h4 className="font-heading font-bold text-lg leading-tight">{peer.name}</h4>
                              <p className="mono text-[10px] text-black/50 uppercase tracking-wide">{(peer.subtitle || 'Nearby Device')}</p>
                            </div>
                            <div className="flex flex-col items-center gap-2">
                              <div className="border border-black/10 px-2 py-0.5 rounded-sm bg-wash mono text-[8px] font-bold text-black/40">
                                {(peer.type || 'DESKTOP').toUpperCase()}
                              </div>
                              <div className="status-badge text-green-600">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500" /> ONLINE
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                  {/* Discovering placeholder card */}
                  <div className="border border-dashed border-black/20 rounded-card flex flex-col items-center justify-center min-h-[200px] text-black/30">
                    <span className="material-symbols-outlined text-3xl text-accent/50 mb-2">cell_tower</span>
                    <span className="mono text-xs text-accent/70 font-medium">Discovering...</span>
                  </div>
                </div>
              )}
            </div>

            {/* Status Bar - bottom row like radar_main */}
            <div className="flex items-center justify-between border-t border-black/10 pt-4 mt-auto">
              <div className="flex items-center gap-2 text-black/60">
                <span className="material-symbols-outlined text-sm">schedule</span>
                {statusMsg.text ? (
                  <span className="mono text-[11px] flex items-center gap-1.5">
                    14:02 {statusMsg.type === 'success' ? 'Sent' : 'Error'}
                    <span className="px-1.5 py-0.5 bg-black/5 border border-black/10 rounded-sm font-mono text-[10px]">{uploadingFile || 'file'}</span>
                    to {peers.find(p => p.id === uploadingTo)?.name || 'device'}
                  </span>
                ) : (
                  <span className="mono text-[11px]">Ready</span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <div className="w-32 h-1.5 bg-black/5 rounded-full overflow-hidden">
                  <div className="h-full bg-green-500 rounded-full transition-all duration-1000" style={{ width: '100%' }} />
                </div>
                <span className="mono text-[10px] text-black/40 font-bold uppercase tracking-widest">Idle</span>
              </div>
            </div>
          </div>
        )}

        {/* ─── HISTORY TAB ─── matches history_log.png */}
        {activeTab === 'history' && (
          <div>
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="font-heading text-4xl md:text-5xl font-bold tracking-tight">Transfer History</h2>
                <p className="mono text-xs text-black/40 uppercase mt-2">Total: {files.length} files</p>
              </div>
              <div className="flex gap-3">
                <button className="primary-button text-xs">Filter</button>
                <button className="primary-button-filled text-xs flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm">ios_share</span> Export Log
                </button>
              </div>
            </div>

            {/* Table wrapper with horizontal scroll for small windows */}
            <div className="border-t-2 border-black overflow-x-auto -mx-6 px-6 md:mx-0 md:px-0">
              <div className="min-w-[600px]">
                <div className="grid grid-cols-[100px_1fr_100px_140px_80px] gap-4 py-3 border-b border-black/10">
                  <span className="mono text-[10px] font-bold uppercase tracking-widest text-black/50">Date</span>
                  <span className="mono text-[10px] font-bold uppercase tracking-widest text-black/50">File Name</span>
                  <span className="mono text-[10px] font-bold uppercase tracking-widest text-black/50">Direction</span>
                  <span className="mono text-[10px] font-bold uppercase tracking-widest text-black/50">Peer</span>
                  <span className="mono text-[10px] font-bold uppercase tracking-widest text-black/50 text-right">Size</span>
                </div>

                {files.length === 0 ? (
                  <div className="py-16 text-center">
                    <span className="material-symbols-outlined text-4xl text-black/10 mb-3 block">folder_open</span>
                    <p className="text-black/30 text-sm">No transfer history yet</p>
                  </div>
                ) : (
                  files.map((file) => (
                    <div key={file.id} className="grid grid-cols-[100px_1fr_100px_140px_80px] gap-4 py-4 border-b border-black/5 hover:bg-wash transition-colors group items-center">
                      <span className="mono text-xs text-black/40">{new Date(file.lastModified).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="material-symbols-outlined text-sm text-black/40">description</span>
                        <span className="font-medium text-sm truncate">{file.name}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-sm text-green-600">south_west</span>
                        <span className="mono text-[10px] font-bold uppercase text-green-600">Received</span>
                      </div>
                      <span className="text-sm text-black/60">Local</span>
                      <div className="flex items-center justify-end gap-2">
                        <span className="mono text-xs text-black/60 text-right">{formatBytes(file.size)}</span>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => downloadFile(file.path, file.name)} className="p-1 hover:bg-black hover:text-white rounded transition-colors" title="Download">
                            <span className="material-symbols-outlined text-sm">download</span>
                          </button>
                          <button onClick={() => deleteFile(file.path)} className="p-1 hover:bg-accent hover:text-white rounded transition-colors" title="Delete">
                            <span className="material-symbols-outlined text-sm">delete</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* ─── SHARED TAB ─── matches desktop_shared_files_section.png */}
        {activeTab === 'shared' && (
          <div className="flex flex-col gap-10">
            <div className="flex items-end justify-between">
              <div className="flex flex-col gap-3">
                <h2 className="font-heading text-6xl font-bold tracking-tighter leading-none">SHARED</h2>
                <p className="text-black/40 font-medium text-lg">Active peer-to-peer file distribution.</p>
              </div>
              <button
                onClick={() => { setSelectedPeerTarget(peers[0] || null); fileInputRef.current?.click(); }}
                className="share-btn"
              >
                <span className="material-symbols-outlined">add</span>
                Share New File
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
                  {[
                    { name: 'Project_Alpha_Final_v2.pdf', size: '4.2 MB / PDF', peer: 'alex.grotesk', status: 'ACTIVE' },
                    { name: 'Brand_Identity_System.fig', size: '12.8 MB / FIG', peer: 'maria.design', status: 'ACTIVE' },
                    { name: 'Q4_Market_Analysis.xlsx', size: '1.1 MB / XLSX', peer: 'finance_core', status: 'INACTIVE' },
                    { name: 'Security_Protocol_2024.txt', size: '15 KB / TXT', peer: 'admin.node', status: 'ACTIVE' },
                    { name: 'User_Feedback_Raw_Audio.wav', size: '84.5 MB / WAV', peer: 'research_dept', status: 'ACTIVE' },
                  ].map((item, i) => (
                    <tr key={i} className="group hover:bg-wash transition-colors">
                      <td className="font-bold text-sm tracking-tight">{item.name}</td>
                      <td className="mono text-[11px] text-black/50">{item.size}</td>
                      <td className="text-sm font-medium">{item.peer}</td>
                      <td className="status-badge">
                        <div className="flex items-center gap-2">
                          <span className={`w-1.5 h-1.5 rounded-full ${item.status === 'ACTIVE' ? 'bg-black' : 'border border-black'}`} />
                          <span className={`${item.status === 'ACTIVE' ? 'text-black' : 'text-black/30'}`}>{item.status}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between border-t border-black/10 pt-6">
              <p className="mono text-[10px] text-black/30 uppercase tracking-[0.1em]">Showing 1-5 of 24 shared items</p>
              <div className="flex items-center gap-2">
                <button className="w-10 h-10 border-2 border-black flex items-center justify-center hover:bg-wash active:bg-black active:text-white transition-all">
                  <span className="material-symbols-outlined text-base">chevron_left</span>
                </button>
                {[1, 2, 3].map(n => (
                  <button key={n} className={`w-10 h-10 border-2 border-black font-bold mono text-xs transition-all ${n === 1 ? 'bg-black text-white' : 'hover:bg-wash'}`}>
                    {n}
                  </button>
                ))}
                <button className="w-10 h-10 border-2 border-black flex items-center justify-center hover:bg-wash active:bg-black active:text-white transition-all">
                  <span className="material-symbols-outlined text-base">chevron_right</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── SETTINGS TAB ─── matches settings_modal.png */}
        {activeTab === 'settings' && (
          <div className="max-w-lg mx-auto">
            <div className="border border-black rounded-card bg-canvas p-10">
              <div className="flex items-center justify-between mb-10">
                <h2 className="font-heading text-3xl font-bold">Settings</h2>
              </div>

              <div className="space-y-10">
                <div>
                  <span className="mono text-[10px] text-black/40 uppercase tracking-widest block mb-2">Broadcast Name</span>
                  <input type="text" className="underlined-input font-heading text-xl font-bold" defaultValue={identity.name} readOnly />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-base">Visible to others</h4>
                    <p className="text-sm text-black/40 mt-0.5">Allow nearby devices to discover you</p>
                  </div>
                  <div className="w-12 h-7 border-2 border-black rounded-full relative cursor-pointer bg-black">
                    <div className="absolute top-0.5 right-0.5 w-5 h-5 bg-white rounded-full transition-all" />
                  </div>
                </div>

                <div>
                  <span className="mono text-[10px] text-black/40 uppercase tracking-widest block mb-3">Save Destination</span>
                  <div className="flex items-center gap-3 border border-black rounded-card px-4 py-3">
                    <span className="material-symbols-outlined text-black/40">folder</span>
                    <span className="mono text-sm flex-1">~/Downloads/LocalShare</span>
                    <button className="text-sm font-bold underline underline-offset-4">Change</button>
                  </div>
                </div>

                <div className="flex items-center gap-4 pt-4">
                  <button className="text-sm text-black/40 hover:text-black transition-colors">Cancel</button>
                  <button className="primary-button-filled flex-1">Save Changes</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ═══ MOBILE BOTTOM NAV ═══ matches mobile_radar_view_variant_1_1 */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 border-t border-black bg-canvas flex items-center justify-around">
        <button onClick={() => setActiveTab('radar')} className={`flex flex-col items-center gap-0.5 ${activeTab === 'radar' ? 'text-black' : 'text-black/30'}`}>
          <span className="material-symbols-outlined">wifi_tethering</span>
          <span className="mono text-[9px] font-bold uppercase">Radar</span>
        </button>
        <button onClick={() => setActiveTab('history')} className={`flex flex-col items-center gap-0.5 ${activeTab === 'history' ? 'text-black' : 'text-black/30'}`}>
          <span className="material-symbols-outlined">folder</span>
          <span className="mono text-[9px] font-bold uppercase">Files</span>
        </button>
        <button onClick={() => { setSelectedPeerTarget(peers[0] || null); fileInputRef.current?.click(); }} className="w-10 h-10 bg-black flex items-center justify-center text-white">
          <span className="material-symbols-outlined">add</span>
        </button>
        <button onClick={() => setActiveTab('shared')} className={`flex flex-col items-center gap-0.5 ${activeTab === 'shared' ? 'text-black' : 'text-black/30'}`}>
          <span className="material-symbols-outlined">group</span>
          <span className="mono text-[9px] font-bold uppercase">Shared</span>
        </button>
        <button onClick={() => setActiveTab('settings')} className={`flex flex-col items-center gap-0.5 ${activeTab === 'settings' ? 'text-black' : 'text-black/30'}`}>
          <span className="material-symbols-outlined">settings</span>
          <span className="mono text-[9px] font-bold uppercase">Settings</span>
        </button>
      </nav>

      {/* Hidden file input */}
      <input type="file" multiple className="hidden" ref={fileInputRef} onChange={(e) => {
        if (selectedPeerTarget && e.target.files?.length) { initiateTransfer(e.target.files, selectedPeerTarget); setSelectedPeerTarget(null); }
      }} />
    </div>
  );
}

export default App;
