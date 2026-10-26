import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync('supabase/functions/validate-report-image/index.ts', 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

function setup(responses) {
  let handler;
  const calls = [];
  const context = {
    exports: {},
    require: () => ({ createClient: () => ({ from: () => { throw new Error('Pre-submit validation must not modify reports'); } }) }),
    Deno: { serve: callback => { handler = callback; }, env: { get: name => name === 'GEMINI_API_KEY' ? 'server-only-test-key' : name === 'GEMINI_API_KEY_BACKUP' ? 'backup-test-key' : 'unused' } },
    fetch: async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body) });
      const next = responses.shift();
      return { ok: next.ok, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(next.result) }] } }] }) };
    },
    AbortSignal, Response, JSON, Object, Number, String, console,
  };
  vm.runInNewContext(compiled, context);
  return { handler, calls };
}

const request = incidentType => ({ method: 'POST', json: async () => ({ validationScope: 'moderate_incident_image',
  selectedIncidentType: incidentType, imageBase64: 'actual-jpeg-base64' }) });

test('pre-submit Moderate Report validates image bytes against the selected category without updating a report', async () => {
  const { handler, calls } = setup([{ ok: true, result: { decision: 'unrelated', confidence: 96, reason: 'Food photo' } }]);
  const result = await (await handler(request('Flooded Road'))).json();
  assert.equal(result.decision, 'unrelated');
  assert.equal(calls[0].body.contents[0].parts[0].inlineData.data, 'actual-jpeg-base64');
  assert.match(calls[0].body.contents[0].parts[1].text, /Flooded Road/);
});

test('uncertain mismatch is not treated as clearly unrelated', async () => {
  const { handler } = setup([{ ok: true, result: { decision: 'unrelated', confidence: 60, reason: 'Unclear water' } }]);
  const result = await (await handler(request('Rising Water Level'))).json();
  assert.equal(result.decision, 'uncertain');
});

test('Moderate Report image check uses the project Gemini backup when primary fails', async () => {
  const { handler, calls } = setup([{ ok: false }, { ok: true, result: { decision: 'match', confidence: 90, reason: 'Floodwater near houses' } }]);
  const result = await (await handler(request('Flooded Residential Area'))).json();
  assert.equal(result.decision, 'match');
  assert.match(calls[0].url, /gemini-3\.6-flash/);
  assert.match(calls[1].url, /gemini-2\.5-flash-lite/);
  assert.equal(new URL(calls[1].url).searchParams.get('key'), 'backup-test-key');
});

test('both Gemini failures return uncertainty rather than rejecting a genuine report', async () => {
  const { handler } = setup([{ ok: false }, { ok: false }]);
  const result = await (await handler(request('Flash Flood'))).json();
  assert.equal(result.success, false);
  assert.equal(result.decision, 'uncertain');
});
