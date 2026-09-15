import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

const ToastContext = createContext({ push: () => {} });

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const idRef = useRef(0);

  const push = useCallback((toast) => {
    const id = ++idRef.current;
    const t = { id, kind: toast.kind || 'info', title: toast.title || '', message: toast.message || '', timeout: toast.timeout ?? 3800 };
    setItems((prev) => [...prev, t]);
    if (t.timeout > 0) {
      setTimeout(() => {
        setItems((prev) => prev.filter((x) => x.id !== id));
      }, t.timeout);
    }
    return id;
  }, []);

  const dismiss = (id) => setItems((prev) => prev.filter((x) => x.id !== id));

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="toast-container">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            <div className="icon-wrap">
              {t.kind === 'success' && <CheckCircle2 size={18} color="#4ddbb8" />}
              {t.kind === 'error' && <AlertTriangle size={18} color="#ff5577" />}
              {t.kind === 'info' && <Info size={18} color="#4f8cff" />}
            </div>
            <div className="body">
              {t.title && <div className="title">{t.title}</div>}
              {t.message && <div className="msg">{t.message}</div>}
            </div>
            <button className="btn btn-ghost" style={{ padding: '4px 8px' }} onClick={() => dismiss(t.id)} aria-label="Dismiss">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
