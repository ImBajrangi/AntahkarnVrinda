import QtQuick
import QtQuick.Window
import QtQuick.Controls
import QtQuick.Layouts
import com.antahkarn.vrinda

Window {
    id: window
    width: 1280
    height: 800
    visible: true
    title: "AntahkarnVrinda // Tactical Agent"
    // Window-level styling (Font will be set on child text components)
    color: "#131313"

    // Background Grid
    Canvas {
        anchors.fill: parent
        onPaint: {
            var ctx = getContext("2d");
            ctx.strokeStyle = "rgba(133, 149, 137, 0.05)";
            ctx.lineWidth = 1;
            for (var x = 0; x < width; x += 100) {
                ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
            }
            for (var y = 0; y < height; y += 100) {
                ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
            }
        }
    }

    RowLayout {
        anchors.fill: parent
        spacing: 0

        // ════ MAIN VIEWPORT ════
        Item {
            Layout.fillWidth: true
            Layout.fillHeight: true

            ColumnLayout {
                anchors.fill: parent
                anchors.margins: 40
                spacing: 20

                // Header
                RowLayout {
                    Layout.fillWidth: true
                    
                    Text {
                        text: "SYSTEM STATUS: " + mirrorClient.status.toUpperCase()
                        color: "#50FFB0"
                        font.pixelSize: 24
                        font.bold: true
                        font.family: "Space Grotesk"
                        font.letterSpacing: -1
                    }
                    
                    Item { Layout.fillWidth: true }
                    
                    Rectangle {
                        width: 100; height: 30
                        color: "#201f1f"
                        Text {
                            anchors.centerIn: parent
                            text: "NODE 0xAF4"
                            color: "#859589"
                            font.pixelSize: 12
                            font.bold: true
                        }
                    }
                }

                // Mirror View
                MirrorView {
                    id: mirrorView
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    clip: true
                }

                // Footer Controls
                RowLayout {
                    Layout.fillWidth: true
                    spacing: 20
                    
                    Button {
                        text: "START SCAN"
                        onClicked: mirrorClient.startDiscovery()
                        background: Rectangle {
                            color: parent.down ? "#2a2a2a" : "#201f1f"
                            border.color: "#50FFB0"
                            border.width: 1
                        }
                        contentItem: Text {
                            text: parent.text
                            color: "#50FFB0"
                            horizontalAlignment: Text.AlignHCenter
                            verticalAlignment: Text.AlignVCenter
                            font.bold: true
                        }
                    }

                    Button {
                        text: "STOP STREAM"
                        onClicked: mirrorClient.stopMirroring()
                        background: Rectangle {
                            color: parent.down ? "#2a2a2a" : "#201f1f"
                            border.color: "#353534"
                            border.width: 1
                        }
                        contentItem: Text {
                            text: parent.text
                            color: "#859589"
                            horizontalAlignment: Text.AlignHCenter
                            verticalAlignment: Text.AlignVCenter
                            font.bold: true
                        }
                    }
                }
            }
        }

        // ════ SIDEBAR: TELEMETRY ════
        Rectangle {
            Layout.preferredWidth: 320
            Layout.fillHeight: true
            color: "#1c1b1b"
            border.color: "#353534"
            border.width: 1

            ColumnLayout {
                anchors.fill: parent
                anchors.margins: 20
                spacing: 30

                Text {
                    text: "TELEMETRY"
                    color: "#00FFFF"
                    font.pixelSize: 14
                    font.bold: true
                }

                // Peer List
                ListView {
                    id: peerListView
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    model: mirrorClient.peers
                    delegate: ItemDelegate {
                        width: parent.width
                        height: 60
                        onClicked: {
                            mirrorClient.connectToPeer(modelData.ip, modelData.port);
                            mirrorClient.startMirroring();
                        }
                        
                        background: Rectangle {
                            color: parent.hovered ? "#0D00FFFF" : "transparent"
                        }
                        
                        contentItem: Column {
                            Text { text: modelData.name; color: "#e5e2e1"; font.bold: true }
                            Text { text: modelData.ip + ":" + modelData.port; color: "#859589"; font.pixelSize: 10 }
                        }
                    }
                }

                // Hardware Stats (Static Mockup for HUD feel)
                Column {
                    Layout.fillWidth: true
                    spacing: 15
                    
                    TelemetryItem { label: "CPU LOAD"; value: "14.2%"; barValue: 0.14 }
                    TelemetryItem { label: "MEM USAGE"; value: "2.4 GB"; barValue: 0.3 }
                    TelemetryItem { label: "NET MESH"; value: "92 ms"; barValue: 0.8 }
                }
            }
        }
    }

    // Helper component for Telemetry items
    component TelemetryItem : Column {
        property string label: ""
        property string value: ""
        property real barValue: 0.0
        width: parent.width
        spacing: 5
        
        Row {
            width: parent.width
            Text { text: label; color: "#859589"; font.pixelSize: 10; font.bold: true }
            Item { width: 1; height: 1; Layout.fillWidth: true }
            Text { text: value; color: "#50FFB0"; font.pixelSize: 10; font.bold: true; anchors.right: parent.right }
        }
        
        Rectangle {
            width: parent.width
            height: 2
            color: "#2a2a2a"
            Rectangle {
                width: parent.width * barValue
                height: parent.height
                color: "#50FFB0"
            }
        }
    }
}
