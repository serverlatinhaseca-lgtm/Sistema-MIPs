const test = require('node:test');
const assert = require('node:assert/strict');
const { NIVEIS, nivelDoPerfil, indiceNivel, filtrarPorNivel } = require('./ajuda');

test('mapeia perfis para níveis de acesso', () => {
  assert.equal(nivelDoPerfil('Leitor'), 'funcionario');
  assert.equal(nivelDoPerfil('Editor'), 'lider');
  assert.equal(nivelDoPerfil('Gerente'), 'gerente');
  assert.equal(nivelDoPerfil('Administrador'), 'administrador');
  assert.equal(nivelDoPerfil(''), 'funcionario');
});

test('ordena os níveis do menor para o maior', () => {
  assert.deepEqual(NIVEIS, ['funcionario', 'lider', 'gerente', 'administrador']);
  assert.ok(indiceNivel('funcionario') < indiceNivel('lider'));
  assert.ok(indiceNivel('lider') < indiceNivel('gerente'));
  assert.ok(indiceNivel('gerente') < indiceNivel('administrador'));
});

test('funcionário vê somente tópicos de funcionário', () => {
  const itens = [
    { id: 1, nivel: 'funcionario' },
    { id: 2, nivel: 'lider' },
    { id: 3, nivel: 'administrador' },
  ];
  assert.deepEqual(filtrarPorNivel(itens, 'Leitor').map((r) => r.id), [1]);
});

test('líder vê funcionário e líder', () => {
  const itens = [
    { id: 1, nivel: 'funcionario' },
    { id: 2, nivel: 'lider' },
    { id: 3, nivel: 'gerente' },
  ];
  assert.deepEqual(filtrarPorNivel(itens, 'Editor').map((r) => r.id), [1, 2]);
});

test('gerente vê até gerente e administrador vê tudo', () => {
  const itens = [
    { id: 1, nivel: 'funcionario' },
    { id: 2, nivel: 'lider' },
    { id: 3, nivel: 'gerente' },
    { id: 4, nivel: 'administrador' },
  ];
  assert.deepEqual(filtrarPorNivel(itens, 'Gerente').map((r) => r.id), [1, 2, 3]);
  assert.deepEqual(filtrarPorNivel(itens, 'Administrador').map((r) => r.id), [1, 2, 3, 4]);
});

test('nível desconhecido cai em funcionário', () => {
  const itens = [{ id: 1, nivel: 'funcionario' }, { id: 2, nivel: 'gerente' }];
  assert.deepEqual(filtrarPorNivel(itens, 'qualquer'), [itens[0]]);
});
