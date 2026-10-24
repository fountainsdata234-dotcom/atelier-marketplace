#!/usr/bin/env bash

set +e
diagnostic_file="$RUNNER_TEMP/android-startup-diagnostic.txt"

timeout 20s adb shell getprop ro.build.version.release > "$RUNNER_TEMP/android-version.txt" 2>&1
timeout 20s adb shell getprop ro.build.version.sdk >> "$RUNNER_TEMP/android-version.txt" 2>&1
timeout 20s adb shell pm list packages com.android.chrome > "$RUNNER_TEMP/chrome-package.txt" 2>&1
timeout 90s adb install -r "$RUNNER_TEMP/app-release.apk" > "$RUNNER_TEMP/install-result.txt" 2>&1
install_status=$?

if [ "$install_status" -eq 0 ]; then
  timeout 10s adb logcat -c
  timeout 45s adb shell am start -W -n com.fabsattire.app/.LauncherActivity \
    > "$RUNNER_TEMP/launch-result.txt" 2>&1
  launch_status=$?
  sleep 10
  timeout 20s adb shell dumpsys activity recents > "$RUNNER_TEMP/recents-task-details.txt" 2>&1
  timeout 10s adb shell input keyevent KEYCODE_HOME
  sleep 2
  timeout 10s adb shell input keyevent KEYCODE_APP_SWITCH
  sleep 3
  timeout 20s adb exec-out screencap -p > "$RUNNER_TEMP/android-recents.png"
else
  launch_status=1
  echo "Launch was skipped because APK installation failed." \
    > "$RUNNER_TEMP/launch-result.txt"
  : > "$RUNNER_TEMP/recents-task-details.txt"
fi

{
  echo "APK install exit code: $install_status"
  echo "Activity launch exit code: $launch_status"
  echo
  echo "Android release and API:"
  cat "$RUNNER_TEMP/android-version.txt"
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
  echo "Android recent task details:"
  cat "$RUNNER_TEMP/recents-task-details.txt"
  echo
  echo "Relevant Android startup errors:"
  timeout 30s adb logcat -d -v threadtime -s AndroidRuntime:E ActivityTaskManager:E
} > "$diagnostic_file" 2>&1

cat "$diagnostic_file"
if [ "$install_status" -ne 0 ] || [ "$launch_status" -ne 0 ] \
  || grep -q "FATAL EXCEPTION" "$diagnostic_file"; then
  exit 1
fi
