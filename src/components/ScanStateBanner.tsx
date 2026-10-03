import { useScan } from '../store/ScanContext';
import Icon from './icons';

export default function ScanStateBanner() {
  const { status, error, scanId, refreshStatistics } = useScan();
  const partial = status?.status === 'cancelled' || status?.status === 'error' || Boolean(status?.status === 'completed' && status.errors);
  if (!error && !partial) return null;
  const title = error ? '扫描结果暂不可完整读取' : status?.status === 'cancelled' ? '扫描已取消，当前结果不完整' : status?.status === 'error' ? '扫描未完成' : '部分路径未能读取';
  return <section className="scan-state-banner" aria-label="扫描状态">
    <Icon name="alert" size={18} />
    <div><strong>{title}</strong><p>{error || status?.message || '请结合跳过的路径判断结果；已读取的内容仍可查看。'}</p><small>此状态不会触发文件清理。{status?.errors ? ' 跳过 / 读取失败：' + status.errors + ' 项。' : ''}</small></div>
    {scanId && <button type="button" className="btn small" onClick={() => void refreshStatistics()}>重新读取结果</button>}
  </section>;
}
