import { lazy, Suspense, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppProvider, useApp } from "./context/AppContext";
import { Layout } from "./components/Layout";
import { Loading } from "./components/ui";
import Login from "./pages/Login";
import Companies from "./pages/Companies";
import { MustChangePassword, NoAccess } from "./pages/Account";

// Écrans secondaires chargés à la demande (pdf.js, graphiques, Excel)
const Company = lazy(() => import("./pages/Company"));
const QrtDetail = lazy(() => import("./pages/QrtDetail"));
const Compare = lazy(() => import("./pages/Compare"));
const Evolution = lazy(() => import("./pages/Evolution"));
const Collection = lazy(() => import("./pages/Collection"));
const Import = lazy(() => import("./pages/Import"));
const Review = lazy(() => import("./pages/Review"));
const Settings = lazy(() => import("./pages/Settings"));
const Help = lazy(() => import("./pages/Help"));

/** Écrans réservés aux administrateurs (le contrôle réel est fait par la base et les edge functions). */
function AdminOnly({ children }: { children: ReactNode }) {
  const { isAdmin } = useApp();
  return isAdmin ? <>{children}</> : <Navigate to="/" replace />;
}

function Gate() {
  const { session, ready, role, mustChangePassword } = useApp();
  if (!ready) return <Loading />;
  if (!session) return <Login />;
  if (role === undefined) return <Loading />;
  if (role === null) return <NoAccess />;
  if (mustChangePassword) return <MustChangePassword />;
  return (
    <Suspense fallback={<main className="page"><Loading /></main>}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Companies />} />
          <Route path="compagnies/:id" element={<Company />} />
          <Route path="compagnies/:id/qrt/:qrt" element={<QrtDetail />} />
          <Route path="comparaison" element={<Compare />} />
          <Route path="evolution" element={<Evolution />} />
          <Route path="collecte" element={<AdminOnly><Collection /></AdminOnly>} />
          <Route path="import" element={<AdminOnly><Import /></AdminOnly>} />
          <Route path="revue" element={<AdminOnly><Review /></AdminOnly>} />
          <Route path="revue/:docId" element={<AdminOnly><Review /></AdminOnly>} />
          <Route path="parametres" element={<Settings />} />
          <Route path="aide" element={<Help />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Gate />
      </BrowserRouter>
    </AppProvider>
  );
}
