import { useState } from 'react';
import { BookMarked, ChevronDown, Copy, Check, Shield, MessageSquare, Clock, AlertTriangle } from 'lucide-react';
import {
  scripts,
  voicemailRules,
  textRules,
  escalationRules,
  neverDoList,
  dailySchedule,
  dailySummaryTemplate,
  hubspotNoteTemplate,
  textMessageTemplate,
} from '../content/playbook';

type Tab = 'scripts' | 'rules' | 'templates' | 'schedule';

function ScriptAccordion({ script, isOpen, onToggle }: {
  script: typeof scripts[0]; isOpen: boolean; onToggle: () => void;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <button onClick={onToggle} className="w-full flex items-center gap-3 p-4 text-left">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800">{script.title}</p>
          <p className="text-xs text-gray-400 mt-0.5 truncate">{script.context}</p>
        </div>
        <ChevronDown className={`w-5 h-5 text-gray-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <div className="px-4 pb-4 border-t border-gray-100">
          <div className="mt-3 mb-4 p-3 bg-amber/10 rounded-lg border border-amber/20">
            <p className="text-[10px] font-bold text-amber-800 uppercase tracking-wider mb-1">Mindset</p>
            <p className="text-xs text-amber-700">{script.mindset}</p>
          </div>
          <div className="space-y-4">
            {script.sections.map((section, i) => (
              <div key={i}>
                <p className="text-[10px] font-bold text-navy uppercase tracking-wider mb-2">{section.label}</p>
                {section.type === 'instruction' ? (
                  <div className="bg-amber/5 border border-amber/20 rounded-lg p-3">
                    <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{section.content}</p>
                  </div>
                ) : (
                  <div className="bg-navy/5 rounded-lg p-3">
                    <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{section.content}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CopyBlock({ label, content }: { label: string; content: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-gray-800">{label}</p>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-2.5 py-1 text-xs text-navy bg-navy/5 hover:bg-navy/10 rounded-md transition-colors"
        >
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <pre className="text-xs text-gray-600 whitespace-pre-wrap bg-gray-50 rounded-lg p-3 font-mono leading-relaxed overflow-x-auto">
        {content}
      </pre>
    </div>
  );
}

export default function PlaybookView() {
  const [activeTab, setActiveTab] = useState<Tab>('scripts');
  const [openScript, setOpenScript] = useState<string | null>(scripts[0].id);

  const tabs: { id: Tab; label: string; icon: typeof BookMarked }[] = [
    { id: 'scripts', label: 'Scripts', icon: MessageSquare },
    { id: 'rules', label: 'Rules', icon: Shield },
    { id: 'templates', label: 'Templates', icon: Copy },
    { id: 'schedule', label: 'Schedule', icon: Clock },
  ];

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <BookMarked className="w-6 h-6 text-navy" />
          <h1 className="text-xl font-bold text-navy">Playbook</h1>
        </div>
        <p className="text-sm text-gray-500">
          Your call scripts, rules, templates, and daily schedule — everything in one place.
        </p>
        <a
          href="https://docs.google.com/spreadsheets/d/1a7b3XNLJdACHHsnjuoKh9_4UpzHDV4nQQn6mKPkpt7U/edit"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 mt-2 text-xs text-navy/60 hover:text-navy transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
          Open in Google Sheets
        </a>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6 overflow-x-auto">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 text-xs font-medium rounded-lg transition-all whitespace-nowrap ${
              activeTab === id
                ? 'bg-white text-navy shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon className="w-3.5 h-3.5 shrink-0" />
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'scripts' && (
        <div className="space-y-3">
          {scripts.map(script => (
            <ScriptAccordion
              key={script.id}
              script={script}
              isOpen={openScript === script.id}
              onToggle={() => setOpenScript(openScript === script.id ? null : script.id)}
            />
          ))}
        </div>
      )}

      {activeTab === 'rules' && (
        <div className="space-y-6">
          {/* Voicemail Rules */}
          <div>
            <h2 className="text-sm font-bold text-navy mb-3 flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              Voicemail Rules
            </h2>
            <div className="space-y-2">
              {voicemailRules.map((rule, i) => (
                <div key={i} className="bg-white rounded-lg border border-gray-200 p-3">
                  <span className="text-[10px] font-bold text-navy bg-navy/10 px-2 py-0.5 rounded-full">{rule.type}</span>
                  <p className="text-sm text-gray-600 mt-2">{rule.rule}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Text Rules */}
          <div>
            <h2 className="text-sm font-bold text-navy mb-3 flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              Text Message Rules
            </h2>
            <div className="space-y-2">
              {textRules.map((rule, i) => (
                <div key={i} className="bg-white rounded-lg border border-gray-200 p-3">
                  <span className="text-[10px] font-bold text-navy bg-navy/10 px-2 py-0.5 rounded-full">{rule.type}</span>
                  <p className="text-sm text-gray-600 mt-2">{rule.rule}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Escalation Rules */}
          <div>
            <h2 className="text-sm font-bold text-navy mb-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Escalation to Matt
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-4">
                <p className="text-[10px] font-bold text-emerald-700 mb-3 uppercase tracking-wider">DO Escalate</p>
                <ul className="space-y-2">
                  {escalationRules.escalate.map((rule, i) => (
                    <li key={i} className="text-xs text-emerald-700 flex gap-2">
                      <span className="text-emerald-500 shrink-0">●</span>
                      <span>{rule}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
                <p className="text-[10px] font-bold text-gray-500 mb-3 uppercase tracking-wider">Do NOT Escalate</p>
                <ul className="space-y-2">
                  {escalationRules.doNotEscalate.map((rule, i) => (
                    <li key={i} className="text-xs text-gray-600 flex gap-2">
                      <span className="text-gray-400 shrink-0">●</span>
                      <span>{rule}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* Never Do */}
          <div>
            <h2 className="text-sm font-bold text-red-700 mb-3 flex items-center gap-2">
              <Shield className="w-4 h-4" />
              Never Do List
            </h2>
            <div className="bg-red-50 rounded-xl border border-red-200 p-4">
              <div className="space-y-3">
                {neverDoList.map((item, i) => (
                  <div key={i} className="flex gap-3">
                    <span className="text-red-400 shrink-0 text-xs font-bold mt-0.5">✕</span>
                    <div>
                      <p className="text-xs font-semibold text-red-700">{item.rule}</p>
                      <p className="text-xs text-red-500 mt-0.5">→ {item.response}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'templates' && (
        <div className="space-y-4">
          <CopyBlock label="HubSpot Call Note Template" content={hubspotNoteTemplate} />
          <CopyBlock label="Daily Summary Template (Google Chat)" content={dailySummaryTemplate} />
          <CopyBlock label="Text Message Template (Fire Leads)" content={textMessageTemplate} />
        </div>
      )}

      {activeTab === 'schedule' && (
        <div>
          <p className="text-sm text-gray-500 mb-4">
            Your standard daily schedule. All times in AZ time (MST, no daylight savings).
          </p>
          <div className="space-y-2">
            {dailySchedule.map((block, i) => (
              <div key={i} className={`flex gap-4 p-3 rounded-xl border ${
                block.block === 'Break' ? 'bg-gray-50 border-gray-200' :
                block.block === 'Fire Leads' ? 'bg-red-50 border-red-200' :
                block.block === 'Cold Outreach' ? 'bg-blue-50 border-blue-200' :
                block.block === 'Follow-ups' ? 'bg-purple-50 border-purple-200' :
                block.block === 'Prep' ? 'bg-amber/10 border-amber/20' :
                'bg-white border-gray-200'
              }`}>
                <div className="w-28 shrink-0">
                  <p className="text-xs font-bold text-navy">{block.time}</p>
                  <p className={`text-[10px] font-semibold mt-0.5 ${
                    block.block === 'Fire Leads' ? 'text-red-600' :
                    block.block === 'Cold Outreach' ? 'text-blue-600' :
                    block.block === 'Follow-ups' ? 'text-purple-600' :
                    block.block === 'Prep' ? 'text-amber-700' :
                    'text-gray-500'
                  }`}>{block.block}</p>
                </div>
                <p className="text-sm text-gray-600 flex-1">{block.activity}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
