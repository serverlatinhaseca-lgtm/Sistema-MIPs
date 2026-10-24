// utils/etiqueta.js
// Funções puras usadas pelo gerador de etiquetas.
// Mantém a lógica de negócio separada dos componentes React.

/**
 * Gera uma cor a partir do nome do produto.
 * Usa um hash simples para distribuir entre 7 cores predefinidas.
 */
export const getColorFromName = (name) => {
  const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const colorIndex = hash % 7;
  const colors = [
    '#d95d20', // laranja (padrão)
    '#2f6b4f', // verde
    '#6c757d', // cinza
    '#dc3545', // vermelho
    '#fd7e14', // laranja claro
    '#20c997', // verde água
    '#6f42c1', // roxo
  ];
  return colors[colorIndex];
};

/**
 * Retorna a unidade padrão (singular/plural) para um tipo de produto.
 */
export const getUnitForProduct = (productType) => {
  const lower = productType.toLowerCase();
  if (lower.includes('bolo') || lower.includes('bolos'))
    return { singular: 'bolo', plural: 'bolos' };
  if (lower.includes('pão'))
    return { singular: 'pão', plural: 'pães' };
  if (lower.includes('baguete') || lower.includes('frances'))
    return { singular: 'unidade', plural: 'unidades' };
  if (lower.includes('queijo'))
    return { singular: 'queijo', plural: 'queijos' };
  if (lower.includes('doces'))
    return { singular: 'doce', plural: 'doces' };
  if (lower.includes('salgado') || lower.includes('salgados'))
    return { singular: 'salgado', plural: 'salgados' };
  return { singular: 'unidade', plural: 'unidades' };
};

/**
 * Divide um total em múltiplos do tamanho do pacote.
 * Ex.: total=110, size=50 => [50, 50, 10]
 */
export const divide = (total, size) => {
  const result = [];
  const fullBoxes = Math.floor(total / size);
  const remainder = total % size;
  for (let i = 0; i < fullBoxes; i++) {
    result.push(size);
  }
  if (remainder > 0) {
    result.push(remainder);
  }
  return result;
};

/**
 * Formata uma data ISO (yyyy-mm-dd) para dd/mm/yyyy.
 */
export const formatDate = (dateStr) => {
  if (!dateStr) return '';
  return dateStr.split('-').reverse().join('/');
};

/**
 * Adiciona dias a uma data ISO.
 */
export const addDays = (dateStr, days) => {
  if (!dateStr) return '';
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

/**
 * Retorna o nome do dia da semana em pt-BR.
 */
export const getWeekday = (dateStr) => {
  if (!dateStr) return '';
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'long' }).format(new Date(`${dateStr}T12:00:00`));
};

/**
 * Gera nome de arquivo para PDF.
 */
export const generatePdfName = (delivery, route, date) => {
  const place =
    delivery === 'igarata'
      ? 'IGARATA'
      : delivery === 'paraibuna'
      ? `PARAIBUNA_${route === 'cidade' ? 'CIDADE' : 'ROCA'}`
      : delivery === 'johnson'
      ? 'JOHNSON'
      : delivery === 'margarina'
      ? 'JOHNSON_PAO_COM_MARGARINA'
      : 'GENERICAS';
  const fileDate = date ? `${date.slice(8, 10)}.${date.slice(5, 7)}` : 'SEM-DATA';
  return `${place}_${fileDate}.pdf`;
};