import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BLUEPRINT_LIMITS,
  generateSafeId,
  isValidId,
  validateEventInput,
  validateNoteInput,
  validateTaskInput,
  validateToolInput,
} from './validation';

test('isValidId accepts alphanumeric, underscores, and hyphens only', () => {
  assert.equal(isValidId('task_123-abc'), true);
  assert.equal(isValidId('bad$id!'), false);
  assert.equal(isValidId(''), false);
  assert.equal(isValidId('a'.repeat(129)), false);
});

test('generateSafeId produces valid blueprint IDs', () => {
  const id = generateSafeId('task');
  assert.equal(isValidId(id), true);
  assert.ok(id.startsWith('task_'));
});

test('validateTaskInput rejects empty title and enforces maxLength', () => {
  const emptyResult = validateTaskInput({ title: '   ' });
  assert.equal(emptyResult.ok, false);

  const longTitle = 'x'.repeat(BLUEPRINT_LIMITS.taskTitleMax + 50);
  const validResult = validateTaskInput({
    title: longTitle,
    priority: 'high',
    dueDate: '2026-11-25',
  });
  assert.equal(validResult.ok, true);
  if (validResult.ok) {
    assert.equal(validResult.data.title.length, BLUEPRINT_LIMITS.taskTitleMax);
    assert.equal(validResult.data.priority, 'high');
    assert.equal(validResult.data.dueDate, '2026-11-25');
  }
});

test('validateTaskInput rejects malformed dueDate', () => {
  const badDate = validateTaskInput({ title: 'Write brief', dueDate: '25-11-2026' });
  assert.equal(badDate.ok, false);
});

test('validateEventInput verifies time ordering and formats', () => {
  const inverted = validateEventInput({
    title: 'Focus block',
    date: '2026-11-21',
    startTime: '14:00',
    endTime: '13:00',
  });
  assert.equal(inverted.ok, false);

  const valid = validateEventInput({
    title: 'Deep Research',
    date: '2026-11-21',
    startTime: '09:30',
    endTime: '11:00',
    category: 'deep_work',
  });
  assert.equal(valid.ok, true);
});

test('validateNoteInput requires title and content', () => {
  assert.equal(validateNoteInput({ title: 'Note', content: '' }).ok, false);
  assert.equal(validateNoteInput({ title: '', content: 'Body' }).ok, false);
  assert.equal(validateNoteInput({ title: 'Note', content: 'Body', topic: 'Work' }).ok, true);
});

test('validateToolInput validates endpoint URL protocol', () => {
  assert.equal(
    validateToolInput({ toolName: 'Calendar Sync', toolType: 'calendar', endpointUrl: 'ftp://bad' })
      .ok,
    false
  );
  assert.equal(
    validateToolInput({
      toolName: 'Linear Webhook',
      toolType: 'project_management',
      endpointUrl: 'https://example.com/hook',
      syncEnabled: true,
    }).ok,
    true
  );
});
