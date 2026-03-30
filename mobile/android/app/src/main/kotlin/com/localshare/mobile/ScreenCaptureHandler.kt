package com.localshare.mobile

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Handler
import android.os.HandlerThread
import android.util.DisplayMetrics
import android.util.Log
import android.view.Surface
import org.json.JSONObject
import java.nio.ByteBuffer

/**
 * Handles Screen Capture using MediaProjection and encoding via MediaCodec (H.264).
 * Streams video chunks back to the requester via WebSocket.
 */
class ScreenCaptureHandler(private val context: Context, private val service: DeviceAgentService) {
    private var mediaProjection: MediaProjection? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var imageReader: android.media.ImageReader? = null
    private var isStreaming = false
    private var handlerThread: android.os.HandlerThread? = null
    private var handler: android.os.Handler? = null

    private val WIDTH = 720
    private val HEIGHT = 1280

    fun start(resultCode: Int, data: android.content.Intent) {
        if (isStreaming) return
        val mpManager = context.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as android.media.projection.MediaProjectionManager
        mediaProjection = mpManager.getMediaProjection(resultCode, data)
        setupCapture()
        isStreaming = true
        Log.i("ScreenCapture", "Started JPEG capture via ImageReader")
    }

    private fun setupCapture() {
        handlerThread = android.os.HandlerThread("CaptureThread")
        handlerThread?.start()
        handler = android.os.Handler(handlerThread!!.looper)

        imageReader = android.media.ImageReader.newInstance(WIDTH, HEIGHT, android.graphics.PixelFormat.RGBA_8888, 2)
        val metrics = context.resources.displayMetrics
        virtualDisplay = mediaProjection?.createVirtualDisplay(
            "ScreenCapture", WIDTH, HEIGHT, metrics.densityDpi,
            android.hardware.display.DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
            imageReader?.surface, null, null
        )

        imageReader?.setOnImageAvailableListener({ reader ->
            val image = reader.acquireLatestImage() ?: return@setOnImageAvailableListener
            try {
                processImage(image)
            } catch (e: Exception) {
                Log.e("ScreenCapture", "Image process error: ${e.message}")
            } finally {
                image.close()
            }
        }, handler)
    }

    private fun processImage(image: android.media.Image) {
        // Simple JPEG compression from Surface Image
        val planes = image.planes
        val buffer = planes[0].buffer
        val pixelStride = planes[0].pixelStride
        val rowStride = planes[0].rowStride
        val rowPadding = rowStride - pixelStride * WIDTH
        
        val bitmap = android.graphics.Bitmap.createBitmap(
            WIDTH + rowPadding / pixelStride, HEIGHT, android.graphics.Bitmap.Config.ARGB_8888
        )
        bitmap.copyPixelsFromBuffer(buffer)
        
        // Crop if needed or just scale
        val outStream = java.io.ByteArrayOutputStream()
        bitmap.compress(android.graphics.Bitmap.CompressFormat.JPEG, 70, outStream)
        val jpegData = outStream.toByteArray()
        
        val base64Frame = android.util.Base64.encodeToString(jpegData, android.util.Base64.NO_WRAP)
        
        service.broadcastToPeers("mirror", "frame", org.json.JSONObject().apply {
            put("data", base64Frame)
            put("timestamp", System.currentTimeMillis())
        })
    }

    fun stop() {
        isStreaming = false
        handlerThread?.quitSafely()
        virtualDisplay?.release()
        imageReader?.close()
        mediaProjection?.stop()
        virtualDisplay = null
        imageReader = null
        mediaProjection = null
        Log.i("ScreenCapture", "Stopped JPEG capture")
    }
}
