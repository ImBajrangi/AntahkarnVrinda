import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'dart:async';
import 'dart:io';
import 'dart:math' as math;
import 'package:file_picker/file_picker.dart';
import 'package:permission_handler/permission_handler.dart';
import 'services/p2p_service.dart';
import 'models/peer.dart';
import 'widgets/transfer_dialog.dart';
import 'widgets/radar_painter.dart';

void main() {
  runApp(const LocalShareApp());
}

class LocalShareApp extends StatelessWidget {
  const LocalShareApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Local Share',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        scaffoldBackgroundColor: const Color(0xFFF7F7F5), // Wash
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFFE04F38), // Accent
          primary: Colors.black, // Ink
          secondary: const Color(0xFFE04F38),
          surface: Colors.white, // Canvas
        ),
        textTheme: GoogleFonts.interTextTheme().copyWith(
          displayLarge: GoogleFonts.spaceGrotesk(
            fontWeight: FontWeight.bold,
            color: Colors.black,
          ),
          titleLarge: GoogleFonts.spaceGrotesk(
            fontWeight: FontWeight.bold,
            color: Colors.black,
          ),
        ),
      ),
      home: const MainLayout(),
    );
  }
}

class MainLayout extends StatefulWidget {
  const MainLayout({super.key});

  @override
  State<MainLayout> createState() => _MainLayoutState();
}

class _MainLayoutState extends State<MainLayout> {
  int _currentIndex = 0;
  final P2pService _p2p = P2pService();
  List<Peer> _peers = [];
  StreamSubscription? _peersSub;

  @override
  void initState() {
    super.initState();
    _requestPermissionsAndInit();
  }

  Future<void> _requestPermissionsAndInit() async {
    if (Platform.isAndroid) {
      await [
        Permission.storage,
        Permission.manageExternalStorage,
      ].request();
    }
    _initP2P();
  }

  void _initP2P() async {
    await _p2p.init('MOBILE-NODE');
    _peersSub = _p2p.peersStream.listen((list) {
      if (mounted) setState(() => _peers = list);
    });
  }

