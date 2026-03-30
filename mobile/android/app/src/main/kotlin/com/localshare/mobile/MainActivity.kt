package com.antahkarn.vrinda

import android.content.Intent
import android.os.Build
import android.util.Log
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    private val CHANNEL = "com.antahkarn.vrinda/agent"

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        // Start the Device Agent background service
        val agentIntent = Intent(this, DeviceAgentService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(agentIntent)
        } else {
            startService(agentIntent)
        }

        // Request POST_NOTIFICATIONS for Android 13+
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val permission = "android.permission.POST_NOTIFICATIONS"
            if (checkSelfPermission(permission) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                requestPermissions(arrayOf(permission), 101)
            }
        }
        
        Log.i("MainActivity", "Device Agent service started")

        // Flutter ↔ Kotlin bridge
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL).setMethodCallHandler { call, result ->
            when (call.method) {
                "getAgentStatus" -> {
                    val agentRunning = DeviceAgentService.instance != null
                    val controlServiceRunning = ControlService.instance != null
                    result.success(mapOf(
                        "agentRunning" to agentRunning,
                        "controlServiceRunning" to controlServiceRunning,
                        "deviceId" to (DeviceAgentService.DEVICE_ID),
                        "port" to DeviceAgentService.AGENT_PORT,
                        "peers" to (DeviceAgentService.instance?.getConnectedPeers() ?: emptyList<Any>())
                    ))
                }
                "tap" -> {
                    val x = call.argument<Double>("x")?.toFloat() ?: 0f
                    val y = call.argument<Double>("y")?.toFloat() ?: 0f
                    ControlService.instance?.tap(x, y)
                    result.success(true)
                }
                "swipe" -> {
                    val x1 = call.argument<Double>("x1")?.toFloat() ?: 0f
                    val y1 = call.argument<Double>("y1")?.toFloat() ?: 0f
                    val x2 = call.argument<Double>("x2")?.toFloat() ?: 0f
                    val y2 = call.argument<Double>("y2")?.toFloat() ?: 0f
                    val duration = call.argument<Int>("duration")?.toLong() ?: 300L
                    ControlService.instance?.swipe(x1, y1, x2, y2, duration)
                    result.success(true)
                }
                else -> result.notImplemented()
            }
        }
    }
}
