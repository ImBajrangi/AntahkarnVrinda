package com.localshare.mobile

import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import android.util.Log

class MainActivity : FlutterActivity() {
    private val CHANNEL = "com.localshare.mobile/control"

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL).setMethodCallHandler { call, result ->
            when (call.method) {
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
                "check_service" -> {
                    result.success(ControlService.instance != null)
                }
                else -> {
                    result.notImplemented()
                }
            }
        }
    }
}
