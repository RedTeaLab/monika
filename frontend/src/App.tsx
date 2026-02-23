import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/contexts/AuthContext'
import { PreferencesProvider } from '@/contexts/PreferencesContext'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { Toaster } from '@/components/ui/toaster'
import { initTheme } from '@/contexts/PreferencesContext'

const LandingPage = lazy(() => import('@/pages/LandingPage').then(m => ({ default: m.LandingPage })))
const AuthPage = lazy(() => import('@/pages/AuthPage').then(m => ({ default: m.AuthPage })))
const RegisterSuccessPage = lazy(() => import('@/pages/RegisterSuccessPage').then(m => ({ default: m.RegisterSuccessPage })))
const DashboardPage = lazy(() => import('@/pages/DashboardPage').then(m => ({ default: m.DashboardPage })))
const CharacterCreatePage = lazy(() => import('@/pages/CharacterCreatePage').then(m => ({ default: m.CharacterCreatePage })))
const CharacterListPage = lazy(() => import('@/pages/CharacterListPage').then(m => ({ default: m.CharacterListPage })))
const CharacterSelectPage = lazy(() => import('@/pages/CharacterSelectPage').then(m => ({ default: m.CharacterSelectPage })))
const GameConsole = lazy(() => import('@/components/GameConsole').then(m => ({ default: m.GameConsole })))
const SessionsPage = lazy(() => import('@/pages/Sessions').then(m => ({ default: m.SessionsPage })))
const RecapPage = lazy(() => import('@/pages/Recap').then(m => ({ default: m.RecapPage })))

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
    </div>
  )
}

function App() {
  initTheme()

  return (
    <BrowserRouter>
      <AuthProvider>
        <PreferencesProvider>
          <Toaster />
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/auth" element={<AuthPage />} />
              <Route path="/register-success" element={<RegisterSuccessPage />} />

              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <DashboardPage />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/characters"
                element={
                  <ProtectedRoute>
                    <CharacterListPage />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/character/new"
                element={
                  <ProtectedRoute>
                    <CharacterCreatePage />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/select-character"
                element={
                  <ProtectedRoute>
                    <CharacterSelectPage />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/game"
                element={
                  <ProtectedRoute>
                    <GameConsole />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/sessions"
                element={
                  <ProtectedRoute>
                    <SessionsPage />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/recap/:sessionId"
                element={
                  <ProtectedRoute>
                    <RecapPage />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/character/:id/edit"
                element={
                  <ProtectedRoute>
                    <div>角色编辑页（待实现）</div>
                  </ProtectedRoute>
                }
              />

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </PreferencesProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
