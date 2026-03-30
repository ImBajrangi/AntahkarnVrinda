package com.localshare.mobile

import android.app.Service
import android.content.Intent
import android.os.IBinder
import android.util.Log
import org.java_websocket.server.WebSocketServer
import org.java_websocket.WebSocket
import org.java_websocket.handshake.ClientHandshake
import org.json.JSONObject
import java.net.InetSocketAddress
import java.util.UUID

/**
 * AntahkarnVrinda — Android Device Agent
 *
 * Runs as a background service. Acts as BOTH server and client.
 * Accepts incoming WebSocket connections from desktop agents.
 * Discovers and connects to desktop agents via mDNS/NSD.
 */
class DeviceAgentService : Service() {

    companion object {
        const val TAG = "DeviceAgent"
        const val AGENT_PORT = 8765
        val DEVICE_ID: String = UUID.randomUUID().toString()
        var instance: DeviceAgentService? = null
    }

    private var wsServer: AgentWebSocketServer? = null
    private val commandRouter = CommandRouter()
    private val connectedPeers = mutableMapOf<String, WebSocket>()

    override fun onCreate() {
        super.onCreate()
        instance = this
        
        // Register command handlers
        commandRouter.register("device", "info") { msg -> handleDeviceInfo() }
        commandRouter.register("device", "heartbeat") { _ -> JSONObject().put("alive", true).put("timestamp", System.currentTimeMillis()) }
        commandRouter.register("device", "identify") { _ -> JSONObject() } // no-op, we send our identity on connect
        commandRouter.register("device", "battery") { _ -> handleBattery() }
        commandRouter.register("device", "storage") { _ -> handleStorage() }
        commandRouter.register("control", "tap") { msg -> handleTap(msg) }
        commandRouter.register("control", "swipe") { msg -> handleSwipe(msg) }
        commandRouter.register("file", "list") { msg -> handleFileList(msg) }
        commandRouter.register("mirror", "start") { msg -> handleMirrorStart(msg) }
        commandRouter.register("mirror", "stop") { _ -> handleMirrorStop() }
        commandRouter.register("clipboard", "get") { _ -> JSONObject().put("text", "") }
        commandRouter.register("clipboard", "set") { msg -> JSONObject().put("success", true) }

        // Start WebSocket server
        startAgentServer()
        Log.i(TAG, "Device Agent started. ID: $DEVICE_ID")
    }

    private fun startAgentServer() {
        wsServer = AgentWebSocketServer(InetSocketAddress("0.0.0.0", AGENT_PORT))
        wsServer?.start()
        Log.i(TAG, "WebSocket server listening on port $AGENT_PORT")
    }

    // ═══ COMMAND HANDLERS ═══

    private fun handleDeviceInfo(): JSONObject {
        return JSONObject().apply {
            put("deviceId", DEVICE_ID)
            put("deviceName", android.os.Build.MODEL)
            put("deviceType", "android")
            put("platform", "android")
            put("manufacturer", android.os.Build.MANUFACTURER)
            put("sdkVersion", android.os.Build.VERSION.SDK_INT)
            put("release", android.os.Build.VERSION.RELEASE)
        }
    }

