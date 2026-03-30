cmake_minimum_required(VERSION 3.16)

project(AntahkarnVrinda VERSION 2.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# ═══ FIND QT ═══
find_package(Qt6 REQUIRED COMPONENTS Core Gui Qml Quick Widgets Network)
qt_standard_project_setup()

# ═══ FIND gRPC & Protobuf ═══
find_package(Protobuf REQUIRED)
find_package(gRPC REQUIRED)

# ═══ GENERATE PROTO SOURCES ═══
set(PROTO_FILE ../proto/antahkarn.proto)
get_filename_component(PROTO_PATH ${PROTO_FILE} DIRECTORY)

# Generate C++ from Proto
set(PROTO_SRC "${CMAKE_CURRENT_BINARY_DIR}/antahkarn.pb.cc")
set(PROTO_HDR "${CMAKE_CURRENT_BINARY_DIR}/antahkarn.pb.h")
set(GRPC_SRC "${CMAKE_CURRENT_BINARY_DIR}/antahkarn.grpc.pb.cc")
set(GRPC_HDR "${CMAKE_CURRENT_BINARY_DIR}/antahkarn.grpc.pb.h")

add_custom_command(
    OUTPUT "${PROTO_SRC}" "${PROTO_HDR}" "${GRPC_SRC}" "${GRPC_HDR}"
    COMMAND Protobuf::protoc
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
    "${PROTO_SRC}"
    "${GRPC_SRC}"
)

# ═══ LINK LIBRARIES ═══
target_link_libraries(AntahkarnVrinda PRIVATE 
    Qt6::Core 
    Qt6::Gui 
    Qt6::Quick 
    Qt6::Widgets 
    Qt6::Network
    gRPC::grpc++
    Protobuf::libprotobuf
)

# ═══ QML RESOURCES ═══
qt_add_qml_module(AntahkarnVrinda
    URI com.antahkarn.vrinda
    VERSION 1.0
    QML_FILES main.qml
)

set_target_properties(AntahkarnVrinda PROPERTIES
    WIN32_EXECUTABLE TRUE
    MACOSX_BUNDLE TRUE
)
