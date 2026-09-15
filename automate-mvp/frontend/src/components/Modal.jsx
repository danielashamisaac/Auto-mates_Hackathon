import { useEffect } from 'react';
import { X } from 'lucide-react';

export default function Modal({ open, onClose, title, subtitle, children, footer }) {
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (e.key === 'Escape') onClose && onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="flex-between" style={{ marginBottom: 4 }}>
          <h2>{title}</h2>
          <button className="btn btn-ghost" style={{ padding: '6px 8px' }} onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        {subtitle && <div className="modal-sub">{subtitle}</div>}
        <div>{children}</div>
        {footer && <div className="mt-16">{footer}</div>}
      </div>
    </div>
  );
}