    private fun handleBattery(): JSONObject {
        val batteryIntent = registerReceiver(null, android.content.IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        val level = batteryIntent?.getIntExtra(android.os.BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale = batteryIntent?.getIntExtra(android.os.BatteryManager.EXTRA_SCALE, -1) ?: -1
        val pct = if (level >= 0 && scale > 0) (level * 100 / scale) else -1
        val charging = batteryIntent?.getIntExtra(android.os.BatteryManager.EXTRA_STATUS, -1) == android.os.BatteryManager.BATTERY_STATUS_CHARGING
        return JSONObject().put("level", pct).put("charging", charging)
    }

    private fun handleStorage(): JSONObject {
        val stat = android.os.StatFs(android.os.Environment.getExternalStorageDirectory().path)
        return JSONObject().apply {
            put("totalBytes", stat.totalBytes)
            put("freeBytes", stat.freeBytes)
            put("usedBytes", stat.totalBytes - stat.freeBytes)
        }
    }

    private fun handleTap(msg: JSONObject): JSONObject {
        val payload = msg.optJSONObject("payload") ?: JSONObject()
        val x = payload.optDouble("x", 0.0).toFloat()
        val y = payload.optDouble("y", 0.0).toFloat()
        ControlService.instance?.tap(x, y)
        return JSONObject().put("dispatched", true).put("x", x).put("y", y)
    }

    private fun handleSwipe(msg: JSONObject): JSONObject {
        val payload = msg.optJSONObject("payload") ?: JSONObject()
        val x1 = payload.optDouble("x1", 0.0).toFloat()
        val y1 = payload.optDouble("y1", 0.0).toFloat()
        val x2 = payload.optDouble("x2", 0.0).toFloat()
        val y2 = payload.optDouble("y2", 0.0).toFloat()
        val duration = payload.optLong("duration", 300)
        ControlService.instance?.swipe(x1, y1, x2, y2, duration)
        return JSONObject().put("dispatched", true)
    }

    private fun handleFileList(msg: JSONObject): JSONObject {
        val payload = msg.optJSONObject("payload") ?: JSONObject()
        val dirPath = payload.optString("dir", android.os.Environment.getExternalStorageDirectory().path)
        val dir = java.io.File(dirPath)
        val filesArray = org.json.JSONArray()
        
        if (dir.exists() && dir.isDirectory) {
            dir.listFiles()?.forEach { f ->
                filesArray.put(JSONObject().apply {
                    put("name", f.name)
                    put("isDir", f.isDirectory)
                    put("size", if (f.isFile) f.length() else 0)
                    put("lastModified", f.lastModified())
                })
            }
        }
        return JSONObject().put("files", filesArray).put("dir", dirPath)
    }

    private fun handleMirrorStart(msg: JSONObject): JSONObject {
        // Trigger screen capture via MediaProjection (requires user permission)
        Log.i(TAG, "Mirror start requested")
        return JSONObject().put("accepted", true).put("status", "awaiting_permission")
    }

    private fun handleMirrorStop(): JSONObject {
        Log.i(TAG, "Mirror stop requested")
        return JSONObject().put("stopped", true)
    }

    // ═══ WEBSOCKET SERVER ═══

    inner class AgentWebSocketServer(address: InetSocketAddress) : WebSocketServer(address) {
        override fun onOpen(conn: WebSocket, handshake: ClientHandshake) {
            Log.i(TAG, "Peer connected: ${conn.remoteSocketAddress}")
            // Send our identity
            val identityMsg = createMessage("device", "identify", JSONObject().apply {
                put("deviceId", DEVICE_ID)
                put("deviceName", android.os.Build.MODEL)
                put("deviceType", "android")
            })
            conn.send(identityMsg.toString())
        }

        override fun onMessage(conn: WebSocket, message: String) {
            try {
                val msg = JSONObject(message)
                
                // Handle identity from peer
                if (msg.optString("category") == "device" && msg.optString("action") == "identify") {
                    val payload = msg.optJSONObject("payload")
                    val peerId = payload?.optString("deviceId") ?: return
                    connectedPeers[peerId] = conn
                    Log.i(TAG, "Peer identified: ${payload.optString("deviceName")} ($peerId)")
                    return
                }

                // Route commands
                if (msg.optString("type") == "command") {
                    val result = commandRouter.route(msg)
                    val response = createResponse(msg, result, !result.has("error"))
                    conn.send(response.toString())
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error handling message: ${e.message}")
            }
        }

        override fun onClose(conn: WebSocket, code: Int, reason: String, remote: Boolean) {
            Log.i(TAG, "Peer disconnected: ${conn.remoteSocketAddress}")
            connectedPeers.entries.removeIf { it.value == conn }
        }

        override fun onError(conn: WebSocket?, ex: Exception) {
            Log.e(TAG, "WebSocket error: ${ex.message}")
        }

        override fun onStart() {
            Log.i(TAG, "Agent WebSocket server started")
        }
    }

    // ═══ MESSAGE PROTOCOL ═══

    private fun createMessage(category: String, action: String, payload: JSONObject = JSONObject()): JSONObject {
        return JSONObject().apply {
            put("type", "command")
            put("category", category)
            put("action", action)
            put("from", DEVICE_ID)
            put("fromName", android.os.Build.MODEL)
            put("payload", payload)
            put("id", UUID.randomUUID().toString())
            put("timestamp", System.currentTimeMillis())
        }
    }

    private fun createResponse(originalMsg: JSONObject, payload: JSONObject, success: Boolean): JSONObject {
        return JSONObject().apply {
            put("type", "response")
            put("replyTo", originalMsg.optString("id"))
            put("from", DEVICE_ID)
            put("success", success)
            put("payload", payload)
            put("timestamp", System.currentTimeMillis())
        }
    }

    // ═══ PUBLIC API ═══

    fun sendToPeer(peerId: String, category: String, action: String, payload: JSONObject = JSONObject()) {
        val msg = createMessage(category, action, payload)
        connectedPeers[peerId]?.send(msg.toString())
    }

    fun broadcastToPeers(category: String, action: String, payload: JSONObject = JSONObject()) {
        val msg = createMessage(category, action, payload).toString()
        connectedPeers.values.forEach { ws ->
            if (ws.isOpen) ws.send(msg)
        }
    }

    fun getConnectedPeers(): List<Map<String, Any>> {
        return connectedPeers.map { (id, ws) ->
            mapOf("id" to id, "connected" to ws.isOpen)
        }
    }

    // ═══ LIFECYCLE ═══

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        wsServer?.stop()
        instance = null
        Log.i(TAG, "Device Agent stopped")
        super.onDestroy()
    }
}
