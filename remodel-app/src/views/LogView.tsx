import { useState } from 'react';
import type { DailyLogEntry, PunchItem, PunchStatus, Zone } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import { PenLine, AlertCircle, Plus, Mic, MicOff } from 'lucide-react';

interface LogViewProps {
  dailyLog: DailyLogEntry[];
  punchList: PunchItem[];
  onAddLogEntry: (entry: Omit<DailyLogEntry, '_row'>) => void;
  onAddPunchItem: (item: Omit<PunchItem, '_row'>) => void;
  onUpdatePunchStatus: (item: PunchItem, newStatus: PunchStatus) => void;
}

const zones: (Zone | string)[] = ['Primary Bedroom', 'Primary Hallway', 'Primary Bathroom'];
const punchStatusCycle: PunchStatus[] = ['Open', 'Fixed'];

export function LogView({ dailyLog, punchList, onAddLogEntry, onAddPunchItem, onUpdatePunchStatus }: LogViewProps) {
  const [logText, setLogText] = useState('');
  const [punchText, setPunchText] = useState('');
  const [punchZone, setPunchZone] = useState<string>('Primary Bathroom');
  const [activeTab, setActiveTab] = useState<'log' | 'punch'>('log');
  const [isListening, setIsListening] = useState(false);

  function addLog() {
    if (!logText.trim()) return;
    const today = new Date().toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' });
    onAddLogEntry({ date: today, entry: logText.trim() });
    setLogText('');
  }

  function addPunch() {
    if (!punchText.trim()) return;
    onAddPunchItem({ item: punchText.trim(), zone: punchZone, status: 'Open', photo: '', notes: '' });
    setPunchText('');
  }

  function cyclePunchStatus(item: PunchItem) {
    const idx = punchStatusCycle.indexOf(item.status);
    const next = punchStatusCycle[(idx + 1) % punchStatusCycle.length];
    onUpdatePunchStatus(item, next);
  }

  function startVoiceInput(target: 'log' | 'punch') {
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

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      if (target === 'log') {
        setLogText(prev => prev ? `${prev} ${transcript}` : transcript);
      } else {
        setPunchText(prev => prev ? `${prev} ${transcript}` : transcript);
      }
      setIsListening(false);
    };

    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    recognition.start();
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Tab Toggle */}
      <div className="flex gap-1 bg-warm-dark rounded-lg p-1">
        <button
          onClick={() => setActiveTab('log')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'log' ? 'bg-white text-slate-dark shadow-sm' : 'text-slate-light'
          }`}
        >
          <PenLine size={14} />
          Daily Log
        </button>
        <button
          onClick={() => setActiveTab('punch')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'punch' ? 'bg-white text-slate-dark shadow-sm' : 'text-slate-light'
          }`}
        >
          <AlertCircle size={14} />
          Punch List
          {punchList.filter(p => p.status === 'Open').length > 0 && (
            <span className="bg-red-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
              {punchList.filter(p => p.status === 'Open').length}
            </span>
          )}
        </button>
      </div>

      {activeTab === 'log' ? (
        <>
          {/* Quick Add Log */}
          <div className="bg-white rounded-lg border border-warm-dark p-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={logText}
                onChange={e => setLogText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addLog()}
                placeholder="What happened today..."
                className="flex-1 text-sm border border-warm-dark rounded-lg px-3 py-2 focus:outline-none focus:border-copper"
              />
              <button
                onClick={() => startVoiceInput('log')}
                className={`p-2 rounded-lg border transition-colors ${
                  isListening ? 'bg-red-50 border-red-300 text-red-600' : 'border-warm-dark text-slate-light hover:border-copper'
                }`}
              >
                {isListening ? <MicOff size={18} /> : <Mic size={18} />}
              </button>
              <button
                onClick={addLog}
                className="bg-copper text-white px-3 py-2 rounded-lg text-sm hover:bg-copper-dark flex items-center gap-1"
              >
                <Plus size={14} /> Add
              </button>
            </div>
          </div>

          {/* Log Entries */}
          <div className="space-y-2">
            {dailyLog.length === 0 ? (
              <p className="text-sm text-slate-light text-center py-8">No log entries yet. Start documenting your project.</p>
            ) : (
              dailyLog.map((entry, i) => (
                <div key={i} className="bg-white rounded-lg border border-warm-dark p-3">
                  <div className="flex items-start gap-3">
                    <span className="text-[11px] text-slate-light whitespace-nowrap mt-0.5">{entry.date}</span>
                    <p className="text-sm text-slate-dark">{entry.entry}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      ) : (
        <>
          {/* Quick Add Punch */}
          <div className="bg-white rounded-lg border border-warm-dark p-3 space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={punchText}
                onChange={e => setPunchText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addPunch()}
                placeholder="Describe the issue..."
                className="flex-1 text-sm border border-warm-dark rounded-lg px-3 py-2 focus:outline-none focus:border-copper"
              />
              <button
                onClick={() => startVoiceInput('punch')}
                className={`p-2 rounded-lg border transition-colors ${
                  isListening ? 'bg-red-50 border-red-300 text-red-600' : 'border-warm-dark text-slate-light hover:border-copper'
                }`}
              >
                {isListening ? <MicOff size={18} /> : <Mic size={18} />}
              </button>
            </div>
            <div className="flex gap-2">
              <select
                value={punchZone}
                onChange={e => setPunchZone(e.target.value)}
                className="text-sm border border-warm-dark rounded-lg px-3 py-2 focus:outline-none focus:border-copper"
              >
                {zones.map(z => (
                  <option key={z} value={z}>{(z as string).replace('Primary ', '')}</option>
                ))}
              </select>
              <button
                onClick={addPunch}
                className="bg-copper text-white px-3 py-2 rounded-lg text-sm hover:bg-copper-dark flex items-center gap-1"
              >
                <Plus size={14} /> Add
              </button>
            </div>
          </div>

          {/* Punch Items */}
          <div className="space-y-2">
            {punchList.length === 0 ? (
              <p className="text-sm text-slate-light text-center py-8">No punch items yet. Add issues as you spot them.</p>
            ) : (
              punchList.map((item, i) => (
                <div
                  key={i}
                  onClick={() => cyclePunchStatus(item)}
                  className={`p-3 rounded-lg border cursor-pointer transition-all ${
                    item.status === 'Fixed'
                      ? 'bg-sage-light/30 border-sage/20 opacity-70'
                      : 'bg-white border-warm-dark hover:border-copper/30'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className={`text-sm ${item.status === 'Fixed' ? 'line-through text-gray-400' : 'text-slate-dark'}`}>
                        {item.item}
                      </p>
                      <span className="text-[10px] text-slate-light">{(item.zone as string).replace('Primary ', '')}</span>
                    </div>
                    <StatusBadge status={item.status} small />
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
