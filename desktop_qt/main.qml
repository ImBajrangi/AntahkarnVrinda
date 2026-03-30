import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Layouts 1.15
import QtQuick.Window 2.15

Window {
    id: mainRoot
    width: 1000
    height: 800
    visible: true
    title: "AntahkarnVrinda | Professional Core"
    color: "#F7F7F5" // Notion Base White

    // ═══ CUSTOM DESIGN TOKENS ═══
    property color colorText: "#000000"
    property color colorAccent: "#000000"
    property color colorWash: "#FFFFFF"
    property int radiusCard: 12

    ColumnLayout {
        anchors.fill: parent
        spacing: 0

        // ═══ TOP NAVBAR ═══
        Rectangle {
            Layout.fillWidth: true
            height: 60
            color: "#FFFFFF"
            border.color: "#000000"
            border.width: 1

            RowLayout {
                anchors.fill: parent
                anchors.leftMargin: 20
                anchors.rightMargin: 20
                spacing: 40

                Text {
                    text: "AntahkarnVrinda"
                    font.pixelSize: 18
                    font.bold: true
                    letterSpacing: -0.5
                }

                Row {
                    Layout.fillWidth: true
                    spacing: 30
                    Repeater {
                        model: ["Radar", "Shared", "History", "Settings"]
                        Text {
                            text: modelData
                            font.pixelSize: 14
                            font.weight: modelData === "Radar" ? Font.Bold : Font.Normal
                            opacity: modelData === "Radar" ? 1 : 0.4
                            MouseArea {
                                anchors.fill: parent
                                cursorShape: Qt.PointingHandCursor
                            }
                        }
                    }
                }

                // Node Badge
                Rectangle {
                    width: 120
                    height: 32
                    radius: 6
                    border.color: "#000000"
                    color: "transparent"
                    RowLayout {
                        anchors.centerIn: parent
                        spacing: 8
                        Rectangle {
                            width: 8; height: 8; radius: 4; color: "#22C55E"
                        }
                        Text { text: "Studio Core"; font.pixelSize: 11; font.bold: true }
                    }
                }
            }
        }

        // ═══ MAIN CONTENT AREA ═══
        Item {
            Layout.fillWidth: true
            Layout.fillHeight: true

            // Radar Scanning Interface (The "Disturbance" fix + Pro Look)
            ColumnLayout {
                anchors.fill: parent
                anchors.margins: 40
                spacing: 40

                RowLayout {
                    Layout.fillWidth: true
                    Text {
                        text: "RADAR SCANNING"
                        font.pixelSize: 48
                        font.bold: true
                        font.family: "Inter"
                        letterSpacing: -2
                    }
                    Rectangle {
                        Layout.fillWidth: true; height: 2; color: "#000000"
                    }
                }

                // Grid of Devices
                GridLayout {
                    columns: 4
                    rowSpacing: 20
                    columnSpacing: 20
                    Layout.fillWidth: true

                    // Placeholder Node
                    Rectangle {
                        width: 220
                        height: 280
                        radius: radiusCard
                        border.color: "#000000"
                        border.width: 2
                        color: "#FFFFFF"

                        ColumnLayout {
                            anchors.centerIn: parent
                            spacing: 15
                            Image {
                                source: "https://vrindopnishad.in/assets/phone_frame.png" // Mock
                                width: 64; height: 64; fillMode: Image.PreserveAspectFit
                            }
                            Text { text: "PIXEL 9 PRO"; font.pixelSize: 16; font.bold: true; Layout.alignment: Qt.AlignHCenter }
                            Text { text: "ANDROID 14"; font.pixelSize: 10; opacity: 0.4; Layout.alignment: Qt.AlignHCenter }
                            
                            Button {
                                text: "MIRROR STREAM"
                                flat: true
                                font.bold: true
                                background: Rectangle {
                                    border.color: "#000000"
                                    color: parent.hovered ? "#000000" : "transparent"
                                }
                                contentItem: Text { text: parent.text; color: parent.hovered ? "#FFFFFF" : "#000000"; font.bold: true; horizontalAlignment: Text.AlignHCenter }
                            }
                        }
                    }
                }
            }
        }
    }
}
