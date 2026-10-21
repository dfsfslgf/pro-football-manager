/**
 * 제목과 내용을 담는 공통 패널 카드.
 * @param {Object} props
 * @param {string} [props.title] 패널 제목
 * @param {import('react').ReactNode} [props.right] 제목 오른쪽에 표시할 요소
 * @param {string} [props.className] 추가 클래스
 * @param {import('react').ReactNode} props.children
 * @returns {JSX.Element}
 */
export default function Panel({ title, right = null, className = '', children }) {
  return (
    <section className={`rounded-2xl border border-slate-800 bg-slate-900/70 p-4 ${className}`}>
      {(title || right) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-sm font-bold uppercase tracking-widest text-slate-300">{title}</h2>}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}
