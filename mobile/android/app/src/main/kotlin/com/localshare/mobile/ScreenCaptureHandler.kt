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
    private var encoder: MediaCodec? = null
    private var inputSurface: Surface? = null
    
    private var isStreaming = false
    private var handlerThread: HandlerThread? = null
    private var handler: Handler? = null

    private val WIDTH = 720
    private val HEIGHT = 1280
    private val BITRATE = 2000000 // 2Mbps
    private val FRAME_RATE = 30
    private val I_FRAME_INTERVAL = 1

    fun start(resultCode: Int, data: Intent) {
        if (isStreaming) return
        
        Log.i("ScreenCapture", "Starting screen capture...")
        val mpManager = context.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        mediaProjection = mpManager.getMediaProjection(resultCode, data)
        
        setupEncoder()
        setupVirtualDisplay()
        
        isStreaming = true
        startEncodingLoop()
    }

    private fun setupEncoder() {
        val format = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, WIDTH, HEIGHT)
        format.setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface)
        format.setInteger(MediaFormat.KEY_BIT_RATE, BITRATE)
        format.setInteger(MediaFormat.KEY_FRAME_RATE, FRAME_RATE)
        format.setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, I_FRAME_INTERVAL)

        encoder = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_VIDEO_AVC)
        encoder?.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
        inputSurface = encoder?.createInputSurface()
        encoder?.start()
    }

    private fun setupVirtualDisplay() {
        val metrics = context.resources.displayMetrics
        virtualDisplay = mediaProjection?.createVirtualDisplay(
            "ScreenCapture",
            WIDTH, HEIGHT, metrics.densityDpi,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
            inputSurface, null, null
        )
    }

    private fun startEncodingLoop() {
        handlerThread = HandlerThread("ScreenEncoder")
        handlerThread?.start()
        handler = Handler(handlerThread!!.looper)

        handler?.post(object : Runnable {
            override fun run() {
                if (!isStreaming) return

                val bufferInfo = MediaCodec.BufferInfo()
                val outputBufferIndex = encoder?.dequeueOutputBuffer(bufferInfo, 10000) ?: -1

                if (outputBufferIndex >= 0) {
                    val outputBuffer = encoder?.getOutputBuffer(outputBufferIndex)
                    if (outputBuffer != null) {
                        sendFrame(outputBuffer, bufferInfo)
                    }
                    encoder?.releaseOutputBuffer(outputBufferIndex, false)
                }

                handler?.post(this)
            }
        })
    }

    private fun sendFrame(buffer: ByteBuffer, info: MediaCodec.BufferInfo) {
        val data = ByteArray(info.size)
        buffer.get(data)
        
        // Convert to base64 for JSON protocol
        val base64Frame = android.util.Base64.encodeToString(data, android.util.Base64.NO_WRAP)
        
        // Broadcast to all peers (or a specific one if implemented)
        service.broadcastToPeers("mirror", "frame", JSONObject().apply {
            put("data", base64Frame)
            put("timestamp", info.presentationTimeUs)
            put("flags", info.flags)
        })
    }

    fun stop() {
        Log.i("ScreenCapture", "Stopping screen capture...")
        isStreaming = false
        handlerThread?.quitSafely()
        
        virtualDisplay?.release()
        mediaProjection?.stop()
        encoder?.stop()
        encoder?.release()
        
        virtualDisplay = null
        mediaProjection = null
        encoder = null
    }
}
