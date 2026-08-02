const { test } = require('node:test');
const assert = require('node:assert/strict');
const sanitize = require('../middleware/sanitize');

test('sanitize strips HTML tags from string fields', () => {
  const req = {
    body: {
      name: '<script>alert("xss")</script>John',
      email: 'test@example.com'
    }
  };

  sanitize(req, {}, () => {});

  assert.equal(req.body.name, 'alert("xss")John');
  assert.equal(req.body.email, 'test@example.com');
});

test('sanitize cleans nested objects', () => {
  const req = {
    body: {
      personalInfo: {
        name: '<b>Bold Name</b>',
        location: 'Douala'
      }
    }
  };

  sanitize(req, {}, () => {});

  assert.equal(req.body.personalInfo.name, 'Bold Name');
  assert.equal(req.body.personalInfo.location, 'Douala');
});

test('sanitize cleans array items', () => {
  const req = {
    body: {
      skills: ['<i>JavaScript</i>', 'Python', '<script>PHP</script>']
    }
  };

  sanitize(req, {}, () => {});

  assert.equal(req.body.skills[0], 'JavaScript');
  assert.equal(req.body.skills[1], 'Python');
  assert.equal(req.body.skills[2], 'PHP');
});

test('sanitize leaves non-string fields untouched', () => {
  const req = {
    body: {
      count: 42,
      active: true,
      items: [1, 2, 3]
    }
  };

  sanitize(req, {}, () => {});

  assert.equal(req.body.count, 42);
  assert.equal(req.body.active, true);
  assert.deepEqual(req.body.items, [1, 2, 3]);
});

test('sanitize handles null body', () => {
  const req = { body: null };
  sanitize(req, {}, () => {});
  assert.equal(req.body, null);
});

test('sanitize trims whitespace from strings', () => {
  const req = {
    body: {
      name: '  John Doe  '
    }
  };

  sanitize(req, {}, () => {});

  assert.equal(req.body.name, 'John Doe');
});
