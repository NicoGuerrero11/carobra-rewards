import assert from 'node:assert/strict';
import {once} from 'node:events';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

test('mock context and focused portal preserve the same activity scenarios', async t => {
  const source = (await readFile(new URL('../support/mock-site-backend.mjs', import.meta.url), 'utf8'))
    .replace('server.listen(port, host);', 'export {server};');
  const {server} = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  });
  const base = `http://127.0.0.1:${server.address().port}/api/v1/rewards`;
  for (const mode of ['review', 'mixed', 'empty']) {
    const headers = {cookie:`carobra_session=e2e-eligible; activity-fixture=${mode}; activity-expiry=approved`};
    const [context, portal] = await Promise.all([
      fetch(`${base}/customer-context`, {headers}).then(r => r.json()),
      fetch(`${base}/portal`, {headers}).then(r => r.json()),
    ]);
    assert.deepEqual(context.portal, portal, `same fixture must survive context reuse: ${mode}`);
    assert.equal(portal.journey.modules.expiry_policy_approved, true);
    if (mode === 'review') assert.equal(portal.timeline.length, 6);
    if (mode === 'mixed') assert.equal(portal.journey.points.available, '950');
    if (mode === 'empty') {
      assert.deepEqual(portal.timeline, []);
      assert.deepEqual(portal.movement_details.movements, []);
    }
  }
});
