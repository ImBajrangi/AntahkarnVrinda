#include <QGuiApplication>
#include <QQmlApplicationEngine>
#include <QQmlContext>
#include <QDebug>
#include "MirrorClient.h"

int main(int argc, char *argv[])
{
    QGuiApplication app(argc, argv);
    app.setOrganizationName("Antahkarn");
    app.setApplicationName("Vrinda Mirror");

    QQmlApplicationEngine engine;
    
    // Register MirrorClient as a QML Type
    MirrorClient mirrorClient;
    engine.rootContext()->setContextProperty("mirrorClient", &mirrorClient);
    engine.addImageProvider(QLatin1String("mirror"), mirrorClient.imageProvider());

    // using namespace Qt::StringLiterals;
    const QUrl url(u"qrc:/com/antahkarn/vrinda/main.qml"_s);
    QObject::connect(&engine, &QQmlApplicationEngine::objectCreated,
        &app, [url](QObject *obj, const QUrl &objUrl) {
            if (!obj && url == objUrl)
                QCoreApplication::exit(-1);
        }, Qt::QueuedConnection);
    engine.load(url);

    return app.exec();
}