  @override
  void dispose() {
    _peersSub?.cancel();
    _p2p.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        scrolledUnderElevation: 0,
        title: Row(
          children: [
            const Icon(Icons.wifi_tethering, color: Colors.black),
            const SizedBox(width: 12),
            Text(
              'RADAR',
              style: GoogleFonts.spaceGrotesk(
                fontSize: 18,
                fontWeight: FontWeight.bold,
                color: Colors.black,
              ),
            ),
          ],
        ),
        actions: [
          Container(
            height: 32,
            margin: const EdgeInsets.only(right: 12),
            child: ElevatedButton(
              onPressed: () {},
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF2B5CE7), // Template blue
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(2)),
                padding: const EdgeInsets.symmetric(horizontal: 20),
                elevation: 0,
              ),
              child: Text(
                'SCAN',
                style: GoogleFonts.spaceGrotesk(
                  fontWeight: FontWeight.bold,
                  fontSize: 12,
                ),
              ),
            ),
          ),
          Container(
            width: 32,
            height: 32,
            margin: const EdgeInsets.only(right: 16),
            decoration: BoxDecoration(
              border: Border.all(color: Colors.black),
              color: Colors.white,
            ),
            child:
                const Icon(Icons.person_outline, size: 20, color: Colors.black),
          ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(48),
          child: Container(
            decoration: const BoxDecoration(
              border: Border(
                top: BorderSide(color: Colors.black, width: 1),
                bottom: BorderSide(color: Colors.black, width: 1),
              ),
            ),
            child: Row(
              children: [
                _buildTab(0, Icons.wifi_tethering, 'RADAR'),
                _buildTab(1, Icons.folder_outlined, 'FILES'),
                _buildTab(3, Icons.share_outlined, 'SHARED'),
                _buildTab(2, Icons.settings_outlined, 'SETTINGS'),
              ],
            ),
          ),
        ),
      ),
      body: _currentIndex == 0
          ? RadarView(
              peers: _peers,
              onSelectPeer: (peer) async {
                FilePickerResult? result =
                    await FilePicker.platform.pickFiles(allowMultiple: true);
                if (result != null) {
                  List<File> files =
                      result.paths.map((path) => File(path!)).toList();
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                        content: Text('Starting transfer to ${peer.name}...'),
                        backgroundColor: Colors.black),
                  );
                  _p2p.sendFiles(files, peer);
                }
              },
            )
          : _currentIndex == 1
              ? const HistoryView()
              : _currentIndex == 3
                  ? const SharedView()
                  : const SettingsView(),
    );
  }

  Widget _buildTab(int index, IconData icon, String label) {
    final bool isActive = _currentIndex == index;
    return Expanded(
      child: GestureDetector(
        onTap: () {
          setState(() => _currentIndex = index);
        },
        child: Container(
          height: 48,
          decoration: BoxDecoration(
            color: isActive ? const Color(0xFFF7F7F5) : Colors.white,
            border: index > 0
                ? const Border(left: BorderSide(color: Colors.black, width: 1))
                : null,
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                icon,
                size: 16,
                color: isActive ? Colors.black : Colors.black45,
              ),
              const SizedBox(width: 8),
              Text(
                label,
                style: GoogleFonts.jetBrainsMono(
                  fontSize: 10,
                  fontWeight: FontWeight.bold,
                  color: isActive ? Colors.black : Colors.black45,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class RadarView extends StatelessWidget {
  final List<Peer> peers;
  final Function(Peer) onSelectPeer;
  const RadarView({super.key, required this.peers, required this.onSelectPeer});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        // Concentric Radar Section
        Expanded(
          flex: 6,
          child: Stack(
            children: [
              Center(
                child: CustomPaint(
                  painter: RadarPainter(color: Colors.black.withOpacity(0.05)),
                  size: const Size(double.infinity, double.infinity),
                ),
              ),
              Center(
                child: Container(
                  width: 40,
                  height: 40,
                  decoration: const BoxDecoration(
                    color: Colors.black,
                  ),
                  child: const Icon(Icons.wifi_tethering,
                      color: Colors.white, size: 20),
                ),
              ),
              // Nearby Devices (Randomly Positioned on Circles)
              ...List.generate(peers.length, (index) {
                final angle = (index * 137.5) * (math.pi / 180);
                final radius = 60.0 + (index * 40.0);
                return Positioned(
                  left: math.max(
                      0, math.min(300, 160 + radius * math.cos(angle))),
                  top: math.max(
                      0, math.min(300, 160 + radius * math.sin(angle))),
                  child: GestureDetector(
                    onTap: () => onSelectPeer(peers[index]),
                    child: _buildDeviceNode(peers[index]),
                  ),
                );
              }),
              Positioned(
                bottom: 40,
                left: 0,
                right: 0,
                child: Column(
                  children: [
                    Text(
                      'SCANNING...',
                      style: GoogleFonts.spaceGrotesk(
                        fontSize: 24,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'SEARCHING FOR NEARBY NODES',
                      style: GoogleFonts.jetBrainsMono(
                        fontSize: 10,
                        color: Colors.black45,
                        letterSpacing: 2,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),

        // Recent Transfers Section
        Container(
          width: double.infinity,
          decoration: const BoxDecoration(
            border: Border(top: BorderSide(color: Colors.black, width: 1)),
            color: Color(0xFFF7F7F5),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'RECENT TRANSFERS',
                style: GoogleFonts.jetBrainsMono(
                  fontWeight: FontWeight.bold,
                  fontSize: 12,
                ),
              ),
              const Icon(Icons.unfold_more, size: 16),
            ],
          ),
        ),
        Expanded(
          flex: 4,
          child: Container(
            color: Colors.white,
            child: ListView(
              children: [
                _buildTransferItem('UX_DESIGN_V3.PDF', '12.4 MB', 'COMPLETED',
                    '2M AGO', Colors.blue),
                _buildTransferItem('ASSET_LOGOS_FINAL.ZIP', '45.2 MB',
                    '82% TRANSFERRED', 'ACTIVE', Colors.blue,
                    isActive: true),
                _buildTransferItem('CLIENT_REEL.MP4', '1.2 GB', 'CANCELED',
                    '1H AGO', Colors.red),
              ],
            ),
          ),
        ),

        // VIEW ALL ACTIVITY BUTTON
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(20),
          decoration: const BoxDecoration(
            border: Border(top: BorderSide(color: Colors.black, width: 1)),
          ),
          child: ElevatedButton(
            onPressed: () {},
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFFF7F7F5),
              foregroundColor: Colors.black,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(2),
                side: const BorderSide(color: Colors.black, width: 2),
              ),
              padding: const EdgeInsets.symmetric(vertical: 16),
              elevation: 0,
            ),
            child: Text(
              'VIEW ALL ACTIVITY',
              style: GoogleFonts.spaceGrotesk(
                fontWeight: FontWeight.bold,
                fontSize: 12,
                letterSpacing: 1.5,
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildDeviceNode(Peer peer) {
    return Column(
      children: [
        Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(
            border: Border.all(color: Colors.black),
            color: Colors.white,
          ),
          child: Center(
            child: Text(
              peer.name.substring(0, 2).toUpperCase(),
              style: GoogleFonts.spaceGrotesk(fontWeight: FontWeight.bold),
            ),
          ),
        ),
        Container(
          margin: const EdgeInsets.only(top: 4),
          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
          color: Colors.black,
          child: Text(
            peer.name.toUpperCase(),
            style: GoogleFonts.jetBrainsMono(
              color: Colors.white,
              fontSize: 8,
              fontWeight: FontWeight.bold,
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildTransferItem(
      String name, String size, String status, String time, Color statusColor,
      {bool isActive = false}) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: Color(0xFFEEEEEE))),
      ),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              border: Border.all(color: Colors.black),
              color: const Color(0xFFF7F7F5),
            ),
            child: Icon(
              name.endsWith('.PDF')
                  ? Icons.description_outlined
                  : Icons.image_outlined,
              size: 20,
            ),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name,
                  style: GoogleFonts.spaceGrotesk(
                    fontWeight: FontWeight.bold,
                    fontSize: 13,
                  ),
                ),
                const SizedBox(height: 4),
                Row(
                  children: [
                    Text(
                      '$size  ',
                      style: GoogleFonts.jetBrainsMono(
                          fontSize: 10, color: Colors.black45),
                    ),
                    Text(
                      status,
                      style: GoogleFonts.jetBrainsMono(
                        fontSize: 10,
                        fontWeight: FontWeight.bold,
                        color: statusColor,
                        fontStyle:
                            isActive ? FontStyle.italic : FontStyle.normal,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          if (isActive)
            const Icon(Icons.pause, size: 16)
          else
            Text(
              time,
              style: GoogleFonts.jetBrainsMono(
                  fontSize: 10, color: Colors.black45),
            ),
        ],
      ),
    );
  }
}

class HistoryView extends StatelessWidget {
  const HistoryView({super.key});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Transfer History',
          style: GoogleFonts.spaceGrotesk(
            fontSize: 32,
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(height: 24),
        const Expanded(
          child: Center(
            child: Text('No transfers yet'),
          ),
        ),
      ],
    );
  }
}

class SettingsView extends StatelessWidget {
  const SettingsView({super.key});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Settings',
          style: GoogleFonts.spaceGrotesk(
            fontSize: 32,
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(height: 24),
        // Simplified settings for now
        ListTile(
          title: const Text('Device Name'),
          subtitle: const Text('MOBILE-NODE'),
          trailing: const Icon(Icons.edit),
        ),
        SwitchListTile(
          title: const Text('Visible to others'),
          value: true,
          onChanged: (v) {},
        ),
      ],
    );
  }
}

class SharedView extends StatefulWidget {
  const SharedView({super.key});

  @override
  State<SharedView> createState() => _SharedViewState();
}

class _SharedViewState extends State<SharedView> {
  int _tabIndex = 0;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        // Heading
        Padding(
          padding: const EdgeInsets.all(24.0),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'SHARED',
                    style: GoogleFonts.spaceGrotesk(
                      fontSize: 32,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  Text(
                    'NOTION CANVAS / FILES',
                    style: GoogleFonts.jetBrainsMono(
                      fontSize: 10,
                      color: Colors.black45,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ],
              ),
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  border: Border.all(color: Colors.black, width: 1.5),
                ),
                child: const Icon(Icons.add, color: Colors.black),
              ),
            ],
          ),
        ),

        // Tabs
        Container(
          height: 48,
          margin: const EdgeInsets.symmetric(horizontal: 24),
          decoration: BoxDecoration(
            border: Border.all(color: Colors.black, width: 1.5),
          ),
          child: Row(
            children: [
              _buildSubTab(0, 'SHARED WITH ME'),
              _buildSubTab(1, 'SHARED BY ME'),
            ],
          ),
        ),

        const SizedBox(height: 24),

        // Search
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Container(
            height: 48,
            decoration: BoxDecoration(
              border: Border.all(color: Colors.black, width: 1.5),
            ),
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              children: [
                const Icon(Icons.search, size: 20, color: Colors.black),
                const SizedBox(width: 12),
                Expanded(
                  child: TextField(
                    decoration: InputDecoration(
                      hintText: 'SEARCH FILES...',
                      hintStyle: GoogleFonts.jetBrainsMono(
                        fontSize: 12,
                        color: Colors.black26,
                        fontWeight: FontWeight.bold,
                      ),
                      border: InputBorder.none,
                      isDense: true,
                    ),
                    style: GoogleFonts.jetBrainsMono(
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),

        const SizedBox(height: 24),

        // File List
        Expanded(
          child: ListView(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            children: [
              _buildSharedCard('PR', 'PROJECT_REQUIREMENTS.DOCX',
                  'Shared by Alex Rivera', 'OPEN'),
              _buildSharedCard('BI', 'BRAND_IDENTITY_V2.FIG',
                  'Shared by Jordan Smith', 'OPEN'),
              _buildSharedCard('QS', 'Q3_STRATEGY_DRAFT.DOCX',
                  'Shared by Sarah Chen', 'OPEN'),
              _buildSharedCard(
                  'MA', 'MARKETING_ASSETS.ZIP', 'Access Pending', 'CANCEL',
                  isPending: true),
              _buildSharedCard(
                  'UD', 'USER_DASHBOARD_V1.PNG', 'Shared by Mike Ross', 'OPEN'),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildSubTab(int index, String label) {
    final bool isActive = _tabIndex == index;
    return Expanded(
      child: GestureDetector(
        onTap: () => setState(() => _tabIndex = index),
        child: Container(
          alignment: Alignment.center,
          color: isActive ? Colors.black : Colors.white,
          child: Text(
            label,
            style: GoogleFonts.jetBrainsMono(
              fontSize: 10,
              fontWeight: FontWeight.bold,
              color: isActive ? Colors.white : Colors.black,
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildSharedCard(
      String code, String name, String subtitle, String action,
      {bool isPending = false}) {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      decoration: BoxDecoration(
        border: Border.all(color: Colors.black, width: 1.5),
        color: Colors.white,
      ),
      padding: const EdgeInsets.all(16),
      child: Row(
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              border: Border.all(color: Colors.black, width: 1.5),
            ),
            alignment: Alignment.center,
            child: Text(
              code,
              style: GoogleFonts.spaceGrotesk(
                fontSize: 16,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name,
                  style: GoogleFonts.spaceGrotesk(
                    fontSize: 13,
                    fontWeight: FontWeight.bold,
                    letterSpacing: 0.5,
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
                Text(
                  subtitle,
                  style: GoogleFonts.jetBrainsMono(
                    fontSize: 10,
                    color: isPending ? const Color(0xFF2B5CE7) : Colors.black45,
                    fontWeight: isPending ? FontWeight.bold : FontWeight.normal,
                    fontStyle: isPending ? FontStyle.italic : FontStyle.normal,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Container(
            height: 32,
            child: OutlinedButton(
              onPressed: () {},
              style: OutlinedButton.styleFrom(
                side: const BorderSide(color: Colors.black, width: 1.5),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(2)),
                padding: const EdgeInsets.symmetric(horizontal: 12),
              ),
              child: Text(
                action,
                style: GoogleFonts.jetBrainsMono(
                  fontSize: 10,
                  fontWeight: FontWeight.bold,
                  color: Colors.black,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
