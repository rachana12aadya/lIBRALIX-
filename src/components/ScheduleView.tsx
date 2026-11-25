import React, { useState } from 'react';
import { Calendar, Plus, Sparkles, Trash2 } from 'lucide-react';
import type { EventCategory, ScheduleEvent, TaskItem, UserProfile } from '../types/libralix';
import { findFreeTimeSlots } from '../utils/planner';
import { validateEventInput } from '../utils/validation';
import { suggestScheduleBlocks } from '../services/agentApi';

interface ScheduleViewProps {
  profile: UserProfile | null;
  events: ScheduleEvent[];
  tasks: TaskItem[];
  onCreateEvent: (input: Omit<ScheduleEvent, 'id' | 'uid' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  onDeleteEvent: (eventId: string) => Promise<void>;
}

export function ScheduleView({
  profile,
  events,
  tasks,
  onCreateEvent,
  onDeleteEvent,
}: ScheduleViewProps) {
  const todayDefault = new Date().toISOString().slice(0, 10);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(todayDefault);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [category, setCategory] = useState<EventCategory>('deep_work');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [suggesting, setSuggesting] = useState(false);
  const [suggestedBlocks, setSuggestedBlocks] = useState<
    Array<{
      title: string;
      startTime: string;
      endTime: string;
      category: EventCategory;
      reason: string;
    }>
  >([]);

  const sortedEvents = [...events].sort((a, b) =>
    `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`)
  );
  const openTasks = tasks.filter((t) => t.status !== 'done');
  const freeSlotsForSelectedDate = findFreeTimeSlots(
    events,
    date,
    profile?.workHours || '09:00 - 17:00'
  );

