import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { getToken, getTheme } from '@/lib/config';
import { Shell } from '@/components/Shell';
import { ToastProvider } from '@/components/Toast';
import { Icon } from '@/components/Icon';
import Login from '@/pages/Login';

const Home = lazy(() => import('@/pages/Home'));
const Browse = lazy(() => import('@/pages/Browse'));
const Detail = lazy(() => import('@/pages/Detail'));
const Upload = lazy(() => import('@/pages/Upload'));
const Profile = lazy(() => import('@/pages/Profile'));
const Sites = lazy(() => import('@/pages/Sites'));
const SettingsPage = lazy(() => import('@/pages/Settings'));

function RequireAuth({ children }: { children: ReactNode }) {
  return getToken() ? <>{children}</> : <Navigate to="/login" replace />;
}

function Loading() {
  return <div className="route-loading"><Icon name="disc" size={22} /><span>加载中…</span></div>;
}

/** /s/:name —— 分区名来自各站的 /sections，不再写死 special */
function SectionBrowse() {
  const { name } = useParams();
  return <Browse sectionName={name || 'special'} />;
}

function Guarded({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <Shell>
        <Suspense fallback={<Loading />}>{children}</Suspense>
      </Shell>
    </RequireAuth>
  );
}

export default function App() {
  if (typeof document !== 'undefined') document.documentElement.dataset.theme = getTheme();
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Guarded><Home /></Guarded>} />
          <Route path="/torrents" element={<Guarded><Browse /></Guarded>} />
          <Route path="/s/:name" element={<Guarded><SectionBrowse /></Guarded>} />
          <Route path="/special" element={<Guarded><Navigate to="/s/special" replace /></Guarded>} />
          <Route path="/bookmarks" element={<Guarded><Browse bookmarkOnly /></Guarded>} />
          <Route path="/t/:id" element={<Guarded><Detail /></Guarded>} />
          <Route path="/upload" element={<Guarded><Upload /></Guarded>} />
          <Route path="/sites" element={<Guarded><Sites /></Guarded>} />
          <Route path="/me" element={<Guarded><Profile self /></Guarded>} />
          <Route path="/u/:id" element={<Guarded><Profile /></Guarded>} />
          <Route path="/settings" element={<Guarded><SettingsPage /></Guarded>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}
