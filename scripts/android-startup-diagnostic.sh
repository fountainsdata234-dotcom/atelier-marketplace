#!/usr/bin/env bash

set +e
diagnostic_file="$RUNNER_TEMP/android-startup-diagnostic.txt"

adb shell pm list packages com.android.chrome > "$RUNNER_TEMP/chrome-package.txt" 2>&1
adb install -r "$RUNNER_TEMP/app-release.apk" > "$RUNNER_TEMP/install-result.txt" 2>&1
install_status=$?

if [ "$install_status" -eq 0 ]; then
  adb shell am start -W -n com.fabsattire.app/.LauncherActivity \
    > "$RUNNER_TEMP/launch-result.txt" 2>&1
  launch_status=$?
  sleep 20
else
  launch_status=1
  echo "Launch was skipped because APK installation failed." \
    > "$RUNNER_TEMP/launch-result.txt"
fi

{
  echo "APK install exit code: $install_status"
  echo "Activity launch exit code: $launch_status"
  echo
  echo "Chrome package on emulator:"
  cat "$RUNNER_TEMP/chrome-package.txt"
  echo
  echo "APK install result:"
  cat "$RUNNER_TEMP/install-result.txt"
  echo
  echo "Activity launch result:"
  cat "$RUNNER_TEMP/launch-result.txt"
  echo
  echo "Relevant Android startup errors:"
  adb logcat -d -v threadtime -s AndroidRuntime:E ActivityTaskManager:E
} > "$diagnostic_file" 2>&1

cat "$diagnostic_file"
if [ "$install_status" -ne 0 ] || [ "$launch_status" -ne 0 ] \
  || grep -q "FATAL EXCEPTION" "$diagnostic_file"; then
  exit 1
fi
