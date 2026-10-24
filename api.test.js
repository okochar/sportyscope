const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeQuery, buildUrl } = require('../api/virtual');
const { createServer } = require('../dev-server');

test('Query is strictly limited to read-only known SportyBet endpoints', () => {
  assert.deepEqual(sanitizeQuery({mode: 'other', page: '-1', category: 'http://evil.com'}), {mode:'upcoming',page:1,category:''});
  assert.equal(sanitizeQuery({mode:'results',page:'999',category:'sv:category:202120004'}).page,200);
  const built = buildUrl({mode:'results',category:'sv:category:202120004'});
  assert.equal(new URL(built.url).hostname,'www.sportybet.com');
  assert.equal(new URL(built.url).pathname,'/api/ng/factsCenter/eventResultList');
  assert.equal(new URL(built.url).searchParams.get('sportId'),'sr:sport:202120001');
});

test('Local server serves app, blocks path traversal and unwanted methods', async () => {
  const server = createServer();
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const app = await fetch(base);
    assert.equal(app.status,200);
    assert.match(await app.text(), /VirtualScope/);
    const hidden = await fetch(base+'/server.js');
    assert.equal(hidden.status,404);
    const post = await fetch(base+'/api/virtual',{method:'POST'});
    assert.equal(post.status,405);
  } finally { await new Promise(ok=>server.close(ok)); }
});

test('Real football is isolated from the virtual feed', () => {
 const real=buildUrl({mode:'real'});
 const virtual=buildUrl({mode:'upcoming'});
 assert.equal(new URL(real.url).pathname,'/api/ng/factsCenter/pcUpcomingEvents');
 assert.equal(new URL(real.url).searchParams.get('sportId'),'sr:sport:1');
 assert.equal(new URL(virtual.url).searchParams.get('sportId'),'sr:sport:202120001');
 assert.notEqual(new URL(real.url).pathname,new URL(virtual.url).pathname);
});
