const test = require('node:test');
const assert = require('node:assert/strict');
const { COMPETENCIAS, classificar, prepararAvaliacao } = require('./avaliacoes');

const respostas = (notas) => COMPETENCIAS.map((item, index) => ({
  competencia: item.chave,
  nota: notas[index],
  observacao: item.chave === 'proatividade' ? 'Participação em treinamentos.' : '',
}));

test('mantém os limites de classificação da planilha', () => {
  assert.equal(classificar(49), 'Ruim');
  assert.equal(classificar(50), 'Regular');
  assert.equal(classificar(79), 'Regular');
  assert.equal(classificar(80), 'Bom');
  assert.equal(classificar(90), 'Bom');
  assert.equal(classificar(91), 'Ótimo');
});

test('calcula 77% para o exemplo enviado', () => {
  const resultado = prepararAvaliacao(respostas([8, 10, 5, 8, 10, 8, 5]));
  assert.equal(resultado.pontuacaoTotal, 54);
  assert.equal(resultado.percentual, 77);
  assert.equal(resultado.classificacao, 'Regular');
});

test('exige observação em proatividade', () => {
  const itens = respostas([8, 8, 8, 8, 8, 8, 8]);
  itens[2].observacao = '';
  assert.throws(() => prepararAvaliacao(itens), /obrigatória/);
});
