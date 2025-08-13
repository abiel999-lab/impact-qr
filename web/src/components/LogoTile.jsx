import logoDefault from '../assets/logo.png';

export default function LogoTile({ src = logoDefault, alt = 'Impact QR' }) {
  return (
    <div className="w-24 h-24 rounded-2xl bg-white shadow-soft border border-black/5 grid place-items-center">
      <img
        src={src}
        alt={alt}
        className="max-w-[80%] max-h-[80%] object-contain"
        onError={(e) => {
          // fallback: kalau logo gagal dimuat, tampilkan kotak gradasi
          e.currentTarget.style.display = 'none';
          e.currentTarget.parentElement.classList.add('bg-gradient-to-br','from-primary','to-purple-300');
        }}
      />
    </div>
  );
}
