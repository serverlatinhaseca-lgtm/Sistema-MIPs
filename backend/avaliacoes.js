const COMPETENCIAS = [
  { chave: 'manipulacao_higienica', titulo: 'Manipulação higiênica' },
  { chave: 'trabalho_em_equipe', titulo: 'Trabalho em equipe' },
  { chave: 'proatividade', titulo: 'Proatividade' },
  { chave: 'comprometimento', titulo: 'Comprometimento' },
  { chave: 'higiene_pessoal', titulo: 'Higiene pessoal' },
  { chave: 'produtividade', titulo: 'Produtividade' },
  { chave: 'gerais', titulo: 'Gerais' },
];

const NOTAS_PERMITIDAS = [0, 5, 8, 10];

function classificar(percentual) {
  if (percentual <= 49) return 'Ruim';
  if (percentual <= 79) return 'Regular';
  if (percentual <= 90) return 'Bom';
  return 'Ótimo';
}

function prepararAvaliacao(respostas = []) {
  const normalizadas = COMPETENCIAS.map((competencia) => {
    const resposta = respostas.find((item) => item.competencia === competencia.chave) || {};
    return {
      competencia: competencia.chave,
      titulo: competencia.titulo,
      nota: Number(resposta.nota),
      observacao: String(resposta.observacao || '').trim(),
    };
  });
  const invalida = normalizadas.find((item) => !NOTAS_PERMITIDAS.includes(item.nota));
  if (invalida) throw new Error(`Selecione uma nota válida para ${invalida.titulo}.`);
  if (!normalizadas.find((item) => item.competencia === 'proatividade').observacao) {
    throw new Error('A observação de Proatividade é obrigatória.');
  }
  const pontuacaoTotal = normalizadas.reduce((total, item) => total + item.nota, 0);
  const percentual = Math.round((pontuacaoTotal / (COMPETENCIAS.length * 10)) * 100);
  return { respostas: normalizadas, pontuacaoTotal, percentual, classificacao: classificar(percentual) };
}

module.exports = { COMPETENCIAS, NOTAS_PERMITIDAS, classificar, prepararAvaliacao };
