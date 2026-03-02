import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../models/peer.dart';

class PeerCard extends StatelessWidget {
  final Peer peer;
  final bool isUploading;
  final double progress;
  final VoidCallback onTap;

  const PeerCard({
    super.key,
    required this.peer,
    this.isUploading = false,
    this.progress = 0,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          border: Border.all(color: Colors.black, width: 1),
          borderRadius: BorderRadius.circular(4),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.05),
              offset: const Offset(2, 2),
              blurRadius: 0,
            ),
          ],
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            if (isUploading) ...[
              Text(
                peer.name,
                style: GoogleFonts.spaceGrotesk(
                  fontWeight: FontWeight.bold,
                  fontSize: 16,
                ),
              ),
              const SizedBox(height: 12),
              Stack(
                alignment: Alignment.center,
                children: [
                  SizedBox(
                    width: 64,
                    height: 64,
                    child: CircularProgressIndicator(
                      value: progress / 100,
                      strokeWidth: 6,
                      backgroundColor: const Color(0xFFF7F7F5),
                      valueColor:
                          const AlwaysStoppedAnimation<Color>(Colors.black),
                    ),
                  ),
                  Column(
                    children: [
                      const Icon(Icons.upload, size: 16),
                      Text(
                        '${progress.toInt()}%',
                        style: GoogleFonts.spaceGrotesk(
                          fontWeight: FontWeight.bold,
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Text(
                'SENDING...',
                style: GoogleFonts.spaceGrotesk(
                  fontWeight: FontWeight.bold,
                  fontSize: 12,
                ),
              ),
            ] else ...[
              _buildIcon(peer.type),
              const SizedBox(height: 12),
              Text(
                peer.name,
                style: GoogleFonts.spaceGrotesk(
                  fontWeight: FontWeight.bold,
                  fontSize: 16,
                ),
              ),
              Text(
                peer.type.toUpperCase(),
                style: GoogleFonts.jetBrainsMono(
                  fontSize: 9,
                  color: Colors.black54,
                  letterSpacing: 1,
                ),
              ),
              const SizedBox(height: 8),
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 6,
                    height: 6,
                    decoration: const BoxDecoration(
                      color: Colors.green,
                      shape: BoxShape.circle,
                    ),
                  ),
                  const SizedBox(width: 6),
                  Text(
                    'ONLINE',
                    style: GoogleFonts.jetBrainsMono(
                      fontSize: 9,
                      fontWeight: FontWeight.bold,
                      color: Colors.green,
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildIcon(String type) {
    IconData iconData;
    switch (type.toLowerCase()) {
      case 'phone':
      case 'android':
      case 'ios':
        iconData = Icons.smartphone;
        break;
      case 'windows':
      case 'desktop':
        iconData = Icons.desktop_windows_outlined;
        break;
      default:
        iconData = Icons.laptop;
    }
    return Icon(iconData, size: 40, color: Colors.black.withValues(alpha: 0.7));
  }
}
