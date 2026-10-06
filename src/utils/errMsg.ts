/**
 * 把任意异常压成一句可显示的话。
 *
 * 全站原本各写各的 `String(e instanceof Error ? e.message : e)`（30 处），
 * 行为还不完全一致：Fetch 失败时 message 是 "Failed to fetch" 这种对普通用户
 * 毫无意义的英文。统一走这里，顺手把最常见的网络错误翻成中文。
 */
export function errMsg(e: unknown): string {
  if (e == null) return "未知错误";
  const raw = e instanceof Error ? e.message : String(e);
  const text = (raw || "").trim();
  if (!text) return e instanceof Error ? e.name : "未知错误";
  // 浏览器抛的 fetch/XHR 失败没有细节，只告诉用户该检查什么
  if (/^failed to fetch$/i.test(text) || /^networkerror/i.test(text)) {
    return "连不上本地服务，软件可能已经关闭后端；请重试，或重启本软件";
  }
  return text;
}
