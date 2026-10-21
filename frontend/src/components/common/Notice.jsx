/**
 * 성공/실패/안내 메시지 배너. message 가 없으면 아무것도 그리지 않습니다.
 * @param {Object} props
 * @param {{type:'success'|'error'|'info', text:string}|null} props.notice
 * @param {string} [props.className]
 * @returns {JSX.Element|null}
 */
export default function Notice({ notice, className = '' }) {
  if (!notice || !notice.text) return null;
  const styles = {
    success: 'border-emerald-500/50 bg-emerald-950/40 text-emerald-200',
    error: 'border-red-500/50 bg-red-950/30 text-red-200',
    info: 'border-sky-500/50 bg-sky-950/30 text-sky-200',
  };
  return <div className={`rounded-lg border px-3 py-2 text-xs font-semibold ${styles[notice.type] || styles.info} ${className}`}>{notice.text}</div>;
}
