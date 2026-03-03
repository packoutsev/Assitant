import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Package, Boxes, AlertTriangle } from 'lucide-react';
import type { Vault } from '../types';
import { FLAG_CONFIG } from '../types';
import { useWarehouse } from '../contexts/WarehouseContext';

const statusConfig = {
  occupied: {
    bg: 'bg-vault-occupied-bg',
    border: 'border-vault-occupied',
    hoverBorder: 'hover:border-slate-400',
    icon: Package,
  },
  empty: {
    bg: 'bg-vault-empty-bg',
    border: 'border-vault-empty',
    hoverBorder: 'hover:border-green-400',
    icon: null,
  },
  pallet: {
    bg: 'bg-vault-pallet-bg',
    border: 'border-vault-pallet',
    hoverBorder: 'hover:border-amber-400',
    icon: Boxes,
  },
  mold: {
    bg: 'bg-vault-mold-bg',
    border: 'border-vault-mold',
    hoverBorder: 'hover:border-red-400',
    icon: AlertTriangle,
  },
};

interface VaultCardProps {
  vault: Vault;
  isHighlighted: boolean;
  isDimmed: boolean;
  isSelected: boolean;
}

export default function VaultCard({ vault, isHighlighted, isDimmed, isSelected }: VaultCardProps) {
  const { dispatch } = useWarehouse();
  const config = statusConfig[vault.status];
  const flag = vault.flagReason ? FLAG_CONFIG[vault.flagReason] : null;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: vault.id,
    data: { vault },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleClick = (e: React.MouseEvent) => {
    if (isDragging) return;
    e.stopPropagation();
    dispatch({ type: 'SELECT_VAULT', vaultId: vault.id });
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={handleClick}
      className={`
        relative select-none cursor-grab active:cursor-grabbing
        min-w-[90px] w-[90px] h-[72px] p-1.5
        border rounded-md transition-all duration-150
        ${config.bg} ${config.border} ${config.hoverBorder}
        ${isDragging ? 'opacity-40 scale-95' : ''}
        ${isHighlighted ? 'ring-2 ring-yellow-400 ring-offset-1 ring-offset-gray-950 z-10' : ''}
        ${isDimmed ? 'opacity-30' : ''}
        ${isSelected ? 'ring-2 ring-blue-400 ring-offset-1 ring-offset-gray-950 z-10' : ''}
        touch-manipulation
      `}
      title={[
        vault.vaultNum ? `Vault #${vault.vaultNum}` : 'No vault number',
        vault.customer || 'Empty',
        flag ? `Flag: ${flag.label}` : '',
        vault.notes,
      ].filter(Boolean).join('\n')}
    >
      {/* Flag indicator — color-coded dot */}
      {flag && (
        <div className="absolute -top-1.5 -left-1.5 z-10 flex items-center">
          <div
            className="w-3.5 h-3.5 rounded-full border border-gray-900 shadow-sm"
            style={{ backgroundColor: flag.dotColor }}
            title={flag.label}
          />
        </div>
      )}

      {/* Vault number */}
      <div className="absolute top-0.5 right-1 font-mono text-[10px] text-gray-400 leading-none">
        {vault.vaultNum || '\u2014'}
      </div>

      {/* Customer name */}
      <div className="mt-2.5 text-[11px] font-semibold leading-tight truncate text-gray-100">
        {vault.customer || (
          <span className="text-green-400/70 font-normal italic text-[10px]">Empty</span>
        )}
      </div>

      {/* Flag reason label */}
      {flag && (
        <div className={`text-[8px] leading-none mt-0.5 truncate ${flag.color}`}>
          {flag.label}
        </div>
      )}

      {/* Status indicator */}
      {vault.status === 'pallet' && (
        <div className="absolute bottom-0.5 right-1">
          <Boxes className="w-3 h-3 text-amber-500/60" />
        </div>
      )}
      {vault.status === 'mold' && (
        <div className="absolute bottom-0.5 right-1">
          <AlertTriangle className="w-3 h-3 text-red-500/80" />
        </div>
      )}

      {/* Notes indicator */}
      {vault.notes && (
        <div className="absolute bottom-0.5 left-1 text-[8px] text-gray-500">
          \u2022\u2022\u2022
        </div>
      )}
    </div>
  );
}
