import QRCode from 'qrcode';
import { useEffect, useRef } from 'react';

export default function QrBox({ url, size = 220 }) {
  const ref = useRef(null);
  useEffect(() => { if (url) QRCode.toCanvas(ref.current, url, { width: size }); }, [url, size]);
  return <canvas ref={ref} className="rounded-2xl shadow" />;
}
