import 'dart:async';
import 'dart:io';
import 'package:nsd/nsd.dart';
import 'package:flutter/foundation.dart' as foundation;
import 'dart:convert';
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
  io.Socket? _socket;

  Future<void> init(String deviceName) async {
    // 1. Start mDNS Discovery
    _discovery = await startDiscovery('_antahkarn._tcp');
    _discovery!.addListener(() {
      final services = _discovery!.services;
      debugPrint('Discovered services: ${services.length}');

      // Update peers list
      final currentPeers = services.map((s) => Peer.fromMdns(s)).toList();
      _peersController.add(currentPeers);
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
    ws.add(JSON.encode({
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

  Future<void> dispose() async {
    if (_registration != null) {
      await unregister(_registration!);
    }
    if (_discovery != null) {
      await stopDiscovery(_discovery!);
    }
    _socket?.dispose();
    _peersController.close();
  }
}

// Helper for logging using foundation's debugPrint
void debugPrint(String msg) => foundation.debugPrint('[P2P] $msg');
