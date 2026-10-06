import { useScan } from '../store/ScanContext';
import Icon from './icons';

export default function ScanStateBanner() {
  const { status, error, scanId, refreshStatistics } = useScan();
  const partial = status?.status === 'cancelled' || status?.status === 'error' || Boolean(status?.status === 'completed' && status.errors);
  if (!error && !partial) return null;
  const title = error ? '扫描结果暂不可完整读取' : status?.status === 'cancelled' ? '扫描已取消，当前结果不完整' : status?.status === 'error' ? '扫描未完成' : '部分路径未能读取';
  // 后端不可达时 error 是 "TypeError: Failed to fetch" 这类英文原文，
  // 直接甩给用户等于没解释。
  const friendly = (m: string) =>
    /failed to fetch|networkerror|abort|econnrefused|timeout/i.test(m)
      ? '无法连接本地后端服务（可能已退出或未就绪）。可点「重新读取结果」重试。'
      : m;
  const detail = error ? friendly(error) : status?.message || '请结合跳过的路径判断结果；已读取的内容仍可查看。';
  return <section className="scan-state-banner" aria-label="扫描状态">
    <Icon name="alert" size={18} />
    <div><strong>{title}</strong><p>{detail}</p><small>此状态不会触发文件清理。{status?.errors ? ' 跳过 / 读取失败：' + status.errors + ' 项。' : ''}</small></div>
    {scanId && <button type="button" className="btn small" onClick={() => void refreshStatistics()}>重新读取结果</button>}
  </section>;
}
