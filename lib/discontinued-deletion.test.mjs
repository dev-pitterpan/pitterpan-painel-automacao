import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateDiscontinuedDeletion } from './discontinued-deletion.ts';

test('exclui somente fora de linha com estoque exatamente zero', () => {
  assert.equal(evaluateDiscontinuedDeletion('FORA_DE_LINHA', 0).eligible, true);
  assert.equal(evaluateDiscontinuedDeletion('ATIVO', 0).eligible, false);
  assert.equal(evaluateDiscontinuedDeletion('FORA_DE_LINHA', 1).eligible, false);
  assert.equal(evaluateDiscontinuedDeletion('FORA_DE_LINHA', -1).eligible, false);
  assert.equal(evaluateDiscontinuedDeletion('PENDENTE', 0).eligible, false);
  assert.equal(evaluateDiscontinuedDeletion('FORA_DE_LINHA', null).eligible, false);
});
