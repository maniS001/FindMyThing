Write-Host "=== JARVIS: Starting Automatic Android Build Fix ===" -ForegroundColor Cyan

# 1. Kill any running node or Gradle processes
Write-Host "Stopping Node & Gradle processes..."
taskkill /IM node.exe /F > $null 2>&1
taskkill /IM java.exe /F > $null 2>&1
taskkill /IM gradle.exe /F > $null 2>&1

# 2. Delete corrupted Gradle cache
$gradleCache = "$env:USERPROFILE\.gradle\caches"
Write-Host "Deleting Gradle cache: $gradleCache"
Remove-Item -Recurse -Force -Path $gradleCache -ErrorAction SilentlyContinue

# 3. Go to project root
$projectPath = "D:\MANI S\PROJECTS\FindMyThing"
Write-Host "Navigating to project: $projectPath"
Set-Location $projectPath

# 4. Delete node_modules
Write-Host "Deleting node_modules..."
Remove-Item -Recurse -Force -Path "$projectPath\node_modules" -ErrorAction SilentlyContinue

# 5. Delete android build folders
Write-Host "Deleting Android build folders..."
Remove-Item -Recurse -Force -Path "$projectPath\android\.gradle" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force -Path "$projectPath\android\app\build" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force -Path "$projectPath\android\build" -ErrorAction SilentlyContinue

# 6. Install node modules fresh
Write-Host "Reinstalling dependencies..."

if (Test-Path "$projectPath\yarn.lock") {
    Write-Host "Detected Yarn → running yarn install"
    yarn install
} else {
    Write-Host "Running npm install"
    npm install
}

# 7. Rebuild Gradle
Write-Host "Building Debug APK (first build takes time)..."
Set-Location "$projectPath\android"
./gradlew assembleDebug

# 8. Open APK folder
$apkPath = "$projectPath\android\app\build\outputs\apk\debug"
if (Test-Path $apkPath) {
    Write-Host "Opening APK folder: $apkPath"
    start $apkPath
} else {
    Write-Host "APK folder not found. Build may have failed." -ForegroundColor Red
}

Write-Host "=== JARVIS: Android Build Fix Completed ===" -ForegroundColor Green
