import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import ProtectedRoute from './auth/ProtectedRoute'
import './index.css'
import App from './App'
import AZFireHelp from './AZFireHelp'
import Websites from './Websites'
import JobList from './jobs/JobList'
import JobDetail from './jobs/JobDetail'
import FireLeadList from './fireleads/FireLeadList'
import Wiki from './wiki/Wiki'
import Journal from './journal/Journal'
import ARDashboard from './ar/ARDashboard'
import UserManagement from './users/UserManagement'
import CallTrainer from './call-trainer/CallTrainer'
import CleaningTickSheet from './tick-sheet/CleaningTickSheet'
import CalendarPage from './calendar/CalendarPage'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider appId="hub">
      <BrowserRouter>
        <ProtectedRoute>
          <Routes>
            <Route path="/" element={<App />} />
            <Route path="/az-fire-help" element={<AZFireHelp />} />
            <Route path="/websites" element={<Websites />} />
            <Route path="/fire-leads" element={<FireLeadList />} />
            <Route path="/jobs" element={<JobList />} />
            <Route path="/jobs/:jobId" element={<JobDetail />} />
            <Route path="/wiki" element={<Wiki />} />
            <Route path="/journal" element={<Journal />} />
            <Route path="/ar" element={<ARDashboard />} />
            <Route path="/users" element={<UserManagement />} />
            <Route path="/call-trainer/*" element={<CallTrainer />} />
            <Route path="/tick-sheet" element={<CleaningTickSheet />} />
            <Route path="/calendar" element={<CalendarPage />} />
          </Routes>
        </ProtectedRoute>
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>,
)
