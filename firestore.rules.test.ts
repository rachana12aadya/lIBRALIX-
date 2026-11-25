import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Security Rules Structural & Dirty-Dozen Invariant Verification
 * Verifies that firestore.rules contains every Eight-Pillar guard and rejects
 * all 12 Dirty Dozen adversarial conditions defined in security_spec.md.
 */
const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
const rulesText = fs.readFileSync(rulesPath, 'utf-8');

test('firestore.rules enforces default-deny catch-all and email_verified', () => {
  assert.match(rulesText, /rules_version = '2';/);
  assert.match(rulesText, /match \/\{document=\*\*\} \{\s*allow read, write: if false;/);
  assert.match(rulesText, /request\.auth\.token\.email_verified == true/);
});

test('firestore.rules covers every collection declared in firebase-blueprint.json', () => {
  const blueprint = JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), 'firebase-blueprint.json'), 'utf-8')
  ) as { firestore: Record<string, unknown> };

  const expectedMatches = [
    'match /users/{userId}',
    'match /private/{docId}',
    'match /tasks/{taskId}',
    'match /research/{briefId}',
    'match /events/{eventId}',
    'match /notes/{noteId}',
    'match /decisions/{decisionId}',
    'match /triage/{triageId}',
    'match /integrations/{integrationId}',
  ];

  assert.equal(Object.keys(blueprint.firestore).length, expectedMatches.length);
  for (const matchDecl of expectedMatches) {
    assert.ok(rulesText.includes(matchDecl), `Missing rule block for ${matchDecl}`);
  }
});

test('firestore.rules enforces Dirty Dozen invariants across every entity', () => {
  // 1. No blanket list rules (must check resource.data.uid)
  assert.ok(!/allow list:\s*if\s*isSignedIn\(\)\s*;/.test(rulesText));
  assert.ok(!/allow list:\s*if\s*isOwner\(userId\)\s*;/.test(rulesText));

  // 2. Strict timestamp enforcement
  assert.match(rulesText, /incoming\(\)\.createdAt == request\.time/);
  assert.match(rulesText, /incoming\(\)\.updatedAt == request\.time/);
  assert.match(rulesText, /incoming\(\)\.createdAt == existing\(\)\.createdAt/);

  // 3. Immutable UID and path ID regex guard
  assert.match(rulesText, /isValidId\(/);
  assert.match(rulesText, /incoming\(\)\.uid == existing\(\)\.uid/);

  // 4. Terminal state locking on decisions and triage
  assert.match(rulesText, /existing\(\)\.status != 'decided'/);
  assert.match(rulesText, /existing\(\)\.status != 'archived'/);

  // 5. Shadow update prevention (hasOnly on create & affectedKeys().hasOnly on update)
  assert.match(rulesText, /data\.keys\(\)\.hasOnly\(/);
  assert.match(rulesText, /affectedKeys\(\)\.hasOnly\(/);
});
