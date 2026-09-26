# ============================================================================
#  CMake: build jembatan JNI (libnodebridge.so) yang memanggil node::Start()
#  dari libnode.so bawaan nodejs-mobile.
#
#  Dua path penting (keduanya di-supply Gradle lewat -D... di app/build.gradle):
#    LIBNODE_ROOT  → folder berisi include/node/node.h   (default: app/libnode)
#    JNI_LIBS_DIR  → folder berisi <abi>/libnode.so      (default: app/src/main/jniLibs)
#
#  CATATAN: jniLibs/ WAJIB di dalam app/src/main/ karena Gradle cuma
#  mem-package jniLibs dari sana. Header node.h boleh di mana saja.
# ============================================================================
cmake_minimum_required(VERSION 3.22.1)

project("wa_release_bot_native" CXX)

# --- lokasi libnode (header + .so) -----------------------------------------
# Default-nya relatif ke app/src/main/cpp; Gradle selalu mengirim nilai absolut.
set(LIBNODE_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/../../../libnode" CACHE PATH "Folder berisi include/node (header Node.js)")
set(JNI_LIBS_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../jniLibs" CACHE PATH "Folder berisi <abi>/libnode.so")

set(LIBNODE_SO "${JNI_LIBS_DIR}/${ANDROID_ABI}/libnode.so")
set(LIBNODE_INCLUDE "${LIBNODE_ROOT}/include/node")

if(NOT EXISTS "${LIBNODE_SO}")
    message(FATAL_ERROR
        "libnode.so tidak ditemukan di:\n  ${LIBNODE_SO}\n\n"
        "Jalankan dulu:\n  bash scripts/fetch-nodejs-mobile.sh\n")
endif()

if(NOT EXISTS "${LIBNODE_INCLUDE}/node.h")
    message(FATAL_ERROR
        "Header node.h tidak ditemukan di:\n  ${LIBNODE_INCLUDE}/node.h\n\n"
        "Jalankan dulu:\n  bash scripts/fetch-nodejs-mobile.sh\n")
endif()

message(STATUS "wa-release-bot: LIBNODE_ROOT  = ${LIBNODE_ROOT}")
message(STATUS "wa-release-bot: libnode.so    = ${LIBNODE_SO}")

add_library(nodebridge SHARED
    ${CMAKE_SOURCE_DIR}/native-lib.cpp
)

target_include_directories(nodebridge PRIVATE "${LIBNODE_INCLUDE}")

add_library(libnode SHARED IMPORTED)
set_target_properties(libnode PROPERTIES
    IMPORTED_LOCATION "${LIBNODE_SO}")

find_library(log-lib log)

target_link_libraries(nodebridge
    libnode
    ${log-lib}
)
