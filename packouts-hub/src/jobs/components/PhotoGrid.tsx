import { useState, useCallback, useEffect } from 'react';
import { ChevronDown, ChevronRight, ChevronLeft, Camera, X, Loader2 } from 'lucide-react';
import { getMcpClient } from '../McpClient';
import type { EncircleRoom, EncirclePhoto } from '../types';

interface Props {
  rooms: EncircleRoom[];
  claimId: number | null;
}

export default function PhotoGrid({ rooms, claimId }: Props) {
  const [expandedRoom, setExpandedRoom] = useState<string | null>(null);
  const [photosByRoom, setPhotosByRoom] = useState<Record<string, EncirclePhoto[]>>({});
  const [loadingRoom, setLoadingRoom] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);

  // Flatten all loaded photos into a navigable list
  const allPhotos: EncirclePhoto[] = [];
  for (const room of rooms) {
    const photos = photosByRoom[room.name];
    if (photos) allPhotos.push(...photos);
  }

  const selected = selectedIndex >= 0 && selectedIndex < allPhotos.length ? allPhotos[selectedIndex] : null;

  const goNext = useCallback(() => {
    setSelectedIndex((i) => (i < allPhotos.length - 1 ? i + 1 : i));
  }, [allPhotos.length]);

  const goPrev = useCallback(() => {
    setSelectedIndex((i) => (i > 0 ? i - 1 : i));
  }, []);

  const close = useCallback(() => setSelectedIndex(-1), []);

  // Keyboard navigation
  useEffect(() => {
    if (selectedIndex < 0) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); goNext(); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); goPrev(); }
      else if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedIndex, goNext, goPrev, close]);

  const loadPhotosForRoom = useCallback(async (roomName: string) => {
    if (photosByRoom[roomName] || !claimId) return;
    setLoadingRoom(roomName);
    try {
      const enc = getMcpClient('encircle');
      const result = await enc.callTool<EncirclePhoto[]>('get_photos', {
        claim_id: String(claimId),
        room_filter: roomName,
      });
      setPhotosByRoom((prev) => ({ ...prev, [roomName]: Array.isArray(result) ? result : [] }));
    } catch {
      setPhotosByRoom((prev) => ({ ...prev, [roomName]: [] }));
    }
    setLoadingRoom(null);
  }, [claimId, photosByRoom]);

  const toggleRoom = (roomName: string) => {
    if (expandedRoom === roomName) {
      setExpandedRoom(null);
    } else {
      setExpandedRoom(roomName);
      loadPhotosForRoom(roomName);
    }
  };

  // Find global index for a photo in a specific room
  const getGlobalIndex = (roomName: string, localIndex: number): number => {
    let offset = 0;
    for (const room of rooms) {
      const photos = photosByRoom[room.name];
      if (room.name === roomName) return offset + localIndex;
      if (photos) offset += photos.length;
    }
    return -1;
  };

  if (rooms.length === 0) {
    return <p className="text-gray-400 text-sm py-8 text-center">No rooms found for this customer in Encircle.</p>;
  }

  return (
    <>
      <p className="text-xs text-gray-400 mb-4">
        {rooms.length} rooms documented
      </p>

      <div className="space-y-2">
        {rooms.map((room) => {
          const isExpanded = expandedRoom === room.name;
          const photos = photosByRoom[room.name];
          const isLoading = loadingRoom === room.name;

          return (
            <div key={room.id} className="border border-gray-200 rounded-xl overflow-hidden">
              <button
                onClick={() => toggleRoom(room.name)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
              >
                {isExpanded
                  ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                }
                <Camera className="w-4 h-4 text-navy/40 flex-shrink-0" />
                <span className="text-sm font-medium text-gray-800 flex-1">{room.name}</span>
                {room._structure_name && (
                  <span className="text-xs text-gray-400">{room._structure_name}</span>
                )}
                {photos && (
                  <span className="text-xs text-gray-400 font-mono">{photos.length}</span>
                )}
              </button>

              {isExpanded && (
                <div className="px-4 pb-4">
                  {isLoading ? (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="w-4 h-4 text-navy animate-spin" />
                      <span className="ml-2 text-gray-400 text-xs">Loading photos...</span>
                    </div>
                  ) : photos && photos.length > 0 ? (
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                      {photos.map((photo, idx) => (
                        <button
                          key={photo.source_id}
                          onClick={() => setSelectedIndex(getGlobalIndex(room.name, idx))}
                          className="aspect-square rounded-lg overflow-hidden border border-gray-200 hover:border-navy/40 hover:shadow-md transition-all bg-gray-50"
                        >
                          <img
                            src={photo.download_uri}
                            alt={photo.filename || `Photo ${photo.source_id}`}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-400 text-xs py-4 text-center">No photos for this room.</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Lightbox with arrow navigation */}
      {selected && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center"
          onClick={close}
        >
          {/* Close */}
          <button
            onClick={close}
            className="absolute top-4 right-4 text-white/60 hover:text-white z-10"
          >
            <X className="w-8 h-8" />
          </button>

          {/* Previous arrow */}
          {selectedIndex > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); goPrev(); }}
              className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/70 text-white rounded-full p-2 transition-colors z-10"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
          )}

          {/* Next arrow */}
          {selectedIndex < allPhotos.length - 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); goNext(); }}
              className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/70 text-white rounded-full p-2 transition-colors z-10"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          )}

          {/* Image */}
          <img
            src={selected.download_uri}
            alt={selected.filename || ''}
            className="max-w-[90vw] max-h-[85vh] rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />

          {/* Caption bar */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/60 text-white text-sm px-5 py-2.5 rounded-lg flex items-center gap-3">
            <span className="text-white/50 font-mono text-xs">
              {selectedIndex + 1} / {allPhotos.length}
            </span>
            {selected.room_name && (
              <>
                <span className="text-white/30">|</span>
                <span className="font-semibold">{selected.room_name}</span>
              </>
            )}
            {selected.structure_name && (
              <span className="text-white/60">— {selected.structure_name}</span>
            )}
          </div>
        </div>
      )}
    </>
  );
}
