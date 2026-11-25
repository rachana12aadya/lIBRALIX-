import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildProactiveInsights,
  filterNotesByQuery,
  findFreeTimeSlots,
  shouldRedirectToSignInOnTaskInput,
  sortByCreatedAtDesc,
  sortTasksByPriorityAndDue,
} from './planner';
import type { NoteItem, ScheduleEvent, TaskItem } from '../types/libralix';

test('sortByCreatedAtDesc orders newest items first across Timestamp-like objects', () => {
  const items = [
    { id: 'old', createdAt: { toMillis: () => 1000 } },
    { id: 'newest', createdAt: { toMillis: () => 3000 } },
    { id: 'mid', createdAt: { seconds: 2 } },
  ];
  assert.deepEqual(
    sortByCreatedAtDesc(items).map((i) => i.id),
    ['newest', 'mid', 'old']
  );
});

test('sortTasksByPriorityAndDue orders active high-priority tasks first', () => {
  const tasks: TaskItem[] = [
    {
      id: 't1',
      uid: 'u1',
      title: 'Low done',
      notes: '',
      priority: 'high',
      status: 'done',
      dueDate: '2026-11-21',
      source: 'manual',
    },
    {
      id: 't2',
      uid: 'u1',
      title: 'Medium todo',
      notes: '',
      priority: 'medium',
      status: 'todo',
      dueDate: '',
      source: 'manual',
    },
    {
      id: 't3',
      uid: 'u1',
      title: 'High todo',
      notes: '',
      priority: 'high',
      status: 'todo',
      dueDate: '2026-11-22',
      source: 'manual',
    },
  ];
  const sorted = sortTasksByPriorityAndDue(tasks);
  assert.deepEqual(
    sorted.map((t) => t.id),
    ['t3', 't2', 't1']
  );
});

test('findFreeTimeSlots identifies gaps between scheduled events', () => {
  const events: ScheduleEvent[] = [
    {
      id: 'e1',
      uid: 'u1',
      title: 'Standup',
      date: '2026-11-21',
      startTime: '09:30',
      endTime: '10:00',
      category: 'meeting',
      notes: '',
    },
    {
      id: 'e2',
      uid: 'u1',
      title: 'Review',
      date: '2026-11-21',
      startTime: '13:00',
      endTime: '14:30',
      category: 'review',
      notes: '',
    },
  ];

  const slots = findFreeTimeSlots(events, '2026-11-21', '09:00 - 17:00', 30);
  assert.deepEqual(slots, [
    { startTime: '09:00', endTime: '09:30', durationMinutes: 30 },
    { startTime: '10:00', endTime: '13:00', durationMinutes: 180 },
    { startTime: '14:30', endTime: '17:00', durationMinutes: 150 },
  ]);
});

test('buildProactiveInsights returns empty array when workspace has no data', () => {
  const insights = buildProactiveInsights({
    tasks: [],
    events: [],
    triageItems: [],
    decisions: [],
    todayDate: '2026-11-21',
  });
  assert.equal(insights.length, 0);
});

test('filterNotesByQuery matches title, topic, or content case-insensitively', () => {
  const notes: NoteItem[] = [
    { id: 'n1', uid: 'u1', title: 'Q4 Strategy', topic: 'Planning', content: 'Focus on enterprise.' },
    { id: 'n2', uid: 'u1', title: 'Reading List', topic: 'Personal', content: 'Design systems book.' },
  ];
  assert.equal(filterNotesByQuery(notes, 'enterprise').length, 1);
  assert.equal(filterNotesByQuery(notes, 'PERSONAL').length, 1);
  assert.equal(filterNotesByQuery(notes, '').length, 2);
});

test('shouldRedirectToSignInOnTaskInput triggers when unauthenticated user types a task', () => {
  assert.equal(shouldRedirectToSignInOnTaskInput(false, 'Draft proposal'), true);
  assert.equal(shouldRedirectToSignInOnTaskInput(false, '   '), false);
  assert.equal(shouldRedirectToSignInOnTaskInput(true, 'Draft proposal'), false);
});
