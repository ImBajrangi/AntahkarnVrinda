class Peer {
  final String id;
  final String name;
  final String ip;
  final int port;
  final String type;
  bool isOnline;

  Peer({
    required this.id,
    required this.name,
    required this.ip,
    required this.port,
    required this.type,
    this.isOnline = true,
  });

  factory Peer.fromMdns(dynamic service) {
    // This will depend on the 'nsd' package's Service model
    return Peer(
      id: service.name,
      name: service.name, 
      ip: service.addresses.first.address,
      port: service.port,
      type: 'desktop', // Assume desktop for now or check txt records
    );
  }
}
