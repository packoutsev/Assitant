import { Users, Clock, Menu, Box, LayoutGrid, Printer, ScanLine, Settings } from 'lucide-react';
import { WarehouseProvider, useWarehouse } from './contexts/WarehouseContext';
// import { AuthProvider } from './auth/AuthContext';
import WarehouseMap3D from './components/WarehouseMap3D';
import WarehouseMap from './components/WarehouseMap';
import VaultDetail from './components/VaultDetail';
import SearchBar from './components/SearchBar';
import CustomerSidebar from './components/CustomerSidebar';
import ActivityLog from './components/ActivityLog';
import Dashboard from './components/Dashboard';
import QRLabelGenerator from './components/QRLabelGenerator';
import QuickScan from './components/QuickScan';
import LayoutEditor from './components/LayoutEditor';
import { useState } from 'react';

function AuthGate() {
  // Auth temporarily bypassed — API key referrer restriction blocking login
  return (
    <WarehouseProvider>
      <AppContent />
    </WarehouseProvider>
  );
}

function AppContent() {
  const { selectedVaultId, dispatch } = useWarehouse();
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [view3D, setView3D] = useState(false);
  const [showLabelPrinter, setShowLabelPrinter] = useState(false);
  const [showQuickScan, setShowQuickScan] = useState(false);
  const [showLayoutEditor, setShowLayoutEditor] = useState(false);

  return (
    <div className="h-screen bg-gray-950 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 z-20 bg-gray-950/95 backdrop-blur border-b border-gray-800">
        <div className="flex items-center gap-3 px-3 py-2">
          {/* Mobile menu */}
          <button
            onClick={() => setShowMobileMenu(!showMobileMenu)}
            className="lg:hidden p-2 rounded hover:bg-gray-800 text-gray-400"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Title */}
          <div className="flex-shrink-0">
            <h1 className="text-base font-bold text-gray-100 leading-none">
              Vault Manager
            </h1>
            <p className="text-[10px] text-gray-500 leading-none mt-0.5">
              1-800-Packouts East Valley
            </p>
          </div>

          {/* Search */}
          <div className="flex-1 max-w-md">
            <SearchBar />
          </div>

          {/* Quick Scan — prominent */}
          <button
            onClick={() => setShowQuickScan(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
                       bg-blue-600 hover:bg-blue-500 text-white transition-colors"
          >
            <ScanLine className="w-4 h-4" />
            <span className="hidden sm:inline">Scan</span>
          </button>

          {/* 2D/3D toggle */}
          <div className="flex items-center bg-gray-800 rounded-lg p-0.5">
            <button
              onClick={() => setView3D(false)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors
                ${!view3D ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">2D</span>
            </button>
            <button
              onClick={() => setView3D(true)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors
                ${view3D ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
            >
              <Box className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">3D</span>
            </button>
          </div>

          {/* Desktop toolbar */}
          <div className="hidden lg:flex items-center gap-1">
            <button
              onClick={() => setShowLabelPrinter(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm text-gray-400 hover:bg-gray-800 hover:text-gray-200"
            >
              <Printer className="w-4 h-4" />
              Labels
            </button>
            <button
              onClick={() => dispatch({ type: 'TOGGLE_CUSTOMER_SIDEBAR' })}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm text-gray-400 hover:bg-gray-800 hover:text-gray-200"
            >
              <Users className="w-4 h-4" />
              Customers
            </button>
            <button
              onClick={() => dispatch({ type: 'TOGGLE_ACTIVITY_LOG' })}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm text-gray-400 hover:bg-gray-800 hover:text-gray-200"
            >
              <Clock className="w-4 h-4" />
              Activity
            </button>
            <div className="w-px h-5 bg-gray-700" />
            <button
              onClick={() => setShowLayoutEditor(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm text-gray-400 hover:bg-gray-800 hover:text-gray-200"
            >
              <Settings className="w-4 h-4" />
              Layout
            </button>
          </div>
        </div>

        {/* Mobile menu dropdown */}
        {showMobileMenu && (
          <div className="lg:hidden border-t border-gray-800 px-3 py-2 flex gap-2">
            <button
              onClick={() => {
                setShowLabelPrinter(true);
                setShowMobileMenu(false);
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded text-sm text-gray-400 hover:bg-gray-800 flex-1"
            >
              <Printer className="w-4 h-4" />
              Labels
            </button>
            <button
              onClick={() => {
                dispatch({ type: 'TOGGLE_CUSTOMER_SIDEBAR' });
                setShowMobileMenu(false);
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded text-sm text-gray-400 hover:bg-gray-800 flex-1"
            >
              <Users className="w-4 h-4" />
              Customers
            </button>
            <button
              onClick={() => {
                dispatch({ type: 'TOGGLE_ACTIVITY_LOG' });
                setShowMobileMenu(false);
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded text-sm text-gray-400 hover:bg-gray-800 flex-1"
            >
              <Clock className="w-4 h-4" />
              Activity
            </button>
            <button
              onClick={() => {
                setShowLayoutEditor(true);
                setShowMobileMenu(false);
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded text-sm text-gray-400 hover:bg-gray-800 flex-1"
            >
              <Settings className="w-4 h-4" />
              Layout
            </button>
          </div>
        )}

        {/* Dashboard stats + legend */}
        <div className="flex items-center justify-between border-t border-gray-800/50">
          <Dashboard />
          <div className="hidden lg:flex items-center gap-3 px-3 text-[10px] text-gray-500 flex-shrink-0">
            <div className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ background: '#334155' }} />
              <span>Occupied</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ background: '#064e3b' }} />
              <span>Empty</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ background: '#78350f' }} />
              <span>Pallet</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ background: '#7f1d1d' }} />
              <span>Mold</span>
            </div>
            <div className="w-px h-3 bg-gray-700" />
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full" style={{ background: '#f97316' }} />
              <span>A/R Due</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full" style={{ background: '#ef4444' }} />
              <span>A/R Esc</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full" style={{ background: '#fb7185' }} />
              <span>Hazard</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full" style={{ background: '#facc15' }} />
              <span>Verify</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 relative overflow-hidden">
        {view3D ? (
          <WarehouseMap3D />
        ) : (
          <div className="h-full overflow-auto p-3">
            <WarehouseMap />
          </div>
        )}
      </main>

      {/* Overlays */}
      <CustomerSidebar />
      <ActivityLog />
      {selectedVaultId && <VaultDetail />}
      {showLabelPrinter && <QRLabelGenerator onClose={() => setShowLabelPrinter(false)} />}
      {showQuickScan && <QuickScan onClose={() => setShowQuickScan(false)} />}
      {showLayoutEditor && <LayoutEditor onClose={() => setShowLayoutEditor(false)} />}
    </div>
  );
}

export default function App() {
  // AuthProvider temporarily removed — API key referrer restriction blocking Firebase Auth
  return <AuthGate />;
}
