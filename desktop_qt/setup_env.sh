#!/bin/bash

# ═══ AntahkarnVrinda SDK Path Discovery & Installation Bridge ═══

echo "🔍 Scanning for Developer SDKs (macOS Deep Discovery)..."

# Common macOS Search Paths
BREW_PREFIX=$(brew --prefix 2>/dev/null || echo "/opt/homebrew")
POTENTIAL_QT_PATHS=(
    "$BREW_PREFIX/opt/qt"
    "/usr/local/opt/qt"
    "/opt/qt"
    "/Applications/Qt/6.7.0/macos"
    "/Applications/Qt/Tools/Qt Creator.app/Contents/MacOS"
    "~/Qt/6.7.0/macos"
)

POTENTIAL_BINS=(
    "$BREW_PREFIX/bin"
    "/usr/local/bin"
    "/usr/bin"
    "/bin"
    "/Applications/CMake.app/Contents/bin"
    "/Applications/Qt/Tools/CMake/CMake.app/Contents/bin"
)

FOUND_QT=""
for path in "${POTENTIAL_QT_PATHS[@]}"; do
    eval expanded_path=\"$path\"
    if [ -d "$expanded_path" ]; then
        FOUND_QT=$expanded_path
        echo "✅ Found Qt at: $FOUND_QT"
        break
    fi
done

FOUND_CMAKE=""
for bin in "${POTENTIAL_BINS[@]}"; do
    eval expanded_bin=\"$bin\"
    if [ -f "$expanded_bin/cmake" ]; then
        FOUND_CMAKE="$expanded_bin/cmake"
        echo "✅ Found cmake at: $FOUND_CMAKE"
        break
    fi
done

FOUND_PROTOC=""
for bin in "${POTENTIAL_BINS[@]}"; do
    eval expanded_bin=\"$bin\"
    if [ -f "$expanded_bin/protoc" ]; then
        FOUND_PROTOC="$expanded_bin/protoc"
        echo "✅ Found protoc at: $FOUND_PROTOC"
        break
    fi
done

# ═══ Tool Installation Support (Rule: SDK Discovery - do whatever is required) ═══
if [ -z "$FOUND_CMAKE" ] || [ -z "$FOUND_PROTOC" ] || [ -z "$FOUND_QT" ]; then
    echo "⚠️  Missing critical build tools (cmake: ${FOUND_CMAKE:-MISSING}, protoc: ${FOUND_PROTOC:-MISSING}, Qt6: ${FOUND_QT:-MISSING})"
    echo "💡 Would you like to install the missing components via Homebrew now? (y/n)"
    read -r install_choice
    if [ "$install_choice" == "y" ]; then
        echo "🚀 Installing dependencies..."
        if [ -z "$FOUND_CMAKE" ]; then brew install cmake; fi
        if [ -z "$FOUND_PROTOC" ]; then brew install protobuf grpc; fi
        if [ -z "$FOUND_QT" ]; then brew install qt; fi
        
        # Re-scan after install
        FOUND_CMAKE=$(which cmake)
        FOUND_PROTOC=$(which protoc)
        FOUND_QT=$($BREW_PREFIX/bin/brew --prefix qt 2>/dev/null)
        echo "✅ Installation complete."
    else
        echo "❌ Build cannot proceed without necessary tools."
        exit 1
    fi
fi

# ═══ Environment Export ═══
if [ -n "$FOUND_QT" ]; then
    export CMAKE_PREFIX_PATH="$FOUND_QT:$CMAKE_PREFIX_PATH"
    export PATH="$FOUND_QT/bin:$PATH"
fi

if [ -n "$FOUND_CMAKE" ]; then
    FOUND_CMAKE_DIR=$(dirname "$FOUND_CMAKE")
    export PATH="$FOUND_CMAKE_DIR:$PATH"
fi

echo "🚀 Environment Updated."
echo "PATH: $PATH"
echo "CMAKE_PREFIX_PATH: $CMAKE_PREFIX_PATH"

# Run CMake if requested
if [ "$1" == "--build" ] || [ "$1" == "-b" ]; then
    mkdir -p build && cd build
    cmake -DCMAKE_BUILD_TYPE=Performance ..
    make -j$(sysctl -n hw.ncpu)
fi
