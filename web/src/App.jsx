// web/src/App.jsx
import { Routes, Route } from "react-router-dom";
import Header from "./ui/Header";
import Dashboard from "./pages/Dashboard";
import ScanPage from "./pages/ScanPage";
import History from "./pages/History";
import { ToastProvider } from "./ui/Toast";

export default function App() {
  return (
    <ToastProvider>
      <div className="min-h-screen bg-[var(--bg)] text-ink flex flex-col">
        <Header />
        <main className="flex-1 max-w-6xl mx-auto w-full p-4">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/scan" element={<ScanPage />} />
            <Route path="/history" element={<History />} />
          </Routes>
        </main>
        <footer className="text-center py-5 text-xs text-ink/60">
          © {new Date().getFullYear()} Impact QR
        </footer>
      </div>
    </ToastProvider>
  );
}
