import { useState } from 'react';
import { BookOpen, ChevronDown, ChevronRight, Clock, CheckCircle, Headphones, Presentation, FileText, ExternalLink } from 'lucide-react';
import { lessons, type LessonSection, type LessonMedia } from '../content/lessons';

function toEmbedUrl(url: string): string {
  // Convert Google Slides edit URL to embed URL
  const match = url.match(/\/presentation\/d\/([^/]+)/);
  if (match) {
    return `https://docs.google.com/presentation/d/${match[1]}/embed?start=false&loop=false&delayms=60000`;
  }
  return url;
}

function MediaBar({ media, activeTab, onTabChange }: { media: LessonMedia[]; activeTab: 'slides' | 'read'; onTabChange: (tab: 'slides' | 'read') => void }) {
  const slidesMedia = media.find(m => m.type === 'slides');
  const audioMedia = media.filter(m => m.type === 'audio');

  return (
    <div className="pt-4 pb-2 space-y-3">
      {/* Tab switcher */}
      {slidesMedia && (
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => onTabChange('slides')}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-all ${
              activeTab === 'slides'
                ? 'bg-white text-navy shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Presentation className="w-3.5 h-3.5" />
            Slides
          </button>
          <button
            onClick={() => onTabChange('read')}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-all ${
              activeTab === 'read'
                ? 'bg-white text-navy shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            Read
          </button>
        </div>
      )}

      {/* Embedded slides */}
      {slidesMedia && activeTab === 'slides' && (
        <div className="w-full">
          <div className="aspect-[16/10] rounded-lg overflow-hidden bg-gray-900 border border-gray-200 shadow-inner">
            <iframe
              src={toEmbedUrl(slidesMedia.url)}
              className="w-full h-full"
              allowFullScreen
              loading="lazy"
            />
          </div>
          <div className="flex justify-end mt-1.5">
            <a
              href={slidesMedia.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[10px] text-gray-400 hover:text-navy transition-colors"
            >
              Open in Google Slides
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      )}

      {/* Audio players */}
      {audioMedia.map((m, i) => (
        <div key={`audio-${i}`} className="w-full">
          <p className="text-[10px] font-bold text-navy uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Headphones className="w-3.5 h-3.5" />
            {m.label}
          </p>
          <audio controls className="w-full h-10 rounded-lg" preload="none">
            <source src={m.url} />
          </audio>
        </div>
      ))}
    </div>
  );
}

function LessonContent({ section }: { section: LessonSection }) {
  const html = section.content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n\n/g, '</p><p class="mt-3">')
    .replace(/\n• /g, '</p><p class="mt-1 pl-4">• ')
    .replace(/\n(\d+)\. /g, '</p><p class="mt-1 pl-4">$1. ')
    .replace(/\n↓/g, '</p><p class="mt-2 text-center text-navy font-bold">↓')
    .replace(/\n---/g, '</p><hr class="my-3 border-gray-200"/><p>')
    .replace(/\n/g, '<br/>');

  return (
    <div>
      <h3 className="text-base font-semibold text-navy mb-3">{section.heading}</h3>
      <div
        className="text-sm text-gray-600 leading-relaxed [&_strong]:text-gray-800 [&_strong]:font-semibold"
        dangerouslySetInnerHTML={{ __html: `<p>${html}</p>` }}
      />
    </div>
  );
}

export default function LearnView() {
  const [openLesson, setOpenLesson] = useState<string | null>(null);
  const [activeTabs, setActiveTabs] = useState<Record<string, 'slides' | 'read'>>({});
  const [completed, setCompleted] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('sdr_lessons_completed');
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });

  function toggleLesson(id: string) {
    setOpenLesson(openLesson === id ? null : id);
  }

  function markComplete(id: string) {
    const next = new Set(completed);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setCompleted(next);
    localStorage.setItem('sdr_lessons_completed', JSON.stringify([...next]));
  }

  const doneCount = lessons.filter(l => completed.has(l.id)).length;

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <BookOpen className="w-6 h-6 text-navy" />
          <h1 className="text-xl font-bold text-navy">Learn</h1>
        </div>
        <p className="text-sm text-gray-500">
          Industry education — everything you need to know before picking up the phone. Read these in order.
        </p>
        <div className="flex items-center gap-3 mt-3">
          <div className="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden">
            <div
              className="bg-emerald-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${(doneCount / lessons.length) * 100}%` }}
            />
          </div>
          <span className="text-xs font-medium text-gray-500">{doneCount}/{lessons.length} complete</span>
        </div>
      </div>

      {/* Full Course Podcast */}
      <div className="mb-4 bg-white rounded-xl border border-navy/10 p-4">
        <p className="text-[10px] font-bold text-navy uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Headphones className="w-3.5 h-3.5" />
          Full Course Podcast — All 7 Lessons
        </p>
        <audio controls className="w-full h-10 rounded-lg" preload="none">
          <source src="/audio/00-full-course.mp3" type="audio/mpeg" />
        </audio>
      </div>

      <div className="space-y-3">
        {lessons.map((lesson, idx) => {
          const isOpen = openLesson === lesson.id;
          const isDone = completed.has(lesson.id);

          return (
            <div key={lesson.id} className={`bg-white rounded-xl border transition-all ${
              isDone ? 'border-emerald-200' : isOpen ? 'border-navy/20 shadow-md' : 'border-gray-200'
            }`}>
              <button
                onClick={() => toggleLesson(lesson.id)}
                className="w-full flex items-center gap-3 p-4 text-left"
              >
                <span className={`text-xs font-bold w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                  isDone ? 'bg-emerald-500 text-white' : 'bg-navy/10 text-navy'
                }`}>
                  {isDone ? '✓' : idx + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${isDone ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                    {lesson.title}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] font-medium text-gray-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {lesson.estimatedMinutes} min
                    </span>
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-navy/5 text-navy/60">
                      {lesson.category}
                    </span>
                  </div>
                </div>
                {isOpen
                  ? <ChevronDown className="w-5 h-5 text-gray-400 shrink-0" />
                  : <ChevronRight className="w-5 h-5 text-gray-400 shrink-0" />
                }
              </button>

              {isOpen && (() => {
                const hasSlides = lesson.media?.some(m => m.type === 'slides');
                const tab = activeTabs[lesson.id] ?? (hasSlides ? 'slides' : 'read');
                return (
                <div className="px-4 pb-4 border-t border-gray-100">
                  {lesson.media && lesson.media.length > 0 && (
                    <MediaBar
                      media={lesson.media}
                      activeTab={tab}
                      onTabChange={(t) => setActiveTabs(prev => ({ ...prev, [lesson.id]: t }))}
                    />
                  )}
                  {tab === 'read' && (
                  <div className="pt-4 space-y-6">
                    {lesson.sections.map((section, si) => (
                      <LessonContent key={si} section={section} />
                    ))}
                  </div>
                  )}
                  <div className="mt-6 pt-4 border-t border-gray-100 flex justify-center">
                    <button
                      onClick={() => markComplete(lesson.id)}
                      className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium transition-all ${
                        isDone
                          ? 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          : 'bg-emerald-500 text-white hover:bg-emerald-600'
                      }`}
                    >
                      <CheckCircle className="w-4 h-4" />
                      {isDone ? 'Mark as Unread' : 'Mark as Complete'}
                    </button>
                  </div>
                </div>
                );
              })()}
            </div>
          );
        })}
      </div>
    </div>
  );
}
