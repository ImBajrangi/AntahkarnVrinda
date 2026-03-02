import 'package:flutter/material.dart';

class RadarPainter extends CustomPainter {
  final Color color;
  final int circleCount;

  RadarPainter({
    required this.color,
    this.circleCount = 4,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.0;

    final center = Offset(size.width / 2, size.height / 2);
    final maxRadius = size.width / 2;

    for (var i = 1; i <= circleCount; i++) {
        final radius = (maxRadius / circleCount) * i;
        canvas.drawCircle(center, radius, paint);
    }
    
    // Draw cross lines if needed, but template shows just circles
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
