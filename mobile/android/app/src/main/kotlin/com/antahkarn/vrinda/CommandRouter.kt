package com.antahkarn.vrinda

import android.util.Log
import org.json.JSONObject

/**
 * Routes incoming commands to the appropriate handler.
 * Pattern: category:action → handler function
 */
class CommandRouter {
    
    private val handlers = mutableMapOf<String, (JSONObject) -> JSONObject>()

    fun register(category: String, action: String, handler: (JSONObject) -> JSONObject) {
        handlers["$category:$action"] = handler
    }

    fun route(msg: JSONObject): JSONObject {
        val category = msg.optString("category", "")
        val action = msg.optString("action", "")
        val key = "$category:$action"
        
        val handler = handlers[key]
        return if (handler != null) {
            try {
                handler(msg)
            } catch (e: Exception) {
                Log.e("CommandRouter", "Error in handler $key: ${e.message}")
                JSONObject().put("error", e.message)
            }
        } else {
            Log.w("CommandRouter", "No handler for $key")
            JSONObject().put("error", "Unknown command: $key")
        }
    }
}
