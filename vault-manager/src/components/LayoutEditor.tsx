import { useState } from 'react';
import { X, Plus, Trash2, ChevronDown, ChevronRight, RotateCcw, AlertTriangle, GripVertical } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { useWarehouse } from '../contexts/WarehouseContext';
import type { RowType, LayoutHint } from '../types';
import { ROW_TYPE_CONFIG } from '../types';

/** Wrapper: makes its children sortable, provides a drag handle ref+listeners via render prop */
function SortableItem({ id, className, children }: {
  id: string;
  className?: string;
  children: (handleRef: (el: HTMLElement | null) => void, handleListeners: Record<string, unknown>) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className={className} {...attributes}>
      {children(setActivatorNodeRef, listeners ?? {})}
    </div>
  );
}

export default function LayoutEditor({ onClose }: { onClose: () => void }) {
  const { zones, dispatch } = useWarehouse();
  const [expandedZones, setExpandedZones] = useState<Set<string>>(new Set(zones.map(z => z.id)));
  const [showReset, setShowReset] = useState(false);

  // Add zone form
  const [showAddZone, setShowAddZone] = useState(false);
  const [newZoneName, setNewZoneName] = useState('');
  const [newZoneHint, setNewZoneHint] = useState<LayoutHint>('floor');
  const [newZoneRowType, setNewZoneRowType] = useState<RowType>('vault');
  const [newZoneCount, setNewZoneCount] = useState(6);

  // Add row form (per zone)
  const [addRowZone, setAddRowZone] = useState<string | null>(null);
  const [newRowType, setNewRowType] = useState<RowType>('vault');
  const [newRowCount, setNewRowCount] = useState(6);
  const [newRowLabel, setNewRowLabel] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function toggleZone(id: string) {
    setExpandedZones(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function handleAddZone() {
    if (!newZoneName.trim()) return;
    dispatch({ type: 'ADD_ZONE', name: newZoneName.trim(), layoutHint: newZoneHint, rowType: newZoneRowType, vaultCount: newZoneCount });
    setNewZoneName('');
    setShowAddZone(false);
  }

  function handleAddRow(zoneId: string) {
    dispatch({ type: 'ADD_ROW', zoneId, rowType: newRowType, vaultCount: newRowCount, label: newRowLabel.trim() || undefined });
    setAddRowZone(null);
    setNewRowLabel('');
    setNewRowCount(6);
  }

  function zoneHasOccupied(zoneId: string): boolean {
    const zone = zones.find(z => z.id === zoneId);
    return zone ? zone.rows.some(r => r.vaults.some(v => v.customer !== '' || v.status === 'occupied')) : false;
  }

  function rowHasOccupied(zoneId: string, rowId: string): boolean {
    const zone = zones.find(z => z.id === zoneId);
    const row = zone?.rows.find(r => r.id === rowId);
    return row ? row.vaults.some(v => v.customer !== '' || v.status === 'occupied') : false;
  }

  function handleZoneDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = zones.findIndex(z => z.id === active.id);
    const newIndex = zones.findIndex(z => z.id === over.id);
    if (oldIndex !== -1 && newIndex !== -1) {
      dispatch({ type: 'REORDER_ZONES', fromIndex: oldIndex, toIndex: newIndex });
    }
  }

  function handleRowDragEnd(zoneId: string, event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const zone = zones.find(z => z.id === zoneId);
    if (!zone) return;
    const oldIndex = zone.rows.findIndex(r => r.id === active.id);
    const newIndex = zone.rows.findIndex(r => r.id === over.id);
    if (oldIndex !== -1 && newIndex !== -1) {
      dispatch({ type: 'REORDER_ROWS', zoneId, fromIndex: oldIndex, toIndex: newIndex });
    }
  }

  const totalVaults = zones.reduce((t, z) => t + z.rows.reduce((rt, r) => rt + r.vaults.length, 0), 0);
  const occupiedCount = zones.reduce((t, z) => t + z.rows.reduce((rt, r) => rt + r.vaults.filter(v => v.customer).length, 0), 0);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-700">
          <div>
            <h2 className="text-lg font-bold text-white">Layout Editor</h2>
            <p className="text-xs text-gray-400 mt-0.5">{zones.length} zones &middot; {totalVaults} units &middot; {occupiedCount} occupied &middot; drag to reorder</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis]}
            onDragEnd={handleZoneDragEnd}
          >
            <SortableContext items={zones.map(z => z.id)} strategy={verticalListSortingStrategy}>
              {zones.map(zone => {
                const isExpanded = expandedZones.has(zone.id);
                const occupied = zoneHasOccupied(zone.id);
                const vaultCount = zone.rows.reduce((t, r) => t + r.vaults.length, 0);

                return (
                  <SortableItem key={zone.id} id={zone.id} className="bg-gray-800/50 rounded-xl border border-gray-700">
                    {(handleRef, handleListeners) => (
                      <>
                        {/* Zone header */}
                        <div className="flex items-center gap-2 p-3">
                          <button
                            ref={handleRef}
                            {...handleListeners}
                            className="cursor-grab active:cursor-grabbing text-gray-600 hover:text-gray-400 touch-none"
                            title="Drag to reorder zone"
                          >
                            <GripVertical className="w-4 h-4" />
                          </button>
                          <button onClick={() => toggleZone(zone.id)} className="text-gray-400 hover:text-white">
                            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </button>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-white truncate">{zone.name}</p>
                            <p className="text-[10px] text-gray-500">{zone.rows.length} row(s) &middot; {vaultCount} units</p>
                          </div>
                          <button
                            onClick={() => dispatch({ type: 'REMOVE_ZONE', zoneId: zone.id })}
                            disabled={occupied}
                            title={occupied ? 'Cannot delete — has occupied units' : 'Delete zone'}
                            className={`p-1.5 rounded-lg text-xs ${occupied ? 'text-gray-600 cursor-not-allowed' : 'text-red-400 hover:bg-red-900/30 hover:text-red-300'}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Rows */}
                        {isExpanded && (
                          <div className="px-3 pb-3 space-y-2">
                            <DndContext
                              sensors={sensors}
                              collisionDetection={closestCenter}
                              modifiers={[restrictToVerticalAxis]}
                              onDragEnd={(e) => handleRowDragEnd(zone.id, e)}
                            >
                              <SortableContext items={zone.rows.map(r => r.id)} strategy={verticalListSortingStrategy}>
                                {zone.rows.map(row => {
                                  const rowOccupied = rowHasOccupied(zone.id, row.id);
                                  const emptyCount = row.vaults.filter(v => !v.customer && v.status === 'empty').length;
                                  const typeLabel = ROW_TYPE_CONFIG[row.rowType || 'vault'].label;

                                  return (
                                    <SortableItem key={row.id} id={row.id} className="bg-gray-900/50 rounded-lg p-3 border border-gray-700/50">
                                      {(rowHandleRef, rowHandleListeners) => (
                                        <>
                                          <div className="flex items-center gap-2">
                                            <button
                                              ref={rowHandleRef}
                                              {...rowHandleListeners}
                                              className="cursor-grab active:cursor-grabbing text-gray-600 hover:text-gray-400 touch-none"
                                              title="Drag to reorder row"
                                            >
                                              <GripVertical className="w-3.5 h-3.5" />
                                            </button>
                                            <div className="flex-1">
                                              <p className="text-xs font-medium text-gray-300">
                                                {row.label || typeLabel} <span className="text-gray-500">({row.vaults.length} units, {emptyCount} empty)</span>
                                              </p>
                                              <p className="text-[10px] text-gray-500 mt-0.5">Type: {typeLabel}</p>
                                            </div>
                                            {/* Add units */}
                                            <button
                                              onClick={() => dispatch({ type: 'ADD_VAULTS', zoneId: zone.id, rowId: row.id, count: 1 })}
                                              className="px-2 py-1 rounded text-[10px] font-medium bg-blue-900/30 text-blue-400 hover:bg-blue-900/50"
                                            >
                                              <Plus className="w-3 h-3 inline" /> 1
                                            </button>
                                            <button
                                              onClick={() => dispatch({ type: 'ADD_VAULTS', zoneId: zone.id, rowId: row.id, count: 3 })}
                                              className="px-2 py-1 rounded text-[10px] font-medium bg-blue-900/30 text-blue-400 hover:bg-blue-900/50"
                                            >
                                              <Plus className="w-3 h-3 inline" /> 3
                                            </button>
                                            {/* Remove row */}
                                            <button
                                              onClick={() => dispatch({ type: 'REMOVE_ROW', zoneId: zone.id, rowId: row.id })}
                                              disabled={rowOccupied}
                                              title={rowOccupied ? 'Cannot delete — has occupied units' : 'Delete row'}
                                              className={`p-1.5 rounded ${rowOccupied ? 'text-gray-600 cursor-not-allowed' : 'text-red-400 hover:bg-red-900/30'}`}
                                            >
                                              <Trash2 className="w-3 h-3" />
                                            </button>
                                          </div>

                                          {/* Vault chips — show empty ones that can be removed */}
                                          {emptyCount > 0 && (
                                            <div className="flex flex-wrap gap-1 mt-2">
                                              {row.vaults.filter(v => !v.customer && v.status === 'empty').map(v => (
                                                <button
                                                  key={v.id}
                                                  onClick={() => dispatch({ type: 'REMOVE_VAULT', vaultId: v.id })}
                                                  title={`Remove vault #${v.vaultNum}`}
                                                  className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-gray-800 text-gray-500 hover:bg-red-900/30 hover:text-red-400 border border-gray-700 hover:border-red-800"
                                                >
                                                  #{v.vaultNum} &times;
                                                </button>
                                              ))}
                                            </div>
                                          )}
                                        </>
                                      )}
                                    </SortableItem>
                                  );
                                })}
                              </SortableContext>
                            </DndContext>

                            {/* Add row to zone */}
                            {addRowZone === zone.id ? (
                              <div className="bg-gray-900/50 rounded-lg p-3 border border-blue-800/50 space-y-2">
                                <div className="flex gap-2">
                                  <input
                                    value={newRowLabel}
                                    onChange={e => setNewRowLabel(e.target.value)}
                                    placeholder="Row label (optional)"
                                    className="flex-1 px-2 py-1.5 rounded bg-gray-800 text-white text-xs border border-gray-700 focus:border-blue-500 outline-none"
                                  />
                                  <select
                                    value={newRowType}
                                    onChange={e => setNewRowType(e.target.value as RowType)}
                                    className="px-2 py-1.5 rounded bg-gray-800 text-white text-xs border border-gray-700"
                                  >
                                    <option value="vault">Vault</option>
                                    <option value="large-pallet">Large Pallet</option>
                                    <option value="small-pallet">Small Pallet</option>
                                  </select>
                                </div>
                                <div className="flex items-center gap-2">
                                  <label className="text-[10px] text-gray-400">Count:</label>
                                  <input
                                    type="number" min={1} max={30}
                                    value={newRowCount}
                                    onChange={e => setNewRowCount(Number(e.target.value))}
                                    className="w-16 px-2 py-1.5 rounded bg-gray-800 text-white text-xs border border-gray-700"
                                  />
                                  <button
                                    onClick={() => handleAddRow(zone.id)}
                                    className="px-3 py-1.5 rounded text-xs font-medium bg-blue-600 text-white hover:bg-blue-500"
                                  >
                                    Add Row
                                  </button>
                                  <button
                                    onClick={() => setAddRowZone(null)}
                                    className="px-3 py-1.5 rounded text-xs font-medium bg-gray-700 text-gray-300 hover:bg-gray-600"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                onClick={() => setAddRowZone(zone.id)}
                                className="w-full py-2 rounded-lg border border-dashed border-gray-700 text-xs text-gray-500 hover:text-blue-400 hover:border-blue-800 flex items-center justify-center gap-1"
                              >
                                <Plus className="w-3 h-3" /> Add Row
                              </button>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </SortableItem>
                );
              })}
            </SortableContext>
          </DndContext>

          {/* Add Zone */}
          {showAddZone ? (
            <div className="bg-gray-800/50 rounded-xl border border-blue-800/50 p-4 space-y-3">
              <p className="text-sm font-semibold text-white">New Zone</p>
              <input
                value={newZoneName}
                onChange={e => setNewZoneName(e.target.value)}
                placeholder="Zone name (e.g., Overflow Area)"
                className="w-full px-3 py-2 rounded-lg bg-gray-900 text-white text-sm border border-gray-700 focus:border-blue-500 outline-none"
                autoFocus
              />
              <div className="flex gap-3">
                <div>
                  <label className="text-[10px] text-gray-400 block mb-1">Position</label>
                  <select
                    value={newZoneHint}
                    onChange={e => setNewZoneHint(e.target.value as LayoutHint)}
                    className="px-2 py-1.5 rounded bg-gray-900 text-white text-xs border border-gray-700"
                  >
                    <option value="back-wall">Back Wall</option>
                    <option value="center">Center Aisle</option>
                    <option value="floor">Floor Area</option>
                    <option value="offsite">Offsite (GYMO)</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 block mb-1">Unit Type</label>
                  <select
                    value={newZoneRowType}
                    onChange={e => setNewZoneRowType(e.target.value as RowType)}
                    className="px-2 py-1.5 rounded bg-gray-900 text-white text-xs border border-gray-700"
                  >
                    <option value="vault">Vault</option>
                    <option value="large-pallet">Large Pallet</option>
                    <option value="small-pallet">Small Pallet</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 block mb-1">Count</label>
                  <input
                    type="number" min={1} max={30}
                    value={newZoneCount}
                    onChange={e => setNewZoneCount(Number(e.target.value))}
                    className="w-16 px-2 py-1.5 rounded bg-gray-900 text-white text-xs border border-gray-700"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={handleAddZone} className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-500">
                  Create Zone
                </button>
                <button onClick={() => setShowAddZone(false)} className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-700 text-gray-300 hover:bg-gray-600">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowAddZone(true)}
              className="w-full py-3 rounded-xl border-2 border-dashed border-gray-700 text-sm text-gray-500 hover:text-blue-400 hover:border-blue-800 flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" /> Add Zone
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-gray-700 flex items-center justify-between">
          <button
            onClick={() => setShowReset(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-orange-400 hover:bg-orange-900/20"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset to Default
          </button>
          <button onClick={onClose} className="px-5 py-2 rounded-lg text-sm font-medium bg-gray-700 text-white hover:bg-gray-600">
            Done
          </button>
        </div>

        {/* Reset confirm */}
        {showReset && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-2xl">
            <div className="bg-gray-800 rounded-xl border border-gray-600 p-6 max-w-sm space-y-4">
              <div className="flex items-center gap-2 text-orange-400">
                <AlertTriangle className="w-5 h-5" />
                <p className="text-sm font-semibold">Reset Warehouse?</p>
              </div>
              <p className="text-xs text-gray-400">This will restore the original layout from the 2/24 audit. All layout changes will be lost. Vault contents will also reset.</p>
              <div className="flex gap-2">
                <button
                  onClick={() => { dispatch({ type: 'RESET_WAREHOUSE' }); setShowReset(false); }}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-orange-600 text-white hover:bg-orange-500"
                >
                  Reset
                </button>
                <button
                  onClick={() => setShowReset(false)}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-700 text-gray-300 hover:bg-gray-600"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
