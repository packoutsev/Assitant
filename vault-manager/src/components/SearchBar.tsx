import { Search, X } from 'lucide-react';
import { useWarehouse } from '../contexts/WarehouseContext';

export default function SearchBar() {
  const { searchQuery, dispatch } = useWarehouse();

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
      <input
        type="text"
        value={searchQuery}
        onChange={e => dispatch({ type: 'SET_SEARCH', query: e.target.value })}
        placeholder="Search vault # or customer..."
        className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-8 py-2 text-sm text-gray-100
                   placeholder:text-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
      />
      {searchQuery && (
        <button
          onClick={() => dispatch({ type: 'SET_SEARCH', query: '' })}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-gray-700 text-gray-500"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
