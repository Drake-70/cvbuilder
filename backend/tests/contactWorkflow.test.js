const { test } = require('node:test');
const assert = require('node:assert/strict');

const workflow = require('../services/contactWorkflow');

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

test('the forward path is allowed', () => {
  assert.equal(workflow.canTransition('new', 'read'), true);
  assert.equal(workflow.canTransition('read', 'replied'), true);
});

test('a replied message can be reopened', () => {
  // Someone who replies and then gets a follow-up question has genuinely unread
  // mail. Without this the follow-up lands in `read` and gets missed.
  assert.equal(workflow.canTransition('replied', 'new'), true);
  assert.equal(workflow.canTransition('replied', 'read'), true);
});

test('anything can be archived, and archived can come back', () => {
  // Spam and duplicate submissions need to leave the working set without
  // pretending they were handled, and archiving by mistake must not be final.
  for (const from of workflow.STATUSES) {
    assert.equal(
      workflow.canTransition(from, 'archived'),
      true,
      `${from} should be archivable`
    );
  }
  assert.equal(workflow.canTransition('archived', 'read'), true);
  assert.equal(workflow.canTransition('archived', 'replied'), true);
});

test('every status reaches every other status', () => {
  // Asserted as a property rather than as a list, so adding a status to the enum
  // without adding its transitions fails here instead of in the inbox.
  for (const from of workflow.STATUSES) {
    for (const to of workflow.STATUSES) {
      assert.equal(
        workflow.canTransition(from, to),
        true,
        `${from} -> ${to} should be reachable`
      );
    }
  }
});

test('unknown statuses are not transitions', () => {
  // The caller is a request handler: a corrupt value in the database has to
  // surface as "not allowed", not as a thrown TypeError.
  assert.equal(workflow.canTransition('new', 'deleted'), false);
  assert.equal(workflow.canTransition('deleted', 'read'), false);
  assert.equal(workflow.canTransition('', ''), false);
  assert.equal(workflow.canTransition(undefined, null), false);
});

test('the two working statuses are new and read only', () => {
  // Drives the unread badge. `replied` is excluded because the work is done and
  // `archived` because it was never in the queue.
  assert.deepEqual(workflow.OPEN_STATUSES, ['new', 'read']);
});

// ---------------------------------------------------------------------------
// Error reporting
// ---------------------------------------------------------------------------

test('an allowed transition reports no error', () => {
  assert.equal(workflow.transitionError('new', 'read'), null);
});

test('moving to the same status is allowed and is not an error', () => {
  // The controller short-circuits this, but the rule has to hold here too, or the
  // two disagree about what is valid.
  assert.equal(workflow.transitionError('read', 'read'), null);
});

test('a missing status is rejected', () => {
  assert.match(workflow.transitionError('new', undefined), /required/);
  assert.match(workflow.transitionError('new', ''), /required/);
});

test('an unknown status lists the valid ones', () => {
  const reason = workflow.transitionError('new', 'deleted');
  assert.match(reason, /Unknown status/);
  for (const s of workflow.STATUSES) {
    assert.ok(reason.includes(s), `${s} should appear in the error`);
  }
});

test('a corrupt current status is reported rather than thrown', () => {
  assert.match(workflow.transitionError('corrupted', 'read'), /unknown current status/);
});

test('allowedFrom includes the current state', () => {
  const allowed = workflow.allowedFrom('new');
  assert.ok(allowed.includes('new'), 'the UI needs to know the current state is legal');
  assert.ok(allowed.includes('read'));
});

test('allowedFrom is empty for a corrupt state', () => {
  assert.deepEqual(workflow.allowedFrom('corrupted'), []);
});

// ---------------------------------------------------------------------------
// Update construction
// ---------------------------------------------------------------------------

test('a status change stamps who changed it and when', () => {
  const update = workflow.buildStatusUpdate({
    from: 'new',
    to: 'read',
    actor: { _id: 'admin-1' }
  });

  assert.equal(update.status, 'read');
  assert.equal(update.statusChangedBy, 'admin-1');
  assert.ok(update.statusChangedAt instanceof Date);
});

test('a missing actor is recorded as null rather than left unset', () => {
  // An audit field that is sometimes absent and sometimes null cannot be queried.
  const update = workflow.buildStatusUpdate({ from: 'new', to: 'read' });
  assert.equal(update.statusChangedBy, null);
});

test('a reply is stored trimmed and stamps repliedAt', () => {
  const update = workflow.buildStatusUpdate({
    from: 'read',
    to: 'replied',
    reply: '  Thanks, fixed.  ',
    actor: { _id: 'admin-1' }
  });

  assert.equal(update.reply, 'Thanks, fixed.');
  assert.ok(update.repliedAt instanceof Date);
});

test('editing an existing reply keeps the original repliedAt', () => {
  // "Replied at" is a fact about when it was answered. Restamping it every time
  // someone fixes a typo turns the field into "last edited".
  const original = new Date('2026-01-01T00:00:00Z');
  const update = workflow.buildStatusUpdate({
    from: 'replied',
    to: 'replied',
    reply: 'Corrected text.',
    actor: { _id: 'admin-1' },
    // Simulating what the stored document holds.
    repliedAt: original
  });

  assert.equal(update.reply, 'Corrected text.');
  assert.equal(
    'repliedAt' in update,
    false,
    'repliedAt must not be restamped when editing a reply'
  );
});

test('reopening a replied message does not erase the reply', () => {
  // Changing a status must not destroy the record that someone answered.
  const update = workflow.buildStatusUpdate({
    from: 'replied',
    to: 'new',
    actor: { _id: 'admin-1' }
  });

  assert.equal(update.status, 'new');
  assert.ok(!('reply' in update), 'the stored reply must be left alone');
  assert.ok(!('repliedAt' in update), 'repliedAt must be left alone');
});

test('marking replied without a reply body is allowed', () => {
  // The admin may have answered by phone or in another tool. Forcing a body
  // would be noise, and the audit fields still record who moved it.
  const update = workflow.buildStatusUpdate({
    from: 'read',
    to: 'replied',
    actor: { _id: 'admin-1' }
  });

  assert.equal(update.status, 'replied');
  assert.ok(!('reply' in update), 'no empty reply should be written');
});

test('a whitespace-only reply is treated as no reply', () => {
  const update = workflow.buildStatusUpdate({
    from: 'read',
    to: 'replied',
    reply: '   ',
    actor: { _id: 'admin-1' }
  });
  assert.ok(!('reply' in update));
});

test('clearReply wipes both the text and the timestamp', () => {
  const update = workflow.buildStatusUpdate({
    from: 'replied',
    to: 'read',
    clearReply: true,
    actor: { _id: 'admin-1' }
  });

  assert.equal(update.reply, '');
  assert.equal(update.repliedAt, null);
});
