import 'dart:async';
import 'package:flutter/services.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

class MirrorService {
  static final MirrorService _instance = MirrorService._internal();
  factory MirrorService() => _instance;
  MirrorService._internal();

  RTCPeerConnection? _peerConnection;
  MediaStream? _localStream;
  RTCDataChannel? _dataChannel;
  io.Socket? _socket;

  final _controlChannel = const MethodChannel('com.antahkarn.vrinda/control');

  Future<void> startMirroring(io.Socket socket, String targetPeerId) async {
    _socket = socket;

    // 1. Setup PeerConnection
    final configuration = {
      'iceServers': [
        {'urls': 'stun:stun.l.google.com:19302'},
      ]
    };
    
    _peerConnection = await createPeerConnection(configuration);

    // 2. Capture Screen
    final Map<String, dynamic> mediaConstraints = {
      'audio': false,
      'video': {
        'mandatory': {
          'minWidth': '720',
          'minHeight': '1280',
          'minFrameRate': '30',
        },
        'facingMode': 'user',
        'optional': [],
      }
    };

    try {
      _localStream = await navigator.mediaDevices.getDisplayMedia(mediaConstraints);
      _localStream!.getTracks().forEach((track) {
        _peerConnection!.addTrack(track, _localStream!);
      });
    } catch (e) {
      print('Failed to get display media: $e');
      return;
    }

    // 3. Setup Data Channel for Remote Control
    RTCDataChannelInit dataChannelDict = RTCDataChannelInit();
    _dataChannel = await _peerConnection!.createDataChannel('control', dataChannelDict);
    _dataChannel!.onMessage = (RTCDataChannelMessage message) {
      _handleRemoteEvent(message.text);
    };

    // 4. Handle ICE Candidates
    _peerConnection!.onIceCandidate = (candidate) {
      _socket!.emit('webrtc_signal', {
        'to': targetPeerId,
        'type': 'candidate',
        'candidate': candidate.toMap(),
      });
    };

    // 5. Create Offer
    RTCSessionDescription offer = await _peerConnection!.createOffer();
    await _peerConnection!.setLocalDescription(offer);

    _socket!.emit('webrtc_signal', {
      'to': targetPeerId,
      'type': 'offer',
      'sdp': offer.sdp,
    });

    // 6. Listen for Answer
    _socket!.on('webrtc_signal', (data) async {
      if (data['type'] == 'answer') {
        var answer = RTCSessionDescription(data['sdp'], 'answer');
        await _peerConnection!.setRemoteDescription(answer);
      } else if (data['type'] == 'candidate') {
        var candidate = RTCIceCandidate(
          data['candidate']['candidate'],
          data['candidate']['sdpMid'],
          data['candidate']['sdpMLineIndex'],
        );
        await _peerConnection!.addCandidate(candidate);
      }
    });
  }

  void _handleRemoteEvent(String data) {
    // data format: "tap:x,y" or "swipe:x1,y1,x2,y2,duration"
    final parts = data.split(':');
    if (parts.isEmpty) return;

    final action = parts[0];
    final coords = parts[1].split(',');

    if (action == 'tap' && coords.length == 2) {
      _controlChannel.invokeMethod('tap', {
        'x': double.tryParse(coords[0]),
        'y': double.tryParse(coords[1]),
      });
    } else if (action == 'swipe' && coords.length == 5) {
      _controlChannel.invokeMethod('swipe', {
        'x1': double.tryParse(coords[0]),
        'y1': double.tryParse(coords[1]),
        'x2': double.tryParse(coords[2]),
        'y2': double.tryParse(coords[3]),
        'duration': int.tryParse(coords[4]),
      });
    }
  }

  Future<void> stopMirroring() async {
    _localStream?.getTracks().forEach((track) => track.stop());
    _localStream?.dispose();
    _peerConnection?.close();
    _peerConnection?.dispose();
    _dataChannel?.close();
    _socket?.off('webrtc_signal');
  }
}
