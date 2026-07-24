import test from 'node:test';
import assert from 'node:assert/strict';
import { parseStudioLayers } from '../src/lib/studioRecovery.js';

test('malformed XML is isolated without mutating the in-memory layer design', () => {
  const layers = [
    { id: 'good', name: 'House', xml: '<good />', visible: true },
    { id: 'bad', name: 'Garage', xml: '<bad>', visible: true },
  ];
  const snapshot = structuredClone(layers);
  const parseLayer = (xml) => {
    if (xml === '<bad>') throw new Error('raw parser details that must stay private');
    return { points: { P1: [0, 0, 0] }, lines: {}, faces: [{ id: 'F1' }], lineTakeoffs: {} };
  };

  const result = parseStudioLayers(layers, parseLayer);

  assert.deepEqual(layers, snapshot);
  assert.equal(result.parsedLayers.length, 2);
  assert.equal(result.parsedLayers[0].parsed.faces[0].id, 'F1');
  assert.deepEqual(result.parsedLayers[1], {
    id: 'bad',
    name: 'Garage',
    visible: false,
    parsed: { points: {}, lines: {}, faces: [], lineTakeoffs: {} },
  });
  assert.deepEqual(result.parseFailures, [{ id: 'bad', name: 'Garage' }]);
  assert.doesNotMatch(JSON.stringify(result), /raw parser details/);
});

test('valid layers retain their order when another layer cannot be parsed', () => {
  const layers = [
    { id: 'one', name: 'One', xml: 'one', visible: true },
    { id: 'two', name: 'Two', xml: 'two', visible: true },
    { id: 'three', name: 'Three', xml: 'three', visible: true },
  ];

  const { parsedLayers, parseFailures } = parseStudioLayers(layers, (xml) => {
    if (xml === 'two') throw new Error('bad XML');
    return { points: {}, lines: {}, faces: [{ id: xml }], lineTakeoffs: {} };
  });

  assert.deepEqual(parsedLayers.map((layer) => layer.id), ['one', 'two', 'three']);
  assert.deepEqual(parsedLayers.map((layer) => layer.parsed.faces[0]?.id || null), ['one', null, 'three']);
  assert.deepEqual(parseFailures, [{ id: 'two', name: 'Two' }]);
});
