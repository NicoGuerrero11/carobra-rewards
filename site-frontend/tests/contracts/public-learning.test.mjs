import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const previews = JSON.parse(read('../../src/data/public-learning.json'));
// Catalog manifests intentionally contain JSON-compatible reviewed arrays.
const catalog = path => {
  const source = read(path);
  return JSON.parse(source.slice(source.indexOf('= [') + 2, source.lastIndexOf('];') + 1));
};

test('public learning preview matches approved origin, titles, levels and thumbnails', () => {
  const sources = {
    cursos: catalog('../../../site-backend/src/rewards/courses/catalog.ts'),
    bienestar: catalog('../../../site-backend/src/rewards/courses/wellness-catalog.ts'),
  };
  assert.equal(previews.length, 10);
  assert.equal(new Set(previews.map(item => `${item.space}:${item.id}`)).size, previews.length);
  for (const item of previews) {
    assert.deepEqual(Object.keys(item).sort(), ['category', 'id', 'image', 'minimumLevel', 'space', 'title']);
    const source = sources[item.space]?.find(course => course.id === item.id);
    assert.ok(source, `Approved ${item.space} item ${item.id} exists`);
    for (const key of ['title', 'category', 'minimumLevel', 'image']) assert.equal(item[key], source[key]);
    assert.ok(source.chapters.every(chapter => chapter.activityId === (item.space === 'cursos' ? 2 : 1)));
    assert.equal(new URL(item.image).origin, 'https://i.vimeocdn.com');
    if (item.space === 'bienestar') assert.equal(item.minimumLevel, 'BRONZE');
  }
});
