import { useRef, useState } from "react";

export default function Dropzone({ onFile, disabled }){
  const [drag, setDrag] = useState(false);
  const inputRef = useRef();

  const pick = () => inputRef.current?.click();

  const onDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDrag(false);
    if (disabled) return;
    const f = e.dataTransfer.files?.[0];
    if (f) onFile(f);
  };

  return (
    <div
      onDragOver={(e)=>{e.preventDefault(); setDrag(true);}}
      onDragLeave={()=>setDrag(false)}
      onDrop={onDrop}
      className={`w-full rounded-xl border-2 border-dashed p-4 cursor-pointer
      ${drag ? "border-[var(--primary)] bg-[var(--primary)]/5" : "border-black/10 hover:bg-black/5"}`}
      onClick={pick}
    >
      <div className="text-sm text-ink">
        <b>Drag & drop</b> file di sini, atau <span className="text-primary underline">klik untuk memilih</span>.
      </div>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(e)=> onFile(e.target.files?.[0] || null)}
        disabled={disabled}
      />
    </div>
  );
}
