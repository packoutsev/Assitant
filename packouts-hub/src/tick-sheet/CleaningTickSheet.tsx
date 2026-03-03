import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, FileText, Loader2 } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useCleaningSheets, useCleaningSheet } from './hooks/useCleaningSheet';
import type { CleaningSheet, Room } from './types';
import CleaningSheetList from './components/CleaningSheetList';
import SheetHeader from './components/SheetHeader';
import RoomList from './components/RoomList';
import RoomDetail from './components/RoomDetail';
import ScopeExport from './components/ScopeExport';

type View = 'list' | 'sheet' | 'room' | 'export';

export default function CleaningTickSheet() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { sheets, loading: listLoading, refresh } = useCleaningSheets();

  const [activeSheetId, setActiveSheetId] = useState<string | null>(null);
  const [view, setView] = useState<View>('list');
  const [roomIndex, setRoomIndex] = useState(0);

  const { sheet, loading: sheetLoading, saving, save, saveNow, create } = useCleaningSheet(activeSheetId);

  const openSheet = useCallback((s: CleaningSheet) => {
    setActiveSheetId(s.id);
    setView('sheet');
  }, []);

  const handleCreate = useCallback(async () => {
    try {
      const newSheet = await create({
        customer: '',
        address: '',
        claim_number: '',
        cleaning_type: 'fire',
        rooms: [],
        status: 'draft',
        created_by: profile?.email || '',
      });
      setActiveSheetId(newSheet.id);
      setView('sheet');
    } catch (err) {
      console.error('Failed to create sheet:', err);
    }
  }, [create, profile]);

  const handleBack = useCallback(async () => {
    if (view === 'room' || view === 'export') {
      setView('sheet');
    } else if (view === 'sheet') {
      if (sheet) await saveNow(sheet);
      setActiveSheetId(null);
      setView('list');
      refresh();
    } else {
      navigate('/');
    }
  }, [view, sheet, saveNow, navigate, refresh]);

  const updateSheet = useCallback((updates: Partial<CleaningSheet>) => {
    if (!sheet) return;
    save({ ...sheet, ...updates });
  }, [sheet, save]);

  const updateRoom = useCallback((updated: Room) => {
    if (!sheet) return;
    const rooms = [...sheet.rooms];
    rooms[roomIndex] = updated;
    save({ ...sheet, rooms });
  }, [sheet, roomIndex, save]);

  const addRoom = useCallback((room: Room) => {
    if (!sheet) return;
    const rooms = [...sheet.rooms, room];
    save({ ...sheet, rooms });
    setRoomIndex(rooms.length - 1);
    setView('room');
  }, [sheet, save]);

  const deleteRoom = useCallback(() => {
    if (!sheet) return;
    const rooms = sheet.rooms.filter((_, i) => i !== roomIndex);
    save({ ...sheet, rooms });
    setView('sheet');
  }, [sheet, roomIndex, save]);

  const selectRoom = useCallback((i: number) => {
    setRoomIndex(i);
    setView('room');
  }, []);

  // Page wrapper
  const pageTitle = view === 'list' ? 'Cleaning Scope' :
    view === 'export' ? 'Scope Summary' :
    view === 'room' ? (sheet?.rooms[roomIndex]?.name || 'Room') :
    (sheet?.customer || 'New Sheet');

  return (
    <div className="min-h-screen bg-warm">
      {/* Header */}
      <header className="bg-navy text-white sticky top-0 z-20">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={handleBack}
            className="p-1.5 -ml-1.5 rounded-lg hover:bg-white/10 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-base font-bold flex-1 truncate">{pageTitle}</h1>
          {saving && <Loader2 className="w-4 h-4 animate-spin text-white/50" />}
          {view === 'sheet' && sheet && (
            <button
              onClick={() => setView('export')}
              className="flex items-center gap-1 px-2.5 py-1 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-semibold transition-colors"
            >
              <FileText className="w-3.5 h-3.5" />
              Summary
            </button>
          )}
        </div>
      </header>

      {/* Content */}
      <main className="max-w-2xl mx-auto px-4 py-4">
        {/* List view */}
        {view === 'list' && (
          <CleaningSheetList
            sheets={sheets}
            loading={listLoading}
            onSelect={openSheet}
            onCreate={handleCreate}
          />
        )}

        {/* Sheet view */}
        {view === 'sheet' && sheet && !sheetLoading && (
          <div className="space-y-5">
            <SheetHeader sheet={sheet} onChange={updateSheet} />
            <div className="border-t border-gray-200 pt-4">
              <RoomList
                rooms={sheet.rooms}
                cleaningType={sheet.cleaning_type}
                onSelectRoom={selectRoom}
                onAddRoom={addRoom}
              />
            </div>
          </div>
        )}

        {/* Room detail */}
        {view === 'room' && sheet && sheet.rooms[roomIndex] && (
          <RoomDetail
            room={sheet.rooms[roomIndex]}
            cleaningType={sheet.cleaning_type}
            onChange={updateRoom}
            onDelete={deleteRoom}
            onBack={() => setView('sheet')}
          />
        )}

        {/* Export view */}
        {view === 'export' && sheet && (
          <ScopeExport sheet={sheet} onBack={() => setView('sheet')} />
        )}

        {/* Loading */}
        {(view !== 'list' && sheetLoading) && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
          </div>
        )}
      </main>
    </div>
  );
}
