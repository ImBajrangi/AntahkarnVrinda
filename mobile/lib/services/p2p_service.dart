import 'dart:async';
import 'dart:io';
import 'package:nsd/nsd.dart';
import 'package:flutter/foundation.dart' as foundation;
import 'dart:convert';
import 'package:path_provider/path_provider.dart';
import 'mirror_service.dart';
import '../models/peer.dart';

class P2pService {
  static final P2pService _instance = P2pService._internal();
  factory P2pService() => _instance;
  P2pService._internal();

  final _peersController = StreamController<List<Peer>>.broadcast();
  Stream<List<Peer>> get peersStream => _peersController.stream;

  Registration? _registration;
  Discovery? _discovery;
  Socket? _socket;

  Future<void> init(String deviceName) async {
    // 0. Load Cache for seamless feel
    _loadCache();

    // 1. Start mDNS Discovery
    _discovery = await startDiscovery('_antahkarn._tcp');
    _discovery!.addListener(() {
      final services = _discovery!.services;
      final currentPeers = services.map((s) => Peer.fromMdns(s)).toList();
      _peersController.add(currentPeers);
      _saveCache(currentPeers); // Persist
    });

    // 2. Register this device on mDNS (handled by Kotlin service too, but for parity)
    _registration = await register(
      Service(name: deviceName, type: '_antahkarn._tcp', port: 8765),
    );

    debugPrint('Registered as $deviceName on mDNS');
  }

  Future<void> startMirroring(Peer target) async {
    // Direct WebSocket connection for mirroring signaling
    final wsUrl = 'ws://${target.ip}:8765';
    final ws = await WebSocket.connect(wsUrl);
    
    // Send mirroring offer
    ws.add(json.encode({
      'type': 'command',
      'category': 'mirror',
      'action': 'start',
      'payload': { 'quality': 'high' }
    }));
  }

  Future<void> sendFiles(List<File> files, Peer target) async {
    debugPrint('Real-world file transfer initiated to ${target.name}');
    
    final wsUrl = 'ws://${target.ip}:8765';
    final ws = await WebSocket.connect(wsUrl);
    
    for (var file in files) {
      final fileName = file.path.split('/').last;
      final bytes = await file.readAsBytes();
      
      // Send file metadata command
      ws.add(json.encode({
        'type': 'command',
        'category': 'file',
        'action': 'transfer',
        'payload': {
          'name': fileName,
          'size': bytes.length,
          'id': DateTime.now().millisecondsSinceEpoch.toString()
        }
      }));
      
      // Send binary data (chunking logic or direct send)
      ws.add(bytes);
      debugPrint('Sent $fileName (${bytes.length} bytes)');
    }
  }

  Future<void> _saveCache(List<Peer> peers) async {
    try {
      final dir = await getApplicationDocumentsDirectory();
      final file = File('${dir.path}/peers_cache.json');
      final data = peers.map((p) => {
        'id': p.id, 'name': p.name, 'ip': p.ip, 'type': p.type, 'port': p.port
      }).toList();
      await file.writeAsString(json.encode(data));
    } catch (e) {
      debugPrint('Cache save failed: $e');
    }
  }

  Future<void> _loadCache() async {
    try {
      final dir = await getApplicationDocumentsDirectory();
      final file = File('${dir.path}/peers_cache.json');
      if (await file.exists()) {
        final data = json.decode(await file.readAsString()) as List;
        final peers = data.map((item) => Peer(
          id: item['id'], name: item['name'], ip: item['ip'], 
          type: item['type'], port: item['port'] ?? 8765
        )).toList();
        _peersController.add(peers.cast<Peer>());
      }
    } catch (e) {
      debugPrint('Cache load failed: $e');
    }
  }

  void dispose() {
    _peersController.close();
  }
}

// Helper for logging using foundation's debugPrint
void debugPrint(String msg) => foundation.debugPrint('[P2P] $msg');
