cmake_minimum_required(VERSION 3.10.2)

project("antahkarn_native")

# ═══ FIND LIBRARIES ═══
find_library(log-lib log)
find_library(android-lib android)

# ═══ DEFINE LIBRARY ═══
add_library(antahkarn_native SHARED 
    native-lib.cpp
    screen-streamer.cpp
)

# ═══ LINK LIBRARIES ═══
target_link_libraries(antahkarn_native 
    ${log-lib} 
    ${android-lib}
)
