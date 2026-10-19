param(
    [Parameter(Mandatory = $true)][int]$AppProcessId,
    [ValidateSet('Inspect', 'Close', 'Diagnostics', 'OpenSettings')][string]$Action = 'Inspect',
    [Parameter(Mandatory = $true)][string]$Executable,
    [Parameter(Mandatory = $true)][string]$LaunchedAt,
    [string]$ExpectedStartTime,
    [string]$ProfileDir,
    [int]$CdpPort
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding
$app = Get-Process -Id $AppProcessId -ErrorAction SilentlyContinue
if ($app) {
    if ($app.Path -ne $Executable -or $app.StartTime.ToUniversalTime() -lt ([datetime]::Parse($LaunchedAt).ToUniversalTime().AddSeconds(-1))) {
        throw "PID $AppProcessId does not match this run's application identity."
    }
    if ($ExpectedStartTime -and $app.StartTime.ToUniversalTime() -ne [datetime]::Parse($ExpectedStartTime).ToUniversalTime()) {
        throw "PID $AppProcessId was reused; refusing to access it."
    }
}
if ($Action -eq 'Diagnostics') {
    $processes = @(Get-CimInstance Win32_Process -Filter "Name='msedgewebview2.exe'")
    $ownedIds = @($AppProcessId)
    do {
        $previousCount = $ownedIds.Count
        $ownedIds = @($ownedIds + @($processes | Where-Object { $_.ParentProcessId -in $ownedIds } | ForEach-Object ProcessId) | Select-Object -Unique)
    } while ($ownedIds.Count -ne $previousCount)
    $profilePattern = [regex]::Escape((Join-Path $ProfileDir 'EBWebView')) + '("|\s|$)'
    $owned = @($processes | Where-Object { $_.ProcessId -in $ownedIds -or $_.CommandLine -match $profilePattern })
    [pscustomobject]@{
        appRunning = [bool]$app
        processes = @($owned | ForEach-Object {
            [pscustomobject]@{
                pid = $_.ProcessId
                parentPid = $_.ParentProcessId
                createdAt = $_.CreationDate.ToUniversalTime().ToString('o')
                descendant = $_.ProcessId -in $ownedIds
                usesTestProfile = $_.CommandLine -match $profilePattern
                debugArgument = [regex]::Match($_.CommandLine, '--remote-debugging-port=\d+').Value
                addressArgument = [regex]::Match($_.CommandLine, '--remote-debugging-address=[^\s"]+').Value
            }
        })
        listeners = @(Get-NetTCPConnection -State Listen -LocalPort $CdpPort -ErrorAction SilentlyContinue | ForEach-Object {
            [pscustomobject]@{ address = $_.LocalAddress; port = $_.LocalPort; pid = $_.OwningProcess }
        })
    } | ConvertTo-Json -Depth 5 -Compress
    exit 0
}
if (-not $app) { throw "Test PID $AppProcessId has exited." }
if ($Action -eq 'Close') {
    if (-not $app.CloseMainWindow()) { throw "Could not request close for test PID $AppProcessId" }
    if (-not $app.WaitForExit(10000)) { throw "Test PID $AppProcessId did not exit after WM_CLOSE; close it manually." }
    exit 0
}

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
if ($Action -eq 'OpenSettings') {
    # Used only for the coexistence fixture, whose executable and creation time were checked above.
    $window = [System.Windows.Automation.AutomationElement]::FromHandle($app.MainWindowHandle)
    $condition = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::NameProperty, 'Settings')
    $deadline = [DateTime]::UtcNow.AddSeconds(15)
    do {
        $button = $window.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $condition)
        if ($button) { break }
        Start-Sleep -Milliseconds 200
    } while ([DateTime]::UtcNow -lt $deadline)
    if (-not $button) { throw 'Companion Settings button was not ready.' }
    $button.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
    $condition = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::NameProperty, 'Application Updates')
    do {
        $heading = $window.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $condition)
        if ($heading) { break }
        Start-Sleep -Milliseconds 200
    } while ([DateTime]::UtcNow -lt $deadline)
    if (-not $heading) { throw 'Companion Settings page did not appear.' }
    '{"settingsOpen":true}'
    exit 0
}
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class NativeWindow {
    [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
    [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr hwnd, out Rect rect);
    [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr hwnd);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hwnd);
    [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
}
'@
$deadline = [DateTime]::UtcNow.AddSeconds(30)
do {
    $app.Refresh()
    if ($app.HasExited) { throw 'The test application exited before its window appeared.' }
    if ($app.MainWindowHandle -ne 0) { break }
    Start-Sleep -Milliseconds 200
} while ([DateTime]::UtcNow -lt $deadline)
if ($app.MainWindowHandle -eq 0) { throw 'No main window appeared within 30 seconds.' }
$hwnd = $app.MainWindowHandle
# Read physical client pixels in a per-monitor-aware thread, then convert to Tauri logical units.
$previousDpi = [NativeWindow]::SetThreadDpiAwarenessContext([IntPtr](-4))
try {
    $rect = New-Object NativeWindow+Rect
    if (-not [NativeWindow]::GetClientRect($hwnd, [ref]$rect)) { throw 'GetClientRect failed.' }
    $dpi = [NativeWindow]::GetDpiForWindow($hwnd)
    if ($dpi -eq 0) { throw 'GetDpiForWindow failed.' }
    $window = [System.Windows.Automation.AutomationElement]::FromHandle($hwnd)
    $controls = @($window.FindAll([System.Windows.Automation.TreeScope]::Descendants,
        [System.Windows.Automation.Condition]::TrueCondition) | ForEach-Object {
        $current = $_.Current
        # Record only known dashboard controls, never notes, chat text, device names or telemetry.
        if ($current.Name -match '^(Dashboard layout profile|Edit layout|Done editing|Default|Gaming|Development|Servers|Half width|Full width|.*Drag .*)$') {
            [pscustomobject]@{
                name = $current.Name
                type = $current.ControlType.ProgrammaticName
                automationId = $current.AutomationId
                patterns = @($_.GetSupportedPatterns() | ForEach-Object { $_.ProgrammaticName })
            }
        }
    })
    [pscustomobject]@{
        pid = $AppProcessId
        startedAt = $app.StartTime.ToUniversalTime().ToString('o')
        title = $app.MainWindowTitle
        visible = [NativeWindow]::IsWindowVisible($hwnd)
        dpi = $dpi
        clientWidth = ($rect.Right - $rect.Left) * 96.0 / $dpi
        clientHeight = ($rect.Bottom - $rect.Top) * 96.0 / $dpi
        windowPatterns = @($window.GetSupportedPatterns() | ForEach-Object { $_.ProgrammaticName })
        controls = $controls
    } | ConvertTo-Json -Depth 5 -Compress
} finally {
    [void][NativeWindow]::SetThreadDpiAwarenessContext($previousDpi)
}
