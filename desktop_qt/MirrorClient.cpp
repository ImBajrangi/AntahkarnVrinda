#include "MirrorClient.h"
#include <QDebug>
#include <QNetworkDatagram>
#include <QJsonObject>
#include <QJsonDocument>
#include <thread>

using grpc::Channel;
using grpc::ClientContext;
using grpc::ClientReader;
using grpc::Status;
using antahkarn::ScreenChunk;
using antahkarn::ControlEvent;

MirrorClient::MirrorClient(QObject *parent) : QObject(parent)
{
    m_imageProvider = new MirrorImageProvider();
    setupDiscovery();
}

MirrorClient::~MirrorClient()
{
    stopMirroring();
}

void MirrorClient::setupDiscovery()
{
    m_udpSocket = new QUdpSocket(this);
    m_udpSocket->bind(8888, QUdpSocket::ShareAddress);
    connect(m_udpSocket, &QUdpSocket::readyRead, this, &MirrorClient::handleDiscoveryDatagram);
}

void MirrorClient::startDiscovery()
{
    qDebug() << "[MirrorClient] Starting Peer Discovery on port 8888...";
    m_status = "Scanning...";
    emit statusChanged();
}

void MirrorClient::handleDiscoveryDatagram()
{
    while (m_udpSocket->hasPendingDatagrams()) {
        QNetworkDatagram datagram = m_udpSocket->receiveDatagram();
        QJsonDocument doc = QJsonDocument::fromJson(datagram.data());
        if (!doc.isNull() && doc.isObject()) {
            QJsonObject obj = doc.object();
            QString deviceId = obj["id"].toString();
            QString name = obj["name"].toString();
            QString ip = datagram.senderAddress().toString();
            int port = obj["port"].toInt();

            // Track unique peers
            bool exists = false;
            for (const QVariant &p : m_peers) {
                if (p.toMap()["id"].toString() == deviceId) {
                    exists = true;
                    break;
                }
            }

            if (!exists) {
                QVariantMap peer;
                peer["id"] = deviceId;
                peer["name"] = name;
                peer["ip"] = ip;
                peer["port"] = port;
                m_peers.append(peer);
                emit peersChanged();
                qDebug() << "[MirrorClient] Discovered" << name << "at" << ip;
            }
        }
    }
}

void MirrorClient::connectToPeer(const QString &ip, int port)
{
    QString targetUri = QString("%1:%2").arg(ip).arg(port);
    qDebug() << "[MirrorClient] Connecting to gRPC server at" << targetUri;
    
    auto channel = grpc::CreateChannel(targetUri.toStdString(), grpc::InsecureChannelCredentials());
    m_mirrorStub = antahkarn::MirrorService::NewStub(channel);
    m_deviceStub = antahkarn::DeviceService::NewStub(channel);
    
    m_status = "Connected to " + ip;
    emit statusChanged();
}

void MirrorClient::startMirroring()
{
    if (!m_mirrorStub) return;
    
    m_isMirroring = true;
    m_status = "Mirroring Active";
    emit statusChanged();
    
    // Run stream in background thread
    std::thread([this]() {
        ClientContext context;
        antahkarn::DeviceInfo req; 
        req.set_device_id("desktop-agent");
        
        // This is now a Server-to-Client stream
        auto reader = m_mirrorStub->StreamScreen(&context, req);
        ScreenChunk chunk;
        while (m_isMirroring && reader->Read(&chunk)) {
            QImage img = QImage::fromData(reinterpret_cast<const uchar*>(chunk.data().data()), chunk.data().size());
            if (!img.isNull()) {
                m_imageProvider->updateFrame(img);
                emit frameReceived(img);
            }
        }
        reader->Finish();
    }).detach();
}

void MirrorClient::stopMirroring()
{
    m_isMirroring = false;
    m_status = "Disconnected";
    emit statusChanged();
}

void MirrorClient::sendControl(const QString &type, float x, float y, int key)
{
    if (!m_mirrorStub) return;
    
    ControlEvent event;
    event.set_type(type.toStdString());
    event.set_x(x);
    event.set_y(y);
    event.set_key_code(key);
    
    ClientContext context;
    antahkarn::EventStatus status;
    m_mirrorStub->SendControlEvent(&context, event, &status);
}
