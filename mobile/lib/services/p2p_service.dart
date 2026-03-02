import 'dart:async';
import 'dart:io';
import 'package:nsd/nsd.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import 'package:dio/dio.dart';
import '../models/peer.dart';

class P2pService {
  static final P2pService _instance = P2pService._internal();
  factory P2pService() => _instance;
  P2pService._internal();

  final _peersController = StreamController<List<Peer>>.broadcast();
  Stream<List<Peer>> get peersStream => _peersController.stream;

  final Map<String, Peer> _discoveredPeers = {};
  Registration? _registration;
  Discovery? _discovery;
  io.Socket? _socket;

  Future<void> init(String deviceName) async {
    // 1. Start mDNS Discovery
    _discovery = await startDiscovery('_localshare._tcp');
    // _discovery = await startDiscovery('_localshare._tcp');
    _discovery!.addListener(() {
      final services = _discovery!.services;
      debugPrint('Discovered services: ${services.length}');

      // Update peers list
      final currentPeers = services.map((s) => Peer.fromMdns(s)).toList();
      _peersController.add(currentPeers);
    });

    // 2. Register this device on mDNS
    _registration = await register(
      Service(name: deviceName, type: '_localshare._tcp', port: 3000),
    );

    debugPrint('Registered as $deviceName on mDNS');
  }

  Future<void> sendFiles(List<File> files, Peer target) async {
    // 1. Connect to peer's socket for signaling
    final peerUrl = 'http://${target.ip}:${target.port}';
    final socket = io.io(peerUrl, <String, dynamic>{
      'transports': ['websocket'],
      'autoConnect': false,
    });

    socket.connect();

    socket.onConnect((_) {
      debugPrint('Connected to peer socket');

      // 2. Request transfer
      socket.emit('transfer_request', {
        'fromId': 'mobile-node',
        'fromName': 'My Phone',
        'filesCount': files.length,
        'totalSize': files.fold(0, (sum, f) => sum + f.lengthSync()),
      });
    });

    socket.on('transfer_response', (data) async {
      if (data['status'] == 'accepted') {
        final transferId = data['transferId'];
        // 3. Upload files via HTTP
        await _uploadFiles(files, target, transferId);
      }
    });
  }

  Future<void> _uploadFiles(
      List<File> files, Peer target, String transferId) async {
    final dio = Dio();
    final formData = FormData();

    for (var file in files) {
      formData.files.add(MapEntry(
        'files',
        await MultipartFile.fromFile(file.path,
            filename: file.path.split('/').last),
      ));
    }

    try {
      await dio.post(
        'http://${target.ip}:${target.port}/api/p2p/upload',
        data: formData,
        options: Options(
          headers: {'x-transfer-id': transferId},
        ),
        onSendProgress: (sent, total) {
          debugPrint(
              'Upload progress: ${(sent / total * 100).toStringAsFixed(0)}%');
        },
      );
    } catch (e) {
      debugPrint('Upload failed: $e');
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

// Helper for logging since 'foundation' might not be imported
void debugPrint(String msg) => print('[P2P] $msg');
