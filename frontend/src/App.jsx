import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import Header from './components/Header';
import ProtectedRoute from './components/ProtectedRoute';
import { DashboardSkeleton } from './components/Skeleton';

const LandingPage = lazy(() => import('./pages/LandingPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const TailorPage = lazy(() => import('./pages/TailorPage'));
const PricingPage = lazy(() => import('./pages/PricingPage'));
const MyCVsPage = lazy(() => import('./pages/MyCVsPage'));
const DocumentDetailPage = lazy(() => import('./pages/DocumentDetailPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const TermsPage = lazy(() => import('./pages/TermsPage'));
const PrivacyPage = lazy(() => import('./pages/PrivacyPage'));
const AboutPage = lazy(() => import('./pages/AboutPage'));
const ContactPage = lazy(() => import('./pages/ContactPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const SharedCVPage = lazy(() => import('./pages/SharedCVPage'));

function PageLoader() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <DashboardSkeleton />
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <div className="min-h-screen bg-surface-50 dark:bg-surface-900 transition-colors duration-200">
        <Header />
        <main id="main-content">
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/pricing" element={<PricingPage />} />
              <Route path="/about" element={<AboutPage />} />
              <Route path="/contact" element={<ContactPage />} />
              <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
              <Route path="/tailor" element={<ProtectedRoute><TailorPage /></ProtectedRoute>} />
              <Route path="/cvs" element={<ProtectedRoute><MyCVsPage /></ProtectedRoute>} />
              <Route path="/documents/:id" element={<ProtectedRoute><DocumentDetailPage /></ProtectedRoute>} />
              <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
              <Route path="/admin" element={<ProtectedRoute><AdminPage /></ProtectedRoute>} />
              <Route path="/terms" element={<TermsPage />} />
              <Route path="/privacy" element={<PrivacyPage />} />
              <Route path="/shared/:token" element={<SharedCVPage />} />
            </Routes>
          </Suspense>
        </main>
      </div>
    </AuthProvider>
  );
}

export default App;
