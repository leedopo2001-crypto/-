import { Routes, Route, Navigate } from 'react-router-dom';

function Placeholder({ title }: { title: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-slate-800">{title}</h1>
        <p className="mt-2 text-slate-500">이 화면은 다음 단계에서 구현됩니다.</p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/home" replace />} />
      <Route path="/onboarding" element={<Placeholder title="온보딩 (3단계에서 구현)" />} />
      <Route path="/home" element={<Placeholder title="NFT 티켓 플랫폼 — 1단계 완료" />} />
      <Route path="/ticket/:id" element={<Placeholder title="티켓 상세 (5단계)" />} />
      <Route path="/market" element={<Placeholder title="마켓 (7단계)" />} />
      <Route path="/admin" element={<Placeholder title="어드민 (4단계)" />} />
      <Route path="/staff" element={<Placeholder title="스태프 스캐너 (5단계)" />} />
      <Route path="*" element={<Placeholder title="404" />} />
    </Routes>
  );
}
