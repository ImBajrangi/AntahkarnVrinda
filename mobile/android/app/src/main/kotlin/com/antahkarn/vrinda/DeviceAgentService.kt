package com.antahkarn.vrinda

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
    private var screenCaptureHandler: ScreenCaptureHandler? = null
    private val commandRouter = CommandRouter()
    private val connectedPeers = mutableMapOf<String, WebSocket>()

    override fun onCreate() {
        super.onCreate()
        instance = this
        
        // 1. Setup Foreground Notification (Required for Android 8+)
        createNotificationChannel()
        val notification = android.app.Notification.Builder(this, "antahkarn_channel")
            .setContentTitle("Antahkarn Agent Active")
            .setContentText("Unified mesh synchronization active")
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .build()
        startForeground(1, notification)
        
        // 2. Register command handlers
        commandRouter.register("device", "info") { _ -> handleDeviceInfo() }
        commandRouter.register("device", "heartbeat") { _ -> JSONObject().put("alive", true).put("timestamp", System.currentTimeMillis()) }
        commandRouter.register("device", "identify") { _ -> JSONObject() } 
        commandRouter.register("device", "battery") { _ -> handleBattery() }
        commandRouter.register("device", "storage") { _ -> handleStorage() }
        commandRouter.register("device", "status") { _ -> handleStatus() }
        commandRouter.register("shell", "run") { msg -> handleShellRun(msg) }
        commandRouter.register("control", "tap") { msg -> handleTap(msg) }
        commandRouter.register("control", "swipe") { msg -> handleSwipe(msg) }
        commandRouter.register("file", "list") { msg -> handleFileList(msg) }
        commandRouter.register("mirror", "start") { msg -> handleMirrorStart(msg) }
        commandRouter.register("mirror", "stop") { _ -> handleMirrorStop() }
        commandRouter.register("clipboard", "get") { _ -> handleClipboardGet() }
        commandRouter.register("clipboard", "set") { msg -> handleClipboardSet(msg) }
        
        screenCaptureHandler = ScreenCaptureHandler(this, this)

        // 3. Start WebSocket server
        startAgentServer()
        
        // 4. Register on mDNS (NSD) for the antahkarn mesh
        registerServiceNsd()
        
        Log.i(TAG, "Device Agent started. ID: $DEVICE_ID")
    }

    private fun createNotificationChannel() {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            val serviceChannel = android.app.NotificationChannel(
                "antahkarn_channel", "Antahkarn Agent Channel",
                android.app.NotificationManager.IMPORTANCE_DEFAULT
            )
            val manager = getSystemService(android.app.NotificationManager::class.java)
            manager.createNotificationChannel(serviceChannel)
        }
    }

    private fun registerServiceNsd() {
        val nsdManager = getSystemService(android.content.Context.NSD_SERVICE) as android.net.nsd.NsdManager
        val serviceInfo = android.net.nsd.NsdServiceInfo().apply {
            serviceName = "Vrinda-${android.os.Build.MODEL}-${DEVICE_ID.take(4)}"
            serviceType = "_antahkarn._tcp"
            port = AGENT_PORT
            setAttribute("id", DEVICE_ID)
            setAttribute("name", android.os.Build.MODEL)
            setAttribute("type", "android")
        }
        
        try {
            nsdManager.registerService(serviceInfo, android.net.nsd.NsdManager.PROTOCOL_DNS_SD, object : android.net.nsd.NsdManager.RegistrationListener {
                override fun onServiceRegistered(NsdServiceInfo: android.net.nsd.NsdServiceInfo) {
                    Log.i(TAG, "Registered as ${NsdServiceInfo.serviceName} on mDNS")
                }
                override fun onRegistrationFailed(serviceInfo: android.net.nsd.NsdServiceInfo, errorCode: Int) {
                    Log.e(TAG, "mDNS Registration failed: $errorCode")
                }
                override fun onServiceUnregistered(arg0: android.net.nsd.NsdServiceInfo) {}
                override fun onUnregistrationFailed(serviceInfo: android.net.nsd.NsdServiceInfo, errorCode: Int) {}
            })
        } catch (e: Exception) {
            Log.e(TAG, "NSD initialization error: ${e.message}")
        }
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

    private fun handleStatus(): JSONObject {
        val activityManager = getSystemService(android.content.Context.ACTIVITY_SERVICE) as android.app.ActivityManager
        val memoryInfo = android.app.ActivityManager.MemoryInfo()
        activityManager.getMemoryInfo(memoryInfo)
        
        return JSONObject().apply {
            put("battery", handleBattery())
            put("storage", handleStorage())
            put("ram", JSONObject().apply {
                put("total", memoryInfo.totalMem)
                put("available", memoryInfo.availMem)
                put("used", memoryInfo.totalMem - memoryInfo.availMem)
                put("lowMemory", memoryInfo.lowMemory)
            })
            put("timestamp", System.currentTimeMillis())
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
        // Launch the activity to get permission
        val intent = Intent(this, CapturePermissionActivity::class.java)
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        startActivity(intent)
        return JSONObject().put("accepted", true).put("status", "awaiting_permission")
    }

    fun handleCapturePermissionGranted(resultCode: Int, data: Intent) {
        screenCaptureHandler?.start(resultCode, data)
    }

    private fun handleClipboardGet(): JSONObject {
        val clipboard = getSystemService(android.content.Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
        val clip = clipboard.primaryClip
        val text = if (clip != null && clip.itemCount > 0) clip.getItemAt(0).text.toString() else ""
        return JSONObject().put("text", text)
    }

    private fun handleClipboardSet(msg: JSONObject): JSONObject {
        val payload = msg.optJSONObject("payload") ?: JSONObject()
        val text = payload.optString("text", "")
        val clipboard = getSystemService(android.content.Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
        val clip = android.content.ClipData.newPlainText("Antahkarn", text)
        clipboard.setPrimaryClip(clip)
        return JSONObject().put("success", true)
    }

    private fun handleShellRun(msg: JSONObject): JSONObject {
        val command = msg.optJSONObject("payload")?.optString("command", "") ?: ""
        return try {
            val process = Runtime.getRuntime().exec(command)
            val output = process.inputStream.bufferedReader().readText()
            val error = process.errorStream.bufferedReader().readText()
            JSONObject().apply {
                put("stdout", output)
                put("stderr", error)
                put("code", process.waitFor())
            }
        } catch (e: Exception) {
            JSONObject().apply {
                put("stdout", "")
                put("stderr", e.message)
                put("code", 1)
            }
        }
    }

    private fun handleMirrorStop(): JSONObject {
        screenCaptureHandler?.stop()
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
