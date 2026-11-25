import React, { useState } from 'react';
import { CheckCircle2, Circle, Clock, Plus, Sparkles, Trash2 } from 'lucide-react';
import type { TaskItem, TaskPriority, TaskStatus, UserProfile } from '../types/libralix';
import { sortTasksByPriorityAndDue } from '../utils/planner';
import { validateTaskInput } from '../utils/validation';
import { planTasksFromGoal } from '../services/agentApi';

interface TasksViewProps {
  isAuthenticated: boolean;
  uid: string;
  profile: UserProfile | null;
  tasks: TaskItem[];
  onRequireSignIn: (draftTask?: string) => void;
  onCreateTask: (input: {
    title: string;
    notes: string;
    priority: TaskPriority;
    dueDate: string;
    source: TaskItem['source'];
  }) => Promise<void>;
  onUpdateStatus: (taskId: string, status: TaskStatus) => Promise<void>;
  onUpdatePriority: (taskId: string, priority: TaskPriority) => Promise<void>;
  onDeleteTask: (taskId: string) => Promise<void>;
}

export function TasksView({
  isAuthenticated,
  profile,
  tasks,
  onRequireSignIn,
  onCreateTask,
  onUpdateStatus,
  onUpdatePriority,
  onDeleteTask,
}: TasksViewProps) {
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [dueDate, setDueDate] = useState('');
  const [filter, setFilter] = useState<'all' | TaskStatus>('all');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [goalInput, setGoalInput] = useState('');
  const [planningGoal, setPlanningGoal] = useState(false);

  const sortedTasks = sortTasksByPriorityAndDue(tasks);
  const filteredTasks =
    filter === 'all' ? sortedTasks : sortedTasks.filter((t) => t.status === filter);

  function handleTitleChange(val: string) {
    if (!isAuthenticated && val.trim().length > 0) {
      onRequireSignIn(val);
      return;
    }
    setTitle(val);
  }

  async function handleAddTask(e: React.FormEvent) {
    e.preventDefault();
    if (!isAuthenticated) {
      onRequireSignIn(title);
      return;
    }
    setErrorMsg(null);
    const check = validateTaskInput({ title, notes, priority, dueDate, source: 'manual' });
    if (!check.ok) {
      setErrorMsg(check.error);
      return;
    }
    setSubmitting(true);
    try {
      await onCreateTask({
        title: check.data.title,
        notes: check.data.notes,
        priority: check.data.priority,
        dueDate: check.data.dueDate,
        source: 'manual',
      });
      setTitle('');
      setNotes('');
      setPriority('medium');
      setDueDate('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to save task.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleBreakDownGoal(e: React.FormEvent) {
    e.preventDefault();
    if (!isAuthenticated) {
      onRequireSignIn(goalInput);
      return;
    }
    if (!goalInput.trim()) {
      setErrorMsg('Enter a goal for libralix to break down into tasks.');
      return;
    }
    setErrorMsg(null);
    setPlanningGoal(true);
    try {
      const result = await planTasksFromGoal({
        goal: goalInput.trim(),
        existingTasks: tasks.filter((t) => t.status !== 'done').map((t) => t.title),
        userContext: profile,
      });
      for (const generated of result.tasks) {
        await onCreateTask({
          title: generated.title,
          notes: generated.notes,
          priority: generated.priority,
          dueDate: '',
          source: 'agent',
        });
      }
      setGoalInput('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to break down goal.');
    } finally {
      setPlanningGoal(false);
    }
  }

  function cycleStatus(current: TaskStatus): TaskStatus {
    if (current === 'todo') return 'in_progress';
    if (current === 'in_progress') return 'done';
    return 'todo';
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <section className="bg-[#FFF5F9] border border-[#F5C2D7] rounded-xl p-6">
        <h2 className="text-lg font-semibold text-[#381325]">Add a Task</h2>
        <form onSubmit={(e) => void handleAddTask(e)} className="mt-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            <div className="md:col-span-6">
              <label htmlFor="task-title-input" className="block text-xs font-medium text-[#6D3B54] mb-1">
                Task title
              </label>
              <input
                id="task-title-input"
                type="text"
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="What needs to get done?"
                className="w-full px-3.5 py-2 text-sm bg-[#FFE0EC] border border-[#EAA3C0] rounded-lg text-[#381325] placeholder:text-[#9B637E] focus:outline-none focus:ring-2 focus:ring-[#F49AC1]"
              />
            </div>

            <div className="md:col-span-3">
              <label htmlFor="task-priority-select" className="block text-xs font-medium text-[#6D3B54] mb-1">
                Priority
              </label>
              <select
                id="task-priority-select"
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="w-full px-3 py-2 text-sm bg-[#FFE0EC] border border-[#EAA3C0] rounded-lg text-[#381325] focus:outline-none focus:ring-2 focus:ring-[#F49AC1]"
              >
                <option value="high">High priority</option>
                <option value="medium">Medium priority</option>
                <option value="low">Low priority</option>
              </select>
            </div>

            <div className="md:col-span-3">
              <label htmlFor="task-due-input" className="block text-xs font-medium text-[#6D3B54] mb-1">
                Due date (optional)
              </label>
              <input
                id="task-due-input"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-[#FFE0EC] border border-[#EAA3C0] rounded-lg text-[#381325] focus:outline-none focus:ring-2 focus:ring-[#F49AC1]"
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-end">
            <div className="flex-1">
              <label htmlFor="task-notes-input" className="block text-xs font-medium text-[#6D3B54] mb-1">
                Notes (optional)
              </label>
              <input
                id="task-notes-input"
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Extra details or context..."
                className="w-full px-3.5 py-2 text-sm bg-[#FFE0EC] border border-[#EAA3C0] rounded-lg text-[#381325] placeholder:text-[#9B637E] focus:outline-none focus:ring-2 focus:ring-[#F49AC1]"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 text-sm font-semibold text-[#2B0B1B] bg-[#F49AC1] hover:bg-[#EC7FB0] disabled:opacity-60 rounded-lg flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>{submitting ? 'Adding...' : 'Add Task'}</span>
            </button>
          </div>
        </form>

        <div className="mt-6 pt-5 border-t border-[#F5C2D7]">
          <form onSubmit={(e) => void handleBreakDownGoal(e)} className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <div className="flex-1">
              <label htmlFor="goal-breakdown-input" className="block text-xs font-medium text-[#6D3B54] mb-1">
                Or let libralix break down a larger goal into tasks
              </label>
              <input
                id="goal-breakdown-input"
                type="text"
                value={goalInput}
                onChange={(e) => setGoalInput(e.target.value)}
                placeholder="Describe a project or goal..."
                className="w-full px-3.5 py-2 text-sm bg-[#FFE0EC] border border-[#EAA3C0] rounded-lg text-[#381325] placeholder:text-[#9B637E] focus:outline-none focus:ring-2 focus:ring-[#F49AC1]"
              />
            </div>
            <button
              type="submit"
              disabled={planningGoal}
              className="px-4 py-2 text-sm font-medium text-[#4D1E35] bg-[#FFE0EC] hover:bg-[#FFD1E2] border border-[#EAA3C0] disabled:opacity-60 rounded-lg flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-[#B5306B]" aria-hidden="true" />
              <span>{planningGoal ? 'Planning...' : 'Create Action Plan'}</span>
            </button>
          </form>
        </div>

        {errorMsg && (
          <p role="alert" className="mt-3 text-xs text-rose-700">
            {errorMsg}
          </p>
        )}
      </section>

      <section className="bg-[#FFF5F9] border border-[#F5C2D7] rounded-xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#F5C2D7]">
          <h3 className="text-base font-semibold text-[#381325]">
            Task List <span className="text-[#9B637E] font-normal tabular-nums">({filteredTasks.length})</span>
          </h3>
          <div className="flex items-center gap-1 p-1 bg-[#FFE0EC] border border-[#F5C2D7] rounded-lg">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'todo', label: 'To Do' },
                { id: 'in_progress', label: 'In Progress' },
                { id: 'done', label: 'Done' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  filter === tab.id
                    ? 'bg-[#F49AC1] text-[#2B0B1B]'
                    : 'text-[#6D3B54] hover:text-[#381325]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {filteredTasks.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm font-medium text-[#4D1E35]">No tasks in this view</p>
            <p className="mt-1 text-xs text-[#9B637E]">
              Use the clean task bar above to add a task or break down a goal.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-[#F5C2D7]">
            {filteredTasks.map((task) => (
              <li key={task.id} className="py-3.5 flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0">
                  <button
                    type="button"
                    onClick={() => void onUpdateStatus(task.id, cycleStatus(task.status))}
                    aria-label={`Change status for "${task.title}" (currently ${task.status.replace('_', ' ')})`}
                    className="mt-0.5 text-[#6D3B54] hover:text-[#381325] transition-colors cursor-pointer shrink-0"
                  >
                    {task.status === 'done' ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-700" />
                    ) : task.status === 'in_progress' ? (
                      <Clock className="w-5 h-5 text-[#B5306B]" />
                    ) : (
                      <Circle className="w-5 h-5" />
                    )}
                  </button>

                  <div className="min-w-0">
                    <p
                      className={`text-sm font-medium ${
                        task.status === 'done' ? 'line-through text-[#9B637E]' : 'text-[#381325]'
                      }`}
                    >
                      {task.title}
                    </p>
                    {task.notes && (
                      <p className="mt-1 text-xs text-[#6D3B54] leading-relaxed">{task.notes}</p>
                    )}
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-[#9B637E]">
                      <span
                        className={
                          task.priority === 'high'
                            ? 'text-rose-700 font-medium'
                            : task.priority === 'medium'
                              ? 'text-amber-700 font-medium'
                              : 'text-[#6D3B54]'
                        }
                      >
                        {task.priority === 'high'
                          ? 'High priority'
                          : task.priority === 'medium'
                            ? 'Medium priority'
                            : 'Low priority'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {task.status === 'done'
                          ? 'Done'
                          : task.status === 'in_progress'
                            ? 'In progress'
                            : 'To do'}
                      </span>
                      {task.dueDate && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">Due {task.dueDate}</span>
                        </>
                      )}
                      {task.source !== 'manual' && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>Added from {task.source}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <select
                    aria-label={`Priority for "${task.title}"`}
                    value={task.priority}
                    onChange={(e) => void onUpdatePriority(task.id, e.target.value as TaskPriority)}
                    className="px-2 py-1 text-xs bg-[#FFE0EC] border border-[#EAA3C0] rounded-md text-[#4D1E35]"
                  >
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => void onDeleteTask(task.id)}
                    aria-label={`Delete task "${task.title}"`}
                    className="p-1.5 text-[#9B637E] hover:text-rose-700 rounded-md hover:bg-rose-100 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
