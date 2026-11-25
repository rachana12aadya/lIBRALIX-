import React, { useState } from 'react';
import { BookmarkPlus, Compass, ExternalLink, ListPlus, Search, Trash2 } from 'lucide-react';
import type { ResearchBrief, TaskPriority, UserProfile } from '../types/libralix';
import { runAutonomousResearch } from '../services/agentApi';
import { parseSourceEntry } from '../utils/researchParser';

interface ResearchViewProps {
  profile: UserProfile | null;
  briefs: ResearchBrief[];
  onSaveBrief: (brief: {
    query: string;
    summary: string;
    keyFindings: string[];
    sources: string[];
  }) => Promise<void>;
  onDeleteBrief: (briefId: string) => Promise<void>;
  onSaveToNotes: (input: { title: string; content: string; topic: string }) => Promise<void>;
  onCreateTaskFromBrief: (input: {
    title: string;
    notes: string;
    priority: TaskPriority;
    dueDate: string;
    source: 'research';
  }) => Promise<void>;
}

export function ResearchView({
  profile,
  briefs,
  onSaveBrief,
  onDeleteBrief,
  onSaveToNotes,
  onCreateTaskFromBrief,
}: ResearchViewProps) {
  const [queryInput, setQueryInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  async function handleRunResearch(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = queryInput.trim();
    if (!trimmed) {
      setErrorMsg('Please enter a topic or question to research.');
      return;
    }
    setErrorMsg(null);
    setFeedbackMsg(null);
    setLoading(true);
    try {
      const result = await runAutonomousResearch({
        query: trimmed,
        userContext: profile,
      });
      await onSaveBrief(result);
      setQueryInput('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Research request failed.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveNote(brief: ResearchBrief) {
    setFeedbackMsg(null);
    try {
      const content = `${brief.summary}\n\nKey Findings:\n${brief.keyFindings.map((f) => `- ${f}`).join('\n')}`;
      await onSaveToNotes({
        title: brief.query,
        content,
        topic: 'Research',
      });
      setFeedbackMsg(`Saved "${brief.query}" to Notes.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not save to Notes.');
    }
  }

  async function handleCreateTask(brief: ResearchBrief) {
    setFeedbackMsg(null);
    try {
      await onCreateTaskFromBrief({
        title: `Follow up: ${brief.query}`,
        notes: brief.keyFindings[0] || brief.summary.slice(0, 200),
        priority: 'medium',
        dueDate: '',
        source: 'research',
      });
      setFeedbackMsg(`Added follow-up task for "${brief.query}".`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not create task.');
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <section className="bg-[#FFF5F9] border border-[#F5C2D7] rounded-xl p-6">
        <h2 className="text-lg font-semibold text-[#381325]">Autonomous Web Research</h2>
        <p className="mt-1 text-sm text-[#6D3B54]">
          Ask a question. libralix searches the web, filters noise, and saves a cited brief to your workspace.
        </p>

        <form onSubmit={(e) => void handleRunResearch(e)} className="mt-4">
          <label htmlFor="research-query-input" className="block text-xs font-medium text-[#6D3B54] mb-1.5">
            Research question or topic
          </label>
          <div className="flex flex-col sm:flex-row gap-2.5">
            <input
              id="research-query-input"
              type="text"
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              placeholder="Enter any topic to investigate..."
              className="flex-1 px-4 py-2.5 text-sm bg-[#FFE0EC] border border-[#EAA3C0] rounded-lg text-[#381325] placeholder:text-[#9B637E] focus:outline-none focus:ring-2 focus:ring-[#F49AC1]"
            />
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 text-sm font-semibold text-[#2B0B1B] bg-[#F49AC1] hover:bg-[#EC7FB0] disabled:opacity-60 rounded-lg flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Search className="w-4 h-4" aria-hidden="true" />
              <span>{loading ? 'Researching...' : 'Run Research'}</span>
            </button>
          </div>
        </form>

        {errorMsg && (
          <p role="alert" className="mt-3 text-xs text-rose-700">
            {errorMsg}
          </p>
        )}
        {feedbackMsg && (
          <p role="status" className="mt-3 text-xs text-emerald-700">
            {feedbackMsg}
          </p>
        )}
      </section>

      {briefs.length === 0 ? (
        <section className="bg-[#FFF5F9] border border-[#F5C2D7] rounded-xl p-10 text-center">
          <Compass className="w-7 h-7 text-[#9B637E] mx-auto mb-2" aria-hidden="true" />
          <p className="text-sm font-medium text-[#4D1E35]">No research briefs saved yet</p>
          <p className="mt-1 text-xs text-[#9B637E]">
            Enter a question above to generate your first cited research brief.
          </p>
        </section>
      ) : (
        <div className="space-y-4">
          {briefs.map((brief) => (
            <article key={brief.id} className="bg-[#FFF5F9] border border-[#F5C2D7] rounded-xl p-6">
              <div className="flex items-start justify-between gap-4">
                <h3 className="text-base font-semibold text-[#381325]">{brief.query}</h3>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => void handleSaveNote(brief)}
                    className="px-2.5 py-1.5 text-xs font-medium text-[#4D1E35] bg-[#FFE0EC] hover:bg-[#FFD1E2] border border-[#EAA3C0] rounded-md flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                  >
                    <BookmarkPlus className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Save to Notes</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCreateTask(brief)}
                    className="px-2.5 py-1.5 text-xs font-medium text-[#4D1E35] bg-[#FFE0EC] hover:bg-[#FFD1E2] border border-[#EAA3C0] rounded-md flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                  >
                    <ListPlus className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Create Task</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void onDeleteBrief(brief.id)}
                    aria-label={`Delete research brief "${brief.query}"`}
                    className="p-1.5 text-[#9B637E] hover:text-rose-700 rounded-md hover:bg-rose-100 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <p className="mt-3 text-sm text-[#4D1E35] leading-relaxed whitespace-pre-line">
                {brief.summary}
              </p>

              {brief.keyFindings.length > 0 && (
                <div className="mt-5 pt-4 border-t border-[#F5C2D7]">
                  <h4 className="text-xs font-semibold text-[#6D3B54]">Key Findings</h4>
                  <ul className="mt-2 space-y-1.5 list-disc list-inside text-sm text-[#4D1E35]">
                    {brief.keyFindings.map((finding, idx) => (
                      <li key={idx}>{finding}</li>
                    ))}
                  </ul>
                </div>
              )}

              {brief.sources.length > 0 && (
                <div className="mt-5 pt-4 border-t border-[#F5C2D7]">
                  <h4 className="text-xs font-semibold text-[#6D3B54]">Cited Sources</h4>
                  <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-xs">
                    {brief.sources.map((src, idx) => {
                      const parsed = parseSourceEntry(src);
                      return (
                        <li key={idx}>
                          {parsed.url ? (
                            <a
                              href={parsed.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[#B5306B] hover:text-[#2B0B1B] underline decoration-[#DF84A8]"
                            >
                              <span>{parsed.title}</span>
                              <ExternalLink className="w-3 h-3" aria-hidden="true" />
                            </a>
                          ) : (
                            <span className="text-[#6D3B54]">{parsed.title}</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
