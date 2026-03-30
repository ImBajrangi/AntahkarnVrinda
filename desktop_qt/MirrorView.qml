import QtQuick
import QtQuick.Controls

Item {
    id: root
    property string source: "image://mirror/frame"
    
    Rectangle {
        id: mirrorContainer
        anchors.fill: parent
        color: "#000000"
        border.color: "#353534"
        border.width: 1

        Image {
            id: mirrorImage
            anchors.fill: parent
            source: root.source
            fillMode: Image.PreserveAspectFit
            cache: false
            
            // Background grid for that tactical look
            Canvas {
                anchors.fill: parent
                onPaint: {
                    var ctx = getContext("2d");
                    ctx.strokeStyle = "rgba(80, 255, 176, 0.05)";
                    ctx.lineWidth = 1;
                    for (var x = 0; x < width; x += 40) {
                        ctx.beginPath();
                        ctx.moveTo(x, 0);
                        ctx.lineTo(x, height);
                        ctx.stroke();
                    }
                    for (var y = 0; y < height; y += 40) {
                        ctx.beginPath();
                        ctx.moveTo(0, y);
                        ctx.lineTo(width, y);
                        ctx.stroke();
                    }
                }
            }
        }

        // Mouse interaction for control injection
        MouseArea {
            anchors.fill: parent
            hoverEnabled: true
            
            onPressed: (mouse) => {
                var normX = mouse.x / width;
                var normY = mouse.y / height;
                mirrorClient.sendControl("DOWN", normX, normY);
            }
            
            onReleased: (mouse) => {
                var normX = mouse.x / width;
                var normY = mouse.y / height;
                mirrorClient.sendControl("UP", normX, normY);
            }
            
            onPositionChanged: (mouse) => {
                if (pressed) {
                    var normX = mouse.x / width;
                    var normY = mouse.y / height;
                    mirrorClient.sendControl("MOVE", normX, normY);
                }
            }
        }
        
        // Scanline effect
        Rectangle {
            anchors.fill: parent
            gradient: Gradient {
                GradientStop { position: 0.0; color: "transparent" }
                GradientStop { position: 0.5; color: "#0550FFB0" }
                GradientStop { position: 1.0; color: "transparent" }
            }
            opacity: 0.5
            
            NumberAnimation on y {
                from: -parent.height
                to: parent.height
                duration: 4000
                loops: Animation.Infinite
            }
        }
    }
    
    // Status overlay
    Text {
        anchors.top: parent.top
        anchors.left: parent.left
        anchors.margins: 10
        text: "STREAMING: " + (mirrorClient.isMirroring ? "ACTIVE" : "IDLE")
        color: mirrorClient.isMirroring ? "#50FFB0" : "#859589"
        font.family: "Space Grotesk"
        font.pixelSize: 12
        font.bold: true
    }
}
