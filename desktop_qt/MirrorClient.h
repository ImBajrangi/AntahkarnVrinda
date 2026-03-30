#ifndef MIRRORCLIENT_H
#define MIRRORCLIENT_H

#include <QObject>
#include <QImage>
#include <QTimer>
#include <QUdpSocket>
#include <QVariantList>
#include <QQuickImageProvider>
#include <grpcpp/grpcpp.h>
#include "antahkarn.grpc.pb.h"

class MirrorImageProvider : public QQuickImageProvider
{
public:
    MirrorImageProvider() : QQuickImageProvider(QQuickImageProvider::Image) {}
    QImage requestImage(const QString &id, QSize *size, const QSize &requestedSize) override {
        if (size) *size = m_currentFrame.size();
        return m_currentFrame;
    }
    void updateFrame(const QImage &frame) { m_currentFrame = frame; }
private:
    QImage m_currentFrame;
};

class MirrorClient : public QObject
{
    Q_OBJECT
    Q_PROPERTY(QVariantList peers READ peers NOTIFY peersChanged)
    Q_PROPERTY(bool isMirroring READ isMirroring NOTIFY statusChanged)
    Q_PROPERTY(QString status READ status NOTIFY statusChanged)

public:
    explicit MirrorClient(QObject *parent = nullptr);
    ~MirrorClient();

    QVariantList peers() const { return m_peers; }
    bool isMirroring() const { return m_isMirroring; }
    QString status() const { return m_status; }

    Q_INVOKABLE void startDiscovery();
    Q_INVOKABLE void connectToPeer(const QString &ip, int port);
    Q_INVOKABLE void startMirroring();
    Q_INVOKABLE void stopMirroring();
    Q_INVOKABLE void sendControl(const QString &type, float x, float y, int key = 0);

    MirrorImageProvider* imageProvider() { return m_imageProvider; }

signals:
    void peersChanged();
    void statusChanged();
    void frameReceived(const QImage &image);

private:
    void setupDiscovery();
    void handleDiscoveryDatagram();
    void runMirrorStream(const QString &targetUri);

    QVariantList m_peers;
    bool m_isMirroring = false;
    QString m_status = "Disconnected";
    QUdpSocket *m_udpSocket = nullptr;
    MirrorImageProvider *m_imageProvider = nullptr;
    
    std::unique_ptr<antahkarn::MirrorService::Stub> m_mirrorStub;
    std::unique_ptr<antahkarn::DeviceService::Stub> m_deviceStub;
};

#endif // MIRRORCLIENT_H
