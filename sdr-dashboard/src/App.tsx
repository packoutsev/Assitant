import { useState } from 'react';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { useSheetData } from './hooks/useSheetData';
import AuthGate from './auth/AuthGate';
import Layout, { type ViewId } from './components/Layout';
import TodayView from './views/TodayView';
import ProgressView from './views/ProgressView';
import KPIView from './views/KPIView';
import TrainingView from './views/TrainingView';
import LearnView from './views/LearnView';
import PlaybookView from './views/PlaybookView';
import AdminView from './views/AdminView';

function AppInner() {
  const { user, profile, loading, logout } = useAuth();
  const isAdmin = profile?.role === 'owner' || profile?.role === 'admin';
  const [activeView, setActiveView] = useState<ViewId>('today');
  const data = useSheetData();

  if (loading || !user) {
    return <AuthGate />;
  }

  if (data.loading) {
    return (
      <div className="min-h-screen bg-warm flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-navy/20 border-t-amber rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 text-sm">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <Layout activeView={activeView} onNavigate={setActiveView} onLogout={logout} isAdmin={isAdmin}>
      {activeView === 'today' && (
        <TodayView tasks={data.dailyPlan} onStatusChange={data.updateTaskStatus} onNavigate={setActiveView} />
      )}
      {activeView === 'learn' && <LearnView />}
      {activeView === 'playbook' && <PlaybookView />}
      {activeView === 'progress' && (
        <ProgressView tasks={data.dailyPlan} training={data.trainingLog} />
      )}
      {activeView === 'kpis' && (
        <KPIView kpis={data.kpiRamp} onUpdateActual={data.updateKPIActual} />
      )}
      {activeView === 'training' && (
        <TrainingView modules={data.trainingLog} onToggleComplete={data.updateTrainingCompleted} />
      )}
      {activeView === 'admin' && isAdmin && <AdminView />}
    </Layout>
  );
}

export default function App() {
  return (
    <AuthProvider appId="sdr">
      <AppInner />
    </AuthProvider>
  );
}
