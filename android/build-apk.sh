#!/usr/bin/env bash
# Bouwt de APK zonder Gradle/Android Studio, met de Android-tools uit Debian/Ubuntu:
#   sudo apt install android-sdk-platform-23 aapt dalvik-exchange zipalign apksigner
# Resultaat: build/voer-app.apk
set -euo pipefail
cd "$(dirname "$0")"

ANDROID_JAR=${ANDROID_JAR:-/usr/lib/android-sdk/platforms/android-23/android.jar}
OUT=build/apk
VERSION_CODE=$(sed -n "s/.*versionCode \([0-9]*\).*/\1/p" app/build.gradle)
VERSION_NAME=$(sed -n "s/.*versionName '\(.*\)'.*/\1/p" app/build.gradle)
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
apksigner sign --ks keystore/voer-app.jks --ks-pass pass:voerapp --ks-key-alias voer-app \
    --out build/voer-app.apk "$OUT/aligned.apk"
apksigner verify build/voer-app.apk

echo "Klaar: $(pwd)/build/voer-app.apk (versie $VERSION_NAME)"
