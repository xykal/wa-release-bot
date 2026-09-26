# CMake: build jembatan JNI (nodebridge.so) yang memanggil node::Start()
# dari libnode.so bawaan nodejs-mobile.
cmake_minimum_required(VERSION 3.22.1)

project("wa_release_bot_native" CXX)

add_library(nodebridge SHARED
    src/main/cpp/native-lib.cpp
)

# Header Node.js (node.h dll) — diunduh CI / langkah setup lokal
include_directories(../../libnode/include/node/)

# libnode.so prebuilt (60MB) — lokasi: app/src/main/jniLibs/<abi>/
# (gradle otomatis mem-package folder jniLibs ke dalam APK)
add_library(libnode SHARED IMPORTED)
set_target_properties(libnode PROPERTIES
    IMPORTED_LOCATION ${CMAKE_SOURCE_DIR}/../../jniLibs/${ANDROID_ABI}/libnode.so)

if(NOT EXISTS ${CMAKE_SOURCE_DIR}/../../jniLibs/${ANDROID_ABI}/libnode.so)
    message(FATAL_ERROR
        "libnode.so tidak ditemukan di jniLibs/${ANDROID_ABI}/.\n"
        "Unduh dulu nodejs-mobile (lihat README bagian 'Build Lokal'):\n"
        "  curl -fsSL -o /tmp/njsm.zip https://github.com/nodejs-mobile/nodejs-mobile/releases/download/v18.20.4/nodejs-mobile-v18.20.4-android.zip\n"
        "  unzip -q /tmp/njsm.zip -d /tmp/njsm\n"
        "  cp /tmp/njsm/bin/arm64-v8a/libnode.so app/src/main/jniLibs/arm64-v8a/")
endif()

if(NOT EXISTS ${CMAKE_SOURCE_DIR}/../../libnode/include/node/node.h)
    message(FATAL_ERROR
        "Header node.h tidak ditemukan di app/libnode/include/node/.\n"
        "Jalankan langkah setup lokal di README dulu.")
endif()

find_library(log-lib log)

target_link_libraries(nodebridge
    libnode
    ${log-lib}
)
