# wa-release-bot — minify dimatikan, aturan ini untuk jaga-jaga kalau kelak dinyalakan.

# JNI: native method NodeBridge.startNode dipanggil dari C++
-keepclasseswithmembers class com.xykals.warelease.NodeBridge {
    native <methods>;
}
