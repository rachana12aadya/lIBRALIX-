import React, { useState } from 'react';
import { ArrowRight, Calendar, CheckSquare, Compass, Plus, Scale } from 'lucide-react';
import type {
  DecisionAnalysis,
  InboxTriageItem,
  NoteItem,
  ResearchBrief,
  ScheduleEvent,
  TaskItem,
  ToolIntegration,
  UserProfile,
  WorkspaceTab,
} from '../types/libralix';
import { buildProactiveInsights, sortTasksByPriorityAndDue } from '../utils/planner';
import { validateTaskInput } from '../utils/validation';

interface OverviewViewProps {
  isAuthenticated: boolean;
  userName: string;
  profile: UserProfile | null;
  tasks: TaskItem[];
  researchBriefs: ResearchBrief[];
  events: ScheduleEvent[];
  notes: NoteItem[];
  decisions: DecisionAnalysis[];
  triageItems: InboxTriageItem[];
  integrations: ToolIntegration[];
  onRequireSignIn: (draftTask?: string) => void;
  onAddQuickTask: (title: string) => Promise<void>;
  onNavigateTab: (tab: WorkspaceTab) => void;
  initialTaskDraft?: string;
}

export function OverviewView({
  isAuthenticated,
  userName,
  profile,
  tasks,
  researchBriefs,
  events,
  notes,
  decisions,
  triageItems,
  integrations,
  onRequireSignIn,
  onAddQuickTask,
  onNavigateTab,
  initialTaskDraft,
}: OverviewViewProps) {
  const [quickTask, setQuickTask] = useState(initialTaskDraft ?? '');
  const [savingTask, setSavingTask] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const todayDate = new Date().toISOString().slice(0, 10);
  const openTasks = sortTasksByPriorityAndDue(tasks.filter((t) => t.status !== 'done'));
  const todayEvents = events.filter((e) => e.date === todayDate);
  const suggestions = buildProactiveInsights({
    tasks,
    events,
    triageItems,
    decisions,
    todayDate,
  });

  function handleQuickTaskChange(value: string) {
    if (!isAuthenticated && value.trim().length > 0) {
      onRequireSignIn(value);
      return;
    }
    setQuickTask(value);
  }

  async function handleQuickTaskSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isAuthenticated) {
      onRequireSignIn(quickTask);
      return;
    }
    setErrorMsg(null);
    const check = validateTaskInput({ title: quickTask, priority: 'medium', source: 'manual' });
    if (!check.ok) {
      setErrorMsg(check.error);
      return;
    }
    setSavingTask(true);
    try {
      await onAddQuickTask(check.data.title);
      setQuickTask('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not save task.');
    } finally {
      setSavingTask(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <section className="bg-[#FFF5F9] border border-[#F5C2D7] rounded-xl p-6 sm:p-8">
        <h2 className="text-2xl font-bold text-[#381325]">
          {userName ? `Welcome, ${userName.split(' ')[0]}` : 'Welcome to libralix'}
        </h2>
        <p className="mt-1.5 text-sm text-[#6D3B54]">
          {profile?.role
            ? `${profile.role} · Work hours ${profile.workHours || 'Not set'}`
            : 'Add a task below or choose a workspace tool from the sidebar.'}
        </p>

        <form onSubmit={(e) => void handleQuickTaskSubmit(e)} className="mt-6">
          <label htmlFor="overview-quick-task" className="block text-xs font-medium text-[#6D3B54] mb-2">
            Quick Task Bar
          </label>
          <div className="flex flex-col sm:flex-row gap-2.5">
            <input
              id="overview-quick-task"
              type="text"
              value={quickTask}
              onChange={(e) => handleQuickTaskChange(e.target.value)}
              placeholder="Enter a new task..."
              className="flex-1 px-4 py-2.5 text-sm bg-[#FFE0EC] border border-[#EAA3C0] rounded-lg text-[#381325] placeholder:text-[#9B637E] focus:outline-none focus:ring-2 focus:ring-[#F49AC1] focus:border-transparent"
            />
            <button
              type="submit"
              disabled={savingTask}
              className="px-5 py-2.5 text-sm font-semibold text-[#2B0B1B] bg-[#F49AC1] hover:bg-[#EC7FB0] disabled:opacity-60 rounded-lg flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>{savingTask ? 'Saving...' : 'Add Task'}</span>
            </button>
          </div>
          {errorMsg && (
            <p role="alert" className="mt-2 text-xs text-rose-700">
              {errorMsg}
            </p>
          )}
        </form>
      </section>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4" aria-label="Workspace summary">
        <div className="bg-[#FFF5F9] border border-[#F5C2D7] rounded-xl p-5">
          <p className="text-xs font-medium text-[#6D3B54]">Open Tasks</p>
          <p className="mt-2 text-2xl font-bold text-[#381325] tabular-nums">{openTasks.length}</p>
        </div>
        <div className="bg-[#FFF5F9] border border-[#F5C2D7] rounded-xl p-5">
          <p className="text-xs font-medium text-[#6D3B54]">Research Briefs</p>
          <p className="mt-2 text-2xl font-bold text-[#381325] tabular-nums">
            {researchBriefs.length}
          </p>
        </div>
        <div className="bg-[#FFF5F9] border border-[#F5C2D7] rounded-xl p-5">
          <p className="text-xs font-medium text-[#6D3B54]">Events Today</p>
          <p className="mt-2 text-2xl font-bold text-[#381325] tabular-nums">
            {todayEvents.length}
          </p>
        </div>
        <div className="bg-[#FFF5F9] border border-[#F5C2D7] rounded-xl p-5">
          <p className="text-xs font-medium text-[#6D3B54]">Saved Notes &amp; Tools</p>
          <p className="mt-2 text-2xl font-bold text-[#381325] tabular-nums">
            {notes.length + integrations.length}
          </p>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-[#FFF5F9] border border-[#F5C2D7] rounded-xl p-6">
          <div className="flex items-center justify-between gap-4">
            <h3 className="text-base font-semibold text-[#381325]">Suggested Next Steps</h3>
            <button
              type="button"
              onClick={() => onNavigateTab('decisions')}
              className="text-xs font-medium text-[#B5306B] hover:text-[#381325] whitespace-nowrap shrink-0 cursor-pointer"
            >
              Weigh a Decision
            </button>
          </div>

          {suggestions.length === 0 ? (
            <div className="mt-5 py-8 text-center border border-dashed border-[#EAA3C0] rounded-lg px-4">
              <p className="text-sm font-medium text-[#4D1E35]">No active suggestions yet</p>
              <p className="mt-1 text-xs text-[#9B637E]">
                As you add tasks, schedule items, or messages to triage, libralix will surface helpful next actions here.
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => onNavigateTab('research')}
                  className="px-3 py-1.5 text-xs font-medium text-[#4D1E35] bg-[#FFE0EC] hover:bg-[#FFD1E2] border border-[#EAA3C0] rounded-lg flex items-center gap-1.5 cursor-pointer"
                >
                  <Compass className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Start Research</span>
                </button>
                <button
                  type="button"
                  onClick={() => onNavigateTab('schedule')}
                  className="px-3 py-1.5 text-xs font-medium text-[#4D1E35] bg-[#FFE0EC] hover:bg-[#FFD1E2] border border-[#EAA3C0] rounded-lg flex items-center gap-1.5 cursor-pointer"
                >
                  <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Plan Schedule</span>
                </button>
              </div>
            </div>
          ) : (
            <ul className="mt-4 divide-y divide-[#F5C2D7]">
              {suggestions.map((s) => (
                <li key={s.id} className="py-3.5 first:pt-0 last:pb-0">
                  <p className="text-sm font-medium text-[#381325]">{s.title}</p>
                  <p className="mt-1 text-xs text-[#6D3B54] leading-relaxed">{s.description}</p>
                  <button
                    type="button"
                    onClick={() => onNavigateTab(s.targetTab)}
                    className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[#B5306B] hover:text-[#2B0B1B] cursor-pointer"
                  >
                    <span>{s.actionLabel}</span>
                    <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="bg-[#FFF5F9] border border-[#F5C2D7] rounded-xl p-6">
          <div className="flex items-center justify-between gap-4">
            <h3 className="text-base font-semibold text-[#381325]">Top Open Tasks</h3>
            <button
              type="button"
              onClick={() => onNavigateTab('tasks')}
              className="text-xs font-medium text-[#B5306B] hover:text-[#381325] whitespace-nowrap shrink-0 cursor-pointer"
            >
              View All
            </button>
          </div>

          {openTasks.length === 0 ? (
            <div className="mt-5 py-8 text-center border border-dashed border-[#EAA3C0] rounded-lg px-4">
              <CheckSquare className="w-6 h-6 text-[#9B637E] mx-auto mb-2" aria-hidden="true" />
              <p className="text-sm font-medium text-[#4D1E35]">Your task list is clean</p>
              <p className="mt-1 text-xs text-[#9B637E]">
                Use the Quick Task Bar above or open Tasks to add your first item.
              </p>
            </div>
          ) : (
            <ul className="mt-4 divide-y divide-[#F5C2D7]">
              {openTasks.slice(0, 5).map((task) => (
                <li key={task.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#381325] truncate">{task.title}</p>
                    <p className="text-xs text-[#6D3B54] mt-0.5">
                      <span className="capitalize">{task.priority} priority</span>
                      {task.dueDate ? (
                        <>
                          <span aria-hidden="true"> · </span>
                          <span className="font-mono tabular-nums">Due {task.dueDate}</span>
                        </>
                      ) : null}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {openTasks.length > 0 && (
            <div className="mt-4 pt-4 border-t border-[#F5C2D7] flex items-center justify-between text-xs text-[#6D3B54]">
              <span>Want help weighing priorities?</span>
              <button
                type="button"
                onClick={() => onNavigateTab('decisions')}
                className="inline-flex items-center gap-1 font-medium text-[#B5306B] hover:text-[#2B0B1B] cursor-pointer"
              >
                <Scale className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Decision Helper</span>
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
