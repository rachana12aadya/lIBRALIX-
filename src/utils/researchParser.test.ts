import test from 'node:test';
import assert from 'node:assert/strict';
import { formatSourceEntry, parseResearchMarkdown, parseSourceEntry } from './researchParser';

test('parseResearchMarkdown extracts Summary and Key Findings cleanly', () => {
  const sample = `## Summary
Autonomous agents combine planning, memory, and tool execution to finish multi-step workflows.

## Key Findings
- Tool grounding reduces factual drift across external web sources.
- Persistent user profiles improve scheduling relevance across sessions.`;

  const parsed = parseResearchMarkdown(sample);
  assert.match(parsed.summary, /Autonomous agents combine planning/);
  assert.equal(parsed.keyFindings.length, 2);
  assert.equal(
    parsed.keyFindings[0],
    'Tool grounding reduces factual drift across external web sources.'
  );
});

test('formatSourceEntry and parseSourceEntry round-trip cleanly', () => {
  const formatted = formatSourceEntry('Google AI Docs', 'https://ai.google.dev');
  const parsed = parseSourceEntry(formatted);
  assert.deepEqual(parsed, {
    title: 'Google AI Docs',
    url: 'https://ai.google.dev',
  });
});
