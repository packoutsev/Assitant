import { useState, useCallback } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable';
import { useWarehouse } from '../contexts/WarehouseContext';
import VaultCard from './VaultCard';
import ConfirmDialog from './ConfirmDialog';
import type { Vault } from '../types';

export default function WarehouseMap() {
  const {
    zones,
    searchQuery,
    highlightedCustomer,
    selectedVaultId,
    resolveCustomerName,
    dispatch,
  } = useWarehouse();

  const [activeVault, setActiveVault] = useState<Vault | null>(null);
  const [pendingMove, setPendingMove] = useState<{ from: string; to: string; fromVault: Vault; toVault: Vault } | null>(null);

  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 8 },
  });
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: { delay: 200, tolerance: 8 },
  });
  const sensors = useSensors(pointerSensor, touchSensor);

  const isVaultHighlighted = useCallback((vault: Vault): boolean => {
    const q = searchQuery.toLowerCase().trim();
    const hasCustomerHighlight = highlightedCustomer !== null;

    if (!q && !hasCustomerHighlight) return false;

    if (q) {
      if (vault.vaultNum.toLowerCase().includes(q)) return true;
      if (vault.customer.toLowerCase().includes(q)) return true;
      const resolved = resolveCustomerName(vault.customer);
      if (resolved.toLowerCase().includes(q)) return true;
    }

    if (hasCustomerHighlight && vault.customer) {
      const resolved = resolveCustomerName(vault.customer);
      if (resolved === highlightedCustomer) return true;
    }

    return false;
  }, [searchQuery, highlightedCustomer, resolveCustomerName]);

  const hasAnyFilter = searchQuery.trim() !== '' || highlightedCustomer !== null;

  const handleDragStart = (event: DragStartEvent) => {
    const vault = event.active.data.current?.vault as Vault | undefined;
    if (vault && vault.customer) {
      setActiveVault(vault);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveVault(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const fromVault = active.data.current?.vault as Vault | undefined;
    const toVault = over.data.current?.vault as Vault | undefined;
    if (!fromVault || !toVault || !fromVault.customer) return;

    setPendingMove({ from: fromVault.id, to: toVault.id, fromVault, toVault });
  };

  const confirmMove = () => {
    if (!pendingMove) return;
    dispatch({ type: 'MOVE_CUSTOMER', fromVaultId: pendingMove.from, toVaultId: pendingMove.to });
    setPendingMove(null);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="space-y-6 pb-8">
        {/* Compass / orientation */}
        <div className="flex items-center justify-between text-[10px] text-gray-600 uppercase tracking-widest px-2">
          <span>&larr; Entry (West)</span>
          <span>&uarr; Back Wall (North)</span>
          <span>Office (East) &rarr;</span>
        </div>

        {zones.map(zone => (
          <div key={zone.id} className="space-y-2">
            {/* Zone label */}
            <div className="flex items-center gap-2 px-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                {zone.name}
                {zone.layoutHint === 'offsite' && (
                  <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] font-medium bg-purple-900/40 text-purple-400 normal-case tracking-normal">
                    Offsite
                  </span>
                )}
              </h3>
              <div className="flex-1 h-px bg-gray-800" />
            </div>

            {zone.rows.map((row, rowIdx) => (
              <div key={row.id}>
                {/* Aisle marker between center rows */}
                {zone.id === 'center-aisle' && rowIdx === 1 && (
                  <div className="flex items-center gap-2 px-4 my-2">
                    <div className="flex-1 border-t border-dashed border-gray-700" />
                    <span className="text-[9px] text-gray-600 uppercase tracking-widest">aisle</span>
                    <div className="flex-1 border-t border-dashed border-gray-700" />
                  </div>
                )}
                <div className="space-y-1">
                  {row.label && (
                    <p className="text-[10px] text-gray-600 px-2 font-mono">{row.label}</p>
                  )}
                  <SortableContext items={row.vaults.map(v => v.id)} strategy={rectSortingStrategy}>
                    <div className="flex flex-wrap gap-1.5 px-2">
                      {row.vaults.map(vault => {
                        const highlighted = isVaultHighlighted(vault);
                        const dimmed = hasAnyFilter && !highlighted;
                        const selected = vault.id === selectedVaultId;
                        return (
                          <VaultCard
                            key={vault.id}
                            vault={vault}
                            isHighlighted={highlighted}
                            isDimmed={dimmed}
                            isSelected={selected}
                          />
                        );
                      })}
                    </div>
                  </SortableContext>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Drag overlay */}
      <DragOverlay>
        {activeVault && (
          <div className="drag-overlay">
            <VaultCard
              vault={activeVault}
              isHighlighted={false}
              isDimmed={false}
              isSelected={false}
            />
          </div>
        )}
      </DragOverlay>

      {/* Confirm dialog */}
      {pendingMove && (
        <ConfirmDialog
          title={pendingMove.toVault.customer ? 'Swap Vaults?' : 'Move Customer?'}
          message={
            pendingMove.toVault.customer
              ? `Swap "${pendingMove.fromVault.customer}" (vault ${pendingMove.fromVault.vaultNum || '?'}) with "${pendingMove.toVault.customer}" (vault ${pendingMove.toVault.vaultNum || '?'})?`
              : `Move "${pendingMove.fromVault.customer}" from vault ${pendingMove.fromVault.vaultNum || '?'} to vault ${pendingMove.toVault.vaultNum || '?'}?`
          }
          confirmLabel={pendingMove.toVault.customer ? 'Swap' : 'Move'}
          onConfirm={confirmMove}
          onCancel={() => setPendingMove(null)}
        />
      )}
    </DndContext>
  );
}