  async function handleAddEvent(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    const check = validateEventInput({ title, date, startTime, endTime, category, notes });
    if (!check.ok) {
      setErrorMsg(check.error);
      return;
    }
    setSubmitting(true);
    try {
      await onCreateEvent(check.data);
      setTitle('');
      setStartTime('');
      setEndTime('');
      setNotes('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to save event.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSuggestSchedule() {
    setErrorMsg(null);
    if (openTasks.length === 0) {
      setErrorMsg('Add at least one open task first so libralix can schedule focus blocks.');
      return;
    }
    if (freeSlotsForSelectedDate.length === 0) {
      setErrorMsg(`No open slots remain on ${date} within your work hours.`);
      return;
    }
    setSuggesting(true);
    try {
      const res = await suggestScheduleBlocks({
        date,
        freeSlots: freeSlotsForSelectedDate,
        pendingTasks: openTasks.map((t) => ({ title: t.title, priority: t.priority })),
        userContext: profile,
      });
      setSuggestedBlocks(res.suggestions);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to generate schedule suggestions.');
    } finally {
      setSuggesting(false);
    }
  }

  async function handleAcceptSuggestion(idx: number) {
    const item = suggestedBlocks[idx];
    if (!item) return;
    try {
      await onCreateEvent({
        title: item.title,
        date,
        startTime: item.startTime,
        endTime: item.endTime,
        category: item.category,
        notes: item.reason,
      });
      setSuggestedBlocks((prev) => prev.filter((_, i) => i !== idx));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not add suggested block.');
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <section className="bg-[#FFF5F9] border border-[#F5C2D7] rounded-xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-[#381325]">Schedule &amp; Focus Blocks</h2>
          <button
            type="button"
            onClick={() => void handleSuggestSchedule()}
            disabled={suggesting}
            className="px-4 py-2 text-xs font-medium text-[#4D1E35] bg-[#FFE0EC] hover:bg-[#FFD1E2] border border-[#EAA3C0] disabled:opacity-60 rounded-lg flex items-center gap-2 whitespace-nowrap cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#B5306B]" aria-hidden="true" />
            <span>{suggesting ? 'Finding best slots...' : 'Suggest Focus Slots'}</span>
          </button>
        </div>

        <form onSubmit={(e) => void handleAddEvent(e)} className="mt-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3">
            <div className="lg:col-span-4">
              <label htmlFor="event-title-input" className="block text-xs font-medium text-[#6D3B54] mb-1">
                Event title
              </label>
              <input
                id="event-title-input"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Meeting or focus block..."
                className="w-full px-3.5 py-2 text-sm bg-[#FFE0EC] border border-[#EAA3C0] rounded-lg text-[#381325] placeholder:text-[#9B637E] focus:outline-none focus:ring-2 focus:ring-[#F49AC1]"
              />
            </div>

            <div className="lg:col-span-2">
              <label htmlFor="event-date-input" className="block text-xs font-medium text-[#6D3B54] mb-1">
                Date
              </label>
              <input
                id="event-date-input"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-[#FFE0EC] border border-[#EAA3C0] rounded-lg text-[#381325] focus:outline-none focus:ring-2 focus:ring-[#F49AC1]"
              />
            </div>

            <div className="lg:col-span-2">
              <label htmlFor="event-start-input" className="block text-xs font-medium text-[#6D3B54] mb-1">
                Start time
              </label>
              <input
                id="event-start-input"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-[#FFE0EC] border border-[#EAA3C0] rounded-lg text-[#381325] focus:outline-none focus:ring-2 focus:ring-[#F49AC1]"
              />
            </div>

            <div className="lg:col-span-2">
              <label htmlFor="event-end-input" className="block text-xs font-medium text-[#6D3B54] mb-1">
                End time
              </label>
              <input
                id="event-end-input"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-[#FFE0EC] border border-[#EAA3C0] rounded-lg text-[#381325] focus:outline-none focus:ring-2 focus:ring-[#F49AC1]"
              />
            </div>

            <div className="lg:col-span-2">
              <label htmlFor="event-category-select" className="block text-xs font-medium text-[#6D3B54] mb-1">
                Type
              </label>
              <select
                id="event-category-select"
                value={category}
                onChange={(e) => setCategory(e.target.value as EventCategory)}
                className="w-full px-3 py-2 text-sm bg-[#FFE0EC] border border-[#EAA3C0] rounded-lg text-[#381325] focus:outline-none focus:ring-2 focus:ring-[#F49AC1]"
              >
                <option value="deep_work">Focus Work</option>
                <option value="meeting">Meeting</option>
                <option value="review">Review</option>
                <option value="personal">Personal</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <div className="flex-1">
              <label htmlFor="event-notes-input" className="block text-xs font-medium text-[#6D3B54] mb-1">
                Notes (optional)
              </label>
              <input
                id="event-notes-input"
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Agenda or link..."
                className="w-full px-3.5 py-2 text-sm bg-[#FFE0EC] border border-[#EAA3C0] rounded-lg text-[#381325] placeholder:text-[#9B637E] focus:outline-none focus:ring-2 focus:ring-[#F49AC1]"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 text-sm font-semibold text-[#2B0B1B] bg-[#F49AC1] hover:bg-[#EC7FB0] disabled:opacity-60 rounded-lg flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>{submitting ? 'Saving...' : 'Add Event'}</span>
            </button>
          </div>
        </form>

        {errorMsg && (
          <p role="alert" className="mt-3 text-xs text-rose-700">
            {errorMsg}
          </p>
        )}

        {suggestedBlocks.length > 0 && (
          <div className="mt-5 pt-5 border-t border-[#F5C2D7] space-y-3">
            <p className="text-xs font-semibold text-[#6D3B54]">
              Suggested Focus Blocks for {date}
            </p>
            <ul className="divide-y divide-[#F5C2D7] border border-[#F5C2D7] rounded-lg">
              {suggestedBlocks.map((block, idx) => (
                <li key={idx} className="p-3.5 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#381325]">{block.title}</p>
                    <p className="text-xs text-[#6D3B54] mt-0.5">
                      <span className="font-mono tabular-nums">
                        {block.startTime} - {block.endTime}
                      </span>
                      <span aria-hidden="true"> · </span>
                      <span>{block.reason}</span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleAcceptSuggestion(idx)}
                    className="px-3 py-1.5 text-xs font-semibold text-[#2B0B1B] bg-[#F49AC1] hover:bg-[#EC7FB0] rounded-md whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Add to Schedule
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="bg-[#FFF5F9] border border-[#F5C2D7] rounded-xl p-6">
        <div className="flex items-center justify-between pb-4 border-b border-[#F5C2D7]">
          <h3 className="text-base font-semibold text-[#381325]">
            Scheduled Events{' '}
            <span className="text-[#9B637E] font-normal tabular-nums">({sortedEvents.length})</span>
          </h3>
          <span className="text-xs text-[#6D3B54] font-mono tabular-nums">
            Open slots on {date}: {freeSlotsForSelectedDate.length}
          </span>
        </div>

        {sortedEvents.length === 0 ? (
          <div className="py-12 text-center">
            <Calendar className="w-7 h-7 text-[#9B637E] mx-auto mb-2" aria-hidden="true" />
            <p className="text-sm font-medium text-[#4D1E35]">Your schedule is clear</p>
            <p className="mt-1 text-xs text-[#9B637E]">
              Add an event above or ask libralix to suggest focus slots for your tasks.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-[#F5C2D7]">
            {sortedEvents.map((ev) => (
              <li key={ev.id} className="py-3.5 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[#381325]">{ev.title}</p>
                  <p className="text-xs text-[#6D3B54] mt-1">
                    <span className="font-mono tabular-nums">
                      {ev.date} · {ev.startTime} - {ev.endTime}
                    </span>
                    <span aria-hidden="true"> · </span>
                    <span className="capitalize">{ev.category.replace('_', ' ')}</span>
                  </p>
                  {ev.notes && <p className="mt-1 text-xs text-[#6D3B54]">{ev.notes}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => void onDeleteEvent(ev.id)}
                  aria-label={`Delete event "${ev.title}"`}
                  className="p-1.5 text-[#9B637E] hover:text-rose-700 rounded-md hover:bg-rose-100 cursor-pointer shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
