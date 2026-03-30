package com.localshare.mobile

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.os.Bundle
import android.util.Log

/**
 * Invisible activity to handle the MediaProjection permission dialog and pass it to the service.
 */
class CapturePermissionActivity : Activity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        val mpManager = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        startActivityForResult(mpManager.createScreenCaptureIntent(), 100)
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        
        if (requestCode == 100 && resultCode == Activity.RESULT_OK && data != null) {
            Log.i("CapturePermission", "Permission granted!")
            DeviceAgentService.instance?.handleCapturePermissionGranted(resultCode, data)
        } else {
            Log.w("CapturePermission", "Permission denied or data null")
        }
        
        finish()
    }
}
