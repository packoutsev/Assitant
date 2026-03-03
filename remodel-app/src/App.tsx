import { useState } from 'react';
import { Layout } from './components/Layout';
import { DashboardView } from './views/DashboardView';
import { ScopeView } from './views/ScopeView';
import { ScheduleView } from './views/ScheduleView';
import { OrdersView } from './views/OrdersView';
import { BudgetView } from './views/BudgetView';
import { LogView } from './views/LogView';
import { SubsView } from './views/SubsView';
import { PhotosView } from './views/PhotosView';
import { BriefView } from './views/BriefView';
import AuthGate from './auth/AuthGate';
import { useAuth } from './hooks/useAuth';
import { useSheetData } from './hooks/useSheetData';
import type { ViewId } from './types';

export default function App() {
  const { authenticated, login } = useAuth();
  const [activeView, setActiveView] = useState<ViewId>('dashboard');
  const data = useSheetData();

  if (!authenticated) {
    return <AuthGate onLogin={login} />;
  }

  if (data.loading) {
    return (
      <div className="min-h-screen bg-warm flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-copper border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-slate-light mt-3">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <Layout activeView={activeView} onNavigate={(v) => setActiveView(v as ViewId)}>
      {activeView === 'dashboard' && (
        <DashboardView
          scope={data.scope}
          orders={data.orders}
          decisions={data.decisions}
          measurements={data.measurements}
          subs={data.subs}
          onNavigate={(v) => setActiveView(v as ViewId)}
        />
      )}
      {activeView === 'scope' && (
        <ScopeView
          scope={data.scope}
          onStatusChange={data.updateScopeStatus}
        />
      )}
      {activeView === 'schedule' && (
        <ScheduleView />
      )}
      {activeView === 'orders' && (
        <OrdersView
          orders={data.orders}
          decisions={data.decisions}
          onUpdateOrderStatus={data.updateOrderStatus}
          onUpdateDecision={data.updateDecisionStatus}
        />
      )}
      {activeView === 'budget' && (
        <BudgetView
          budget={data.budget}
          onUpdateBudgetActual={data.updateBudgetActual}
        />
      )}
      {activeView === 'log' && (
        <LogView
          dailyLog={data.dailyLog}
          punchList={data.punchList}
          onAddLogEntry={data.addDailyLogEntry}
          onAddPunchItem={data.addPunchItem}
          onUpdatePunchStatus={data.updatePunchStatus}
        />
      )}
      {activeView === 'subs' && (
        <SubsView
          subs={data.subs}
          subLog={data.subLog}
          onUpdateSub={data.updateSub}
          onAddSubLogEntry={data.addSubLogEntry}
        />
      )}
      {activeView === 'photos' && (
        <PhotosView
          photos={data.photos}
          measurements={data.measurements}
          onAddPhoto={data.addPhoto}
          onDeletePhoto={data.deletePhoto}
          onUpdateMeasurement={data.updateMeasurement}
        />
      )}
      {activeView === 'brief' && (
        <BriefView
          budget={data.budget}
          decisions={data.decisions}
        />
      )}
    </Layout>
  );
}
