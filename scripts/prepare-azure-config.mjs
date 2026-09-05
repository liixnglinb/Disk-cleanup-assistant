// 从环境变量读取 Azure Trusted Signing 配置，生成 electron-builder 使用的
// build/azure-config.json（不修改 package.json，避免把敏感/账号信息提交进代码库）。
//
// 需要的环境变量：
//   AZURE_TRUSTED_SIGNING_ENDPOINT   - Trusted Signing 账户租户的签名端点（见 Azure 门户）
//   AZURE_TRUSTED_SIGNING_ACCOUNT    - 签名账户名称 CodeSigningAccountName
//   AZURE_TRUSTED_SIGNING_PROFILE    - 证书配置文件名称 CertificateProfileName
// 认证凭据（Microsoft Entra ID，三选一）：
//   AZURE_TENANT_ID + AZURE_CLIENT_ID + AZURE_CLIENT_SECRET
//   或 AZURE_CLIENT_CERTIFICATE_PATH（+ AZURE_CLIENT_CERTIFICATE_PASSWORD）
//   或 AZURE_USERNAME + AZURE_PASSWORD
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const requiredEnv = [
  "AZURE_TRUSTED_SIGNING_ENDPOINT",
  "AZURE_TRUSTED_SIGNING_ACCOUNT",
  "AZURE_TRUSTED_SIGNING_PROFILE",
];
const missing = requiredEnv.filter((k) => !process.env[k]);
if (missing.length) {
  console.error("缺少 Azure Trusted Signing 环境变量: " + missing.join(", "));
  console.error("请参考 .env.azure.example 设置后再运行 npm run dist:azure");
  process.exit(1);
}
if (!process.env.AZURE_TENANT_ID || !process.env.AZURE_CLIENT_ID) {
  console.error("缺少 Entra ID 身份凭据：请设置 AZURE_TENANT_ID + AZURE_CLIENT_ID，并提供 AZURE_CLIENT_SECRET 或证书/用户名密码之一");
  process.exit(1);
}

const pkgPath = resolve(root, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
if (!pkg.build) { console.error("package.json 缺少 build 配置"); process.exit(1); }

const azureSignOptions = {
  endpoint: process.env.AZURE_TRUSTED_SIGNING_ENDPOINT,
  codeSigningAccountName: process.env.AZURE_TRUSTED_SIGNING_ACCOUNT,
  certificateProfileName: process.env.AZURE_TRUSTED_SIGNING_PROFILE,
};
// 可在环境变量中额外传给 Invoke-TrustedSigning 的参数（如 FileDigest）
const extra = process.env.AZURE_SIGNING_EXTRA_ARGS;
if (extra) {
  try {
    Object.assign(azureSignOptions, JSON.parse(extra));
  } catch {
    console.error("AZURE_SIGNING_EXTRA_ARGS 必须是合法 JSON 对象");
    process.exit(1);
  }
}

const config = {
  ...pkg.build,
  win: { ...pkg.build.win, azureSignOptions },
};
const out = resolve(root, "build", "azure-config.json");
writeFileSync(out, JSON.stringify(config, null, 2), "utf8");
console.log("已生成 Azure 签名配置: " + out);
console.log("  端点:   " + azureSignOptions.endpoint);
console.log("  账户:   " + azureSignOptions.codeSigningAccountName);
console.log("  配置档: " + azureSignOptions.certificateProfileName);