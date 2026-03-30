cmake_minimum_required(VERSION 3.16)

project(AntahkarnVrinda VERSION 2.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# ═══ PERFORMANCE AUDITS CONFIGURATION (Rule: Performance Audits) ═══
if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Release)
endif()

# Define "Performance" build type
set(CMAKE_CXX_FLAGS_PERFORMANCE "-O3 -g -DNDEBUG -fno-omit-frame-pointer")
if(APPLE)
    # macOS specific instrumentation for Instruments/DTrace
    set(CMAKE_CXX_FLAGS_PERFORMANCE "${CMAKE_CXX_FLAGS_PERFORMANCE} -fstack-protector-strong")
    add_compile_definitions(AD_PERFORMANCE_AUDIT)
endif()

message(STATUS "════ Build Configuration ════")
message(STATUS "Type: ${CMAKE_BUILD_TYPE}")
message(STATUS "Optimization: ${CMAKE_CXX_FLAGS_PERFORMANCE}")
message(STATUS "═══════════════════════════")

# ═══ SDK DISCOVERY HINTS (macOS) ═══
set(QT_HINTS 
    /opt/homebrew/opt/qt 
    /usr/local/opt/qt 
    /opt/qt 
    /Applications/Qt/6.7.0/macos
    ~/Qt/6.7.0/macos
)
set(TOOL_HINTS /opt/homebrew/bin /usr/local/bin /usr/bin /bin)

# ═══ FIND QT ═══
find_package(Qt6 REQUIRED COMPONENTS Core Gui Qml Quick Widgets Network HINTS ${QT_HINTS})
if(NOT Qt6_FOUND)
    message(FATAL_ERROR "❌ Qt6 not found. Please run 'sh setup_env.sh' to install or link Qt6.")
endif()
qt_standard_project_setup()

# ═══ FIND gRPC & Protobuf ═══
find_package(Protobuf CONFIG REQUIRED HINTS ${TOOL_HINTS})
find_package(gRPC CONFIG REQUIRED HINTS ${TOOL_HINTS})

# ═══ GENERATE PROTO SOURCES ═══
set(PROTO_FILE "${CMAKE_CURRENT_SOURCE_DIR}/proto/antahkarn.proto")
get_filename_component(PROTO_PATH "${PROTO_FILE}" DIRECTORY)

# Generate C++ from Proto
set(PROTO_SRC "${CMAKE_CURRENT_BINARY_DIR}/antahkarn.pb.cc")
set(PROTO_HDR "${CMAKE_CURRENT_BINARY_DIR}/antahkarn.pb.h")
set(GRPC_SRC "${CMAKE_CURRENT_BINARY_DIR}/antahkarn.grpc.pb.cc")
set(GRPC_HDR "${CMAKE_CURRENT_BINARY_DIR}/antahkarn.grpc.pb.h")

add_custom_command(
    OUTPUT "${PROTO_SRC}" "${PROTO_HDR}" "${GRPC_SRC}" "${GRPC_HDR}"
    COMMAND protobuf::protoc
    ARGS --cpp_out "${CMAKE_CURRENT_BINARY_DIR}"
         --grpc_out "${CMAKE_CURRENT_BINARY_DIR}"
         --plugin=protoc-gen-grpc=$<TARGET_FILE:gRPC::grpc_cpp_plugin>
         -I "${PROTO_PATH}"
         "${PROTO_FILE}"
    DEPENDS "${PROTO_FILE}"
)

# ═══ DEFINE EXECUTABLE ═══
qt_add_executable(AntahkarnVrinda
    main.cpp
    MirrorClient.cpp
    MirrorClient.h
    "${PROTO_SRC}"
    "${GRPC_SRC}"
)

target_include_directories(AntahkarnVrinda PRIVATE "${CMAKE_CURRENT_BINARY_DIR}")

# ═══ LINK LIBRARIES ═══
target_link_libraries(AntahkarnVrinda PRIVATE 
    Qt6::Core 
    Qt6::Gui 
    Qt6::Quick 
    Qt6::Widgets 
    Qt6::Network
    gRPC::grpc++
    protobuf::libprotobuf
)

# ═══ QML RESOURCES ═══
qt_add_qml_module(AntahkarnVrinda
    URI com.antahkarn.vrinda
    VERSION 1.0
    QML_FILES 
        main.qml
        MirrorView.qml
)

set_target_properties(AntahkarnVrinda PROPERTIES
    WIN32_EXECUTABLE TRUE
    MACOSX_BUNDLE TRUE
)
