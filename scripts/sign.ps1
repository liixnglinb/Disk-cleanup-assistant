# 本地工具箱 · Windows 代码签名脚本
# 用法（方式A：证书文件 + 密码）：
#   powershell -ExecutionPolicy Bypass -File scripts\sign.ps1 `
#       -CertFile pathto\your.pfx -CertPassword "密码" [-TimestampUrl https://timestamp.digicert.com]
# 也可直接从环境变量读取 SIGN_CERT_FILE / SIGN_CERT_PASSWORD / SIGN_TIMESTAMP_URL
# 如果使用 electron-builder 自动签名：设置 CSC_LINK + CSC_KEY_PASSWORD 后
#   执行 npm run dist 即可在打包时自动签名（本脚本用于对已打包产物补签）。

param(
    [string]$CertFile = $env:SIGN_CERT_FILE,
    [string]$CertPassword = $env:SIGN_CERT_PASSWORD,
    [string]$TimestampUrl = $env:SIGN_TIMESTAMP_URL,
    [string[]]$Files
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not $CertFile) { Write-Error "缺少证书文件：请通过 -CertFile 或环境变量 SIGN_CERT_FILE 提供 .pfx/.p12 路径" }
if (-not (Test-Path $CertFile)) { Write-Error "找不到证书文件: $CertFile" }
if (-not $TimestampUrl) { $TimestampUrl = "http://timestamp.digicert.com" }

$signtool = $null
if (Get-Command signtool -ErrorAction SilentlyContinue) {
    $signtool = (Get-Command signtool -ErrorAction SilentlyContinue).Source
}
if (-not $signtool) {
    $signtool = Get-ChildItem "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign" -Recurse -Filter signtool.exe -ErrorAction SilentlyContinue |
                Where-Object { $_.FullName -match "x64" } | Select-Object -First 1 -ExpandProperty FullName
}
if (-not $signtool) { Write-Error "未找到 signtool.exe，请安装 Windows SDK 或先运行一次 electron-builder" }
Write-Host "signtool: $signtool"

if ($Files.Count -eq 0) {
    $exe = Join-Path $root "release\win-unpacked\DiskCleanupAssistant.exe"
    if (Test-Path $exe) { $Files += $exe }
    $setup = Get-ChildItem -Path (Join-Path $root "release") -Filter "*-Setup-*.exe" -ErrorAction SilentlyContinue
    if ($setup) { $Files += $setup.FullName }
}
if ($Files.Count -eq 0) { Write-Error "未找到要签名的文件，请先 npm run dist 打包" }

# 公共前缀参数
$base = @("sign", "/fd", "SHA256", "/td", "SHA256", "/tr", $TimestampUrl, "/f", $CertFile)
if ($CertPassword) { $base += @("/p", $CertPassword) }

$allOk = $true
foreach ($file in $Files) {
    if (-not (Test-Path $file)) { Write-Warning "跳过不存在的文件: $file"; continue }
    Write-Host "签名: $file"
    $sigArgs = $base + @($file)
    & $signtool @sigArgs
    if ($LASTEXITCODE -ne 0) {
        $allOk = $false
        Write-Warning "签名命令失败: $file"
        continue
    }
    # 校验轮询（RFC3161 时间戳可能需要一点网络时间）
    Start-Sleep -Milliseconds 300
}

Write-Host ""
Write-Host "签名完成。校验结果（注意：自签名测试证书会显示不受信任，属正常）："
$ErrorActionPreference = "Continue"
foreach ($file in ($Files | Where-Object { Test-Path $_ })) {
    Write-Host "--- $file"
    & $signtool verify /pa /v $file 2>&1 | Select-String -Pattern "Issued to|Issued by|Expiration|Signing Certificate|Verifying|Result:"
}
Write-Host ""
Write-Host "提示：请确认签名者（Issued to）为你自己的正式证书，且时间戳有效。"
if (-not $allOk) { exit 1 }