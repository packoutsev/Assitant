import { useState } from 'react';
import type { SubContact, SubLogEntry } from '../types';
import { Users, MessageSquare, Plus, Phone, Mail, Mic, MicOff } from 'lucide-react';

interface SubsViewProps {
  subs: SubContact[];
  subLog: SubLogEntry[];
  onUpdateSub: (item: SubContact, field: keyof SubContact, value: string) => void;
  onAddSubLogEntry: (entry: Omit<SubLogEntry, '_row'>) => void;
}

export function SubsView({ subs, subLog, onUpdateSub, onAddSubLogEntry }: SubsViewProps) {
  const [activeTab, setActiveTab] = useState<'contacts' | 'log'>('contacts');
  const [editingSub, setEditingSub] = useState<number | null>(null);
  const [logForm, setLogForm] = useState({ trade: '', contact: '', notes: '', followUp: '', quoteAmount: '' });
  const [showLogForm, setShowLogForm] = useState(false);
  const [isListening, setIsListening] = useState(false);

  function saveSubField(item: SubContact, field: keyof SubContact, value: string) {
    onUpdateSub(item, field, value);
  }

  function addLogEntry() {
    if (!logForm.notes.trim()) return;
    const today = new Date().toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' });
    onAddSubLogEntry({ date: today, ...logForm });
    setLogForm({ trade: '', contact: '', notes: '', followUp: '', quoteAmount: '' });
    setShowLogForm(false);
  }

  function startVoiceInput() {
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
      setLogForm(prev => ({ ...prev, notes: prev.notes ? `${prev.notes} ${transcript}` : transcript }));
      setIsListening(false);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    recognition.start();
  }

  const totalQuoted = subLog.reduce((sum, entry) => {
    const amount = parseFloat(entry.quoteAmount.replace(/[^0-9.]/g, ''));
    return sum + (isNaN(amount) ? 0 : amount);
  }, 0);

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Tab Toggle */}
      <div className="flex gap-1 bg-warm-dark rounded-lg p-1">
        <button
          onClick={() => setActiveTab('contacts')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'contacts' ? 'bg-white text-slate-dark shadow-sm' : 'text-slate-light'
          }`}
        >
          <Users size={14} />
          Contacts
        </button>
        <button
          onClick={() => setActiveTab('log')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'log' ? 'bg-white text-slate-dark shadow-sm' : 'text-slate-light'
          }`}
        >
          <MessageSquare size={14} />
          Comm Log
        </button>
      </div>

      {activeTab === 'contacts' ? (
        <div className="space-y-2">
          {subs.map(sub => (
            <div key={sub._row} className="bg-white rounded-lg border border-warm-dark p-3">
              <div className="flex items-start justify-between">
                <h3 className="text-sm font-semibold text-copper">{sub.trade}</h3>
                {editingSub === sub._row ? (
                  <button
                    onClick={() => setEditingSub(null)}
                    className="text-[11px] text-slate-light hover:underline"
                  >
                    Done
                  </button>
                ) : (
                  <button
                    onClick={() => setEditingSub(sub._row)}
                    className="text-[11px] text-copper hover:underline"
                  >
                    Edit
                  </button>
                )}
              </div>

              {editingSub === sub._row ? (
                <div className="mt-2 space-y-1.5">
                  {(['name', 'company', 'phone', 'email', 'notes'] as const).map(field => (
                    <input
                      key={field}
                      type={field === 'email' ? 'email' : field === 'phone' ? 'tel' : 'text'}
                      value={sub[field]}
                      onChange={e => saveSubField(sub, field, e.target.value)}
                      placeholder={field.charAt(0).toUpperCase() + field.slice(1)}
                      className="w-full text-sm border border-warm-dark rounded px-2 py-1 focus:outline-none focus:border-copper"
                    />
                  ))}
                </div>
              ) : (
                <div className="mt-1 space-y-0.5">
                  {sub.name && <p className="text-sm text-slate-dark">{sub.name}{sub.company ? ` — ${sub.company}` : ''}</p>}
                  {!sub.name && !sub.phone && <p className="text-[11px] text-slate-light italic">No contact info yet</p>}
                  <div className="flex items-center gap-3">
                    {sub.phone && (
                      <a href={`tel:${sub.phone}`} className="flex items-center gap-1 text-[11px] text-copper hover:underline">
                        <Phone size={12} /> {sub.phone}
                      </a>
                    )}
                    {sub.email && (
                      <a href={`mailto:${sub.email}`} className="flex items-center gap-1 text-[11px] text-copper hover:underline">
                        <Mail size={12} /> {sub.email}
                      </a>
                    )}
                  </div>
                  {sub.notes && <p className="text-[11px] text-slate-light">{sub.notes}</p>}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* Budget Summary */}
          {totalQuoted > 0 && (
            <div className="bg-copper/5 rounded-lg border border-copper/20 p-3">
              <span className="text-[11px] text-slate-light">Total Quoted</span>
              <p className="text-xl font-bold text-copper">${totalQuoted.toLocaleString()}</p>
            </div>
          )}

          {/* Add Log Entry */}
          {showLogForm ? (
            <div className="bg-white rounded-lg border border-warm-dark p-3 space-y-2">
              <div className="flex gap-2">
                <select
                  value={logForm.trade}
                  onChange={e => setLogForm(prev => ({ ...prev, trade: e.target.value }))}
                  className="text-sm border border-warm-dark rounded px-2 py-1.5 focus:outline-none focus:border-copper"
                >
                  <option value="">Trade...</option>
                  {subs.map(s => <option key={s._row} value={s.trade}>{s.trade}</option>)}
                </select>
                <input
                  type="text"
                  value={logForm.contact}
                  onChange={e => setLogForm(prev => ({ ...prev, contact: e.target.value }))}
                  placeholder="Contact name"
                  className="flex-1 text-sm border border-warm-dark rounded px-2 py-1.5 focus:outline-none focus:border-copper"
                />
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={logForm.notes}
                  onChange={e => setLogForm(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="What was discussed / quoted..."
                  className="flex-1 text-sm border border-warm-dark rounded px-2 py-1.5 focus:outline-none focus:border-copper"
                />
                <button
                  onClick={startVoiceInput}
                  className={`p-1.5 rounded border transition-colors ${
                    isListening ? 'bg-red-50 border-red-300 text-red-600' : 'border-warm-dark text-slate-light hover:border-copper'
                  }`}
                >
                  {isListening ? <MicOff size={16} /> : <Mic size={16} />}
                </button>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={logForm.quoteAmount}
                  onChange={e => setLogForm(prev => ({ ...prev, quoteAmount: e.target.value }))}
                  placeholder="Quote $"
                  className="w-24 text-sm border border-warm-dark rounded px-2 py-1.5 focus:outline-none focus:border-copper"
                />
                <input
                  type="text"
                  value={logForm.followUp}
                  onChange={e => setLogForm(prev => ({ ...prev, followUp: e.target.value }))}
                  placeholder="Follow-up needed?"
                  className="flex-1 text-sm border border-warm-dark rounded px-2 py-1.5 focus:outline-none focus:border-copper"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setShowLogForm(false)}
                  className="text-sm text-slate-light hover:underline px-3 py-1.5"
                >
                  Cancel
                </button>
                <button
                  onClick={addLogEntry}
                  className="bg-copper text-white px-3 py-1.5 rounded-lg text-sm hover:bg-copper-dark"
                >
                  Save
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowLogForm(true)}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg border border-dashed border-copper/40 text-sm text-copper hover:bg-copper/5"
            >
              <Plus size={14} /> Add Communication
            </button>
          )}

          {/* Log Entries */}
          <div className="space-y-2">
            {subLog.length === 0 ? (
              <p className="text-sm text-slate-light text-center py-8">No communications logged yet.</p>
            ) : (
              subLog.map((entry, i) => (
                <div key={i} className="bg-white rounded-lg border border-warm-dark p-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-slate-light">{entry.date}</span>
                        {entry.trade && <span className="text-[11px] font-medium text-copper">{entry.trade}</span>}
                        {entry.contact && <span className="text-[11px] text-slate-light">— {entry.contact}</span>}
                      </div>
                      <p className="text-sm text-slate-dark mt-0.5">{entry.notes}</p>
                      {entry.followUp && <p className="text-[11px] text-amber-700 mt-0.5">Follow-up: {entry.followUp}</p>}
                    </div>
                    {entry.quoteAmount && (
                      <span className="text-sm font-medium text-copper whitespace-nowrap">${entry.quoteAmount}</span>
                    )}
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
