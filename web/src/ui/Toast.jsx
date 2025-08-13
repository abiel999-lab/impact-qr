import { createContext, useContext, useMemo, useState } from "react";

const ToastCtx = createContext(null);

export function ToastProvider({ children }){
  const [items, setItems] = useState([]);
  const toast = (msg, type="info") => {
    const id = Math.random().toString(36).slice(2);
    setItems((s) => [...s, { id, msg, type }]);
    setTimeout(() => setItems((s) => s.filter(i => i.id !== id)), 2200);
  };
  const value = useMemo(()=>({toast}),[]);
  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="fixed right-4 top-4 space-y-2 z-50">
        {items.map(it => (
          <div key={it.id}
               className={`px-3 py-2 rounded-lg text-sm shadow bg-[var(--card)] ring-1 ring-black/10 ${
                 it.type==="error" ? "text-red-600" : it.type==="success" ? "text-green-700" : "text-ink"
               }`}>
            {it.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
