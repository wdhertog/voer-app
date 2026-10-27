#!/usr/bin/env bash
# Bouwt de APK zonder Gradle/Android Studio, met de Android-tools uit Debian/Ubuntu:
#   sudo apt install android-sdk-platform-23 aapt dalvik-exchange zipalign apksigner
# Ondertekensleutel: dezelfde VOER_*-instellingen als Gradle, uit de omgeving of uit keystore.properties.
# Resultaat: build/voer-app.apk
set -euo pipefail
cd "$(dirname "$0")"

prop() {
    local value="${!1:-}"
    if [ -z "$value" ] && [ -f keystore.properties ]; then
        value=$(sed -n "s/^$1=//p" keystore.properties)
    fi
    echo "$value"
}
KEYSTORE=$(prop VOER_KEYSTORE_FILE)
if [ -z "$KEYSTORE" ]; then
    echo "Geen ondertekensleutel: maak keystore.properties aan (zie keystore.properties.example)." >&2
    exit 1
fi

ANDROID_JAR=${ANDROID_JAR:-/usr/lib/android-sdk/platforms/android-23/android.jar}
OUT=build/apk
VERSION_CODE=${VOER_VERSION_CODE:-1}
VERSION_NAME=${VOER_VERSION_NAME:-1.0}
MIN_SDK=$(sed -n "s/.*minSdk \([0-9]*\).*/\1/p" app/build.gradle)
TARGET_SDK=$(sed -n "s/.*targetSdk \([0-9]*\).*/\1/p" app/build.gradle)

rm -rf "$OUT" && mkdir -p "$OUT/gen" "$OUT/classes"

# Gradle haalt de package-naam uit 'namespace'; aapt wil hem in het manifest
sed 's/<manifest /<manifest package="nl.voerapp" /' app/src/main/AndroidManifest.xml > "$OUT/AndroidManifest.xml"

aapt package -f -m \
    -M "$OUT/AndroidManifest.xml" -S app/src/main/res -A app/src/main/assets -I "$ANDROID_JAR" \
    -J "$OUT/gen" -F "$OUT/unaligned.apk" -0 arsc \
    --min-sdk-version "$MIN_SDK" --target-sdk-version "$TARGET_SDK" \
    --version-code "$VERSION_CODE" --version-name "$VERSION_NAME"

javac -source 8 -target 8 -bootclasspath "$ANDROID_JAR" -encoding UTF-8 -nowarn -Xlint:-options \
    -d "$OUT/classes" "$OUT/gen/nl/voerapp/R.java" $(find app/src/main/java -name '*.java')

dalvik-exchange --dex --min-sdk-version="$MIN_SDK" --output="$OUT/classes.dex" "$OUT/classes"
(cd "$OUT" && zip -q unaligned.apk classes.dex)

zipalign -f -p 4 "$OUT/unaligned.apk" "$OUT/aligned.apk"
KS_PASS=$(prop VOER_KEYSTORE_PASSWORD) KEY_PASS=$(prop VOER_KEY_PASSWORD) \
    apksigner sign --ks "$KEYSTORE" --ks-pass env:KS_PASS --key-pass env:KEY_PASS --ks-key-alias "$(prop VOER_KEY_ALIAS)" \
    --out build/voer-app.apk "$OUT/aligned.apk"
apksigner verify build/voer-app.apk

echo "Klaar: $(pwd)/build/voer-app.apk (versie $VERSION_NAME)"
