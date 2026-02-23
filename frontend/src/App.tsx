import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/contexts/AuthContext'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { LandingPage } from '@/pages/LandingPage'
import { AuthPage } from '@/pages/AuthPage'
import { RegisterSuccessPage } from '@/pages/RegisterSuccessPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { CharacterCreatePage } from '@/pages/CharacterCreatePage'
import { CharacterListPage } from '@/pages/CharacterListPage'
import { CharacterSelectPage } from '@/pages/CharacterSelectPage'
import { GameConsole } from '@/components/GameConsole'
import { SessionsPage } from '@/pages/Sessions'
import { RecapPage } from '@/pages/Recap'
import { Toaster } from '@/components/ui/toaster'

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Toaster />
        <a
          href="#main-content"
          className="skip-link"
        >
          Skip to main content
        </a>
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

          {/* M3: Memory Web - Session List and Recap */}
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

          {/* 添加角色编辑路由 */}
          <Route
            path="/character/:id/edit"
            element={
              <ProtectedRoute>
                <div>角色编辑页（待实现）</div>
              </ProtectedRoute>
            }
          />

          {/* 404 重定向 */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
