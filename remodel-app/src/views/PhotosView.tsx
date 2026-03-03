import { useState, useRef } from 'react';
import type { Photo, Measurement, Zone } from '../types';
import { Camera, Ruler, Plus, Trash2, X, Mic, MicOff, Image } from 'lucide-react';

interface PhotosViewProps {
  photos: Photo[];
  measurements: Measurement[];
  onAddPhoto: (photo: Photo) => void;
  onDeletePhoto: (id: string) => void;
  onUpdateMeasurement: (item: Measurement, value: string) => void;
}

const zones: Zone[] = ['Primary Bedroom', 'Primary Hallway', 'Primary Bathroom'];

export function PhotosView({ photos, measurements, onAddPhoto, onDeletePhoto, onUpdateMeasurement }: PhotosViewProps) {
  const [activeTab, setActiveTab] = useState<'photos' | 'measurements'>('photos');
  const [filterZone, setFilterZone] = useState<string>('all');
  const [expandedPhoto, setExpandedPhoto] = useState<string | null>(null);
  const [showCapture, setShowCapture] = useState(false);
  const [captureZone, setCaptureZone] = useState<Zone>('Primary Bathroom');
  const [captureCaption, setCaptureCaption] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [isListening, setIsListening] = useState(false);
  const [listeningRow, setListeningRow] = useState<number | null>(null);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const photo: Photo = {
        id: Date.now().toString(),
        dataUrl: reader.result as string,
        zone: captureZone,
        task: '',
        caption: captureCaption,
        timestamp: new Date().toISOString(),
      };
      onAddPhoto(photo);
      setShowCapture(false);
      setCaptureCaption('');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  function startVoiceMeasurement(item: Measurement) {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('Voice input not supported in this browser');
      return;
    }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    setIsListening(true);
    setListeningRow(item._row);

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      onUpdateMeasurement(item, transcript);
      setIsListening(false);
      setListeningRow(null);
    };

    recognition.onerror = () => {
      setIsListening(false);
      setListeningRow(null);
    };
    recognition.onend = () => {
      setIsListening(false);
      setListeningRow(null);
    };
    recognition.start();
  }

  const filteredPhotos = filterZone === 'all' ? photos : photos.filter(p => p.zone === filterZone);

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Tab Toggle */}
      <div className="flex gap-1 bg-warm-dark rounded-lg p-1">
        <button
          onClick={() => setActiveTab('photos')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'photos' ? 'bg-white text-slate-dark shadow-sm' : 'text-slate-light'
          }`}
        >
          <Camera size={14} />
          Photos
          {photos.length > 0 && <span className="text-[10px] text-slate-light">({photos.length})</span>}
        </button>
        <button
          onClick={() => setActiveTab('measurements')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'measurements' ? 'bg-white text-slate-dark shadow-sm' : 'text-slate-light'
          }`}
        >
          <Ruler size={14} />
          Measurements
        </button>
      </div>

      {activeTab === 'photos' ? (
        <>
          {/* Zone Filter */}
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            <button
              onClick={() => setFilterZone('all')}
              className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                filterZone === 'all' ? 'bg-copper text-white' : 'bg-warm-dark text-slate-light'
              }`}
            >
              All
            </button>
            {zones.map(z => (
              <button
                key={z}
                onClick={() => setFilterZone(z)}
                className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                  filterZone === z ? 'bg-copper text-white' : 'bg-warm-dark text-slate-light'
                }`}
              >
                {z.replace('Primary ', '')}
              </button>
            ))}
          </div>

          {/* Capture Controls */}
          {showCapture ? (
            <div className="bg-white rounded-lg border border-warm-dark p-3 space-y-2">
              <div className="flex gap-2">
                <select
                  value={captureZone}
                  onChange={e => setCaptureZone(e.target.value as Zone)}
                  className="text-sm border border-warm-dark rounded px-2 py-1.5 focus:outline-none focus:border-copper"
                >
                  {zones.map(z => <option key={z} value={z}>{z.replace('Primary ', '')}</option>)}
                </select>
                <input
                  type="text"
                  value={captureCaption}
                  onChange={e => setCaptureCaption(e.target.value)}
                  placeholder="Caption (optional)"
                  className="flex-1 text-sm border border-warm-dark rounded px-2 py-1.5 focus:outline-none focus:border-copper"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => cameraInputRef.current?.click()}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-copper text-white py-2 rounded-lg text-sm hover:bg-copper-dark"
                >
                  <Camera size={14} /> Take Photo
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-slate-mid text-white py-2 rounded-lg text-sm hover:bg-slate-dark"
                >
                  <Image size={14} /> Upload
                </button>
                <button
                  onClick={() => setShowCapture(false)}
                  className="px-3 py-2 text-slate-light hover:text-slate-dark"
                >
                  <X size={16} />
                </button>
              </div>
              <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleFileSelect} className="hidden" />
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />
            </div>
          ) : (
            <button
              onClick={() => setShowCapture(true)}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg border border-dashed border-copper/40 text-sm text-copper hover:bg-copper/5"
            >
              <Plus size={14} /> Add Photo
            </button>
          )}

          {/* Photo Grid */}
          {filteredPhotos.length === 0 ? (
            <p className="text-sm text-slate-light text-center py-8">No photos yet. Start documenting your project.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {filteredPhotos.map(photo => (
                <div
                  key={photo.id}
                  onClick={() => setExpandedPhoto(photo.id)}
                  className="relative aspect-square rounded-lg overflow-hidden cursor-pointer border border-warm-dark hover:border-copper/30 transition-colors"
                >
                  <img src={photo.dataUrl} alt={photo.caption} className="w-full h-full object-cover" />
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                    <span className="text-[10px] text-white/80">{(photo.zone as string).replace('Primary ', '')}</span>
                    {photo.caption && <p className="text-[11px] text-white truncate">{photo.caption}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Expanded Photo Modal */}
          {expandedPhoto && (() => {
            const photo = photos.find(p => p.id === expandedPhoto);
            if (!photo) return null;
            return (
              <div
                className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
                onClick={() => setExpandedPhoto(null)}
              >
                <div className="max-w-2xl w-full" onClick={e => e.stopPropagation()}>
                  <img src={photo.dataUrl} alt={photo.caption} className="w-full rounded-lg" />
                  <div className="flex items-center justify-between mt-2">
                    <div>
                      <span className="text-xs text-white/60">{(photo.zone as string).replace('Primary ', '')}</span>
                      {photo.caption && <p className="text-sm text-white">{photo.caption}</p>}
                      <span className="text-[10px] text-white/40">{new Date(photo.timestamp).toLocaleDateString()}</span>
                    </div>
                    <button
                      onClick={() => { onDeletePhoto(photo.id); setExpandedPhoto(null); }}
                      className="text-red-400 hover:text-red-300 p-2"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}
        </>
      ) : (
        /* Measurements Tab */
        <div className="space-y-4">
          {zones.map(zone => {
            const zoneMeasurements = measurements.filter(m => m.zone === zone);
            if (zoneMeasurements.length === 0) return null;
            return (
              <div key={zone} className="bg-white rounded-lg border border-warm-dark overflow-hidden">
                <h3 className="text-sm font-semibold text-slate-dark p-3 border-b border-warm-dark bg-warm-dark/30">
                  {zone.replace('Primary ', '')}
                </h3>
                <div className="divide-y divide-warm-dark">
                  {zoneMeasurements.map(m => (
                    <div key={m._row} className="px-3 py-2.5 flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-dark">{m.location} — {m.dimension}</p>
                        {m.notes && <p className="text-[10px] text-slate-light">{m.notes}</p>}
                      </div>
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={m.value}
                          onChange={e => onUpdateMeasurement(m, e.target.value)}
                          placeholder="—"
                          className="w-28 text-sm text-right border border-warm-dark rounded px-2 py-1 focus:outline-none focus:border-copper"
                        />
                        <button
                          onClick={() => startVoiceMeasurement(m)}
                          className={`p-1 rounded transition-colors ${
                            isListening && listeningRow === m._row
                              ? 'bg-red-50 text-red-600'
                              : 'text-slate-light hover:text-copper'
                          }`}
                        >
                          {isListening && listeningRow === m._row ? <MicOff size={14} /> : <Mic size={14} />}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
