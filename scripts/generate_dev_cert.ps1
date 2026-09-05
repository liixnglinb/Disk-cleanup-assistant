# 生成一个仅用于本地测试/验证签名流程的自签名代码签名证书。
# 注意：自签名证书不面向公众可信（SmartScreen 不会信任），只用来跑通 pipeline。
# 正式发布请使用正规 CA（DigiCert / Sectigo 等）的 OV/EV 代码签名证书。
param(
    [string]$Subject = "CN=Local Toolbox Dev, O=Local Toolbox",
    [string]$Password = "DevSign123!",
    [string]$OutDir = "build\certs"
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$pfx = Join-Path $root "$OutDir\dev-selfsigned.pfx"
if (Test-Path $pfx) { Remove-Item -LiteralPath $pfx -Force }

$cert = New-SelfSignedCertificate -Type CodeSigningCert -Subject $Subject -CertStoreLocation Cert:\CurrentUser\My -KeyExportPolicy Exportable -NotAfter (Get-Date).AddYears(1)
$pwd = ConvertTo-SecureString -String $Password -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath $pfx -Password $pwd | Out-Null
Write-Host "已生成开发自签名证书（仅供测试，不可用于公众分发）:"
Write-Host "  $pfx"
Write-Host "  密码: $Password"