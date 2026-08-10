import { formatarMes } from '../avaliacoes';

export default function GraficoDesempenho({ historico = [] }) {
  const dados = [...historico].sort((a, b) => a.mes_referencia.localeCompare(b.mes_referencia));
  if (!dados.length) return <div className="h-56 grid place-items-center text-[var(--text-muted)]">Ainda não há avaliações para exibir.</div>;

  const largura = 720, altura = 260, esquerda = 52, direita = 24, topo = 26, base = 45;
  const areaLargura = largura - esquerda - direita, areaAltura = altura - topo - base;
  const x = (indice) => dados.length === 1 ? esquerda + areaLargura / 2 : esquerda + (indice / (dados.length - 1)) * areaLargura;
  const y = (valor) => topo + (1 - Number(valor) / 100) * areaAltura;
  const pontos = dados.map((item, indice) => `${x(indice)},${y(item.percentual)}`).join(' ');

  return (
    <svg viewBox={`0 0 ${largura} ${altura}`} className="w-full h-64" role="img" aria-label="Evolução mensal do desempenho">
      {[0, 25, 50, 75, 100].map((valor) => <g key={valor}><line x1={esquerda} y1={y(valor)} x2={largura-direita} y2={y(valor)} stroke="var(--border-color)"/><text x={esquerda-10} y={y(valor)+4} textAnchor="end" fontSize="11" fill="var(--text-muted)">{valor}</text></g>)}
      <polyline points={pontos} fill="none" stroke="var(--primary)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      {dados.map((item, indice) => <g key={`${item.mes_referencia}-${indice}`}><circle cx={x(indice)} cy={y(item.percentual)} r="6" fill="var(--primary)" stroke="white" strokeWidth="3"/><text x={x(indice)} y={y(item.percentual)-13} textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--text-main)">{item.percentual}%</text><text x={x(indice)} y={altura-16} textAnchor="middle" fontSize="11" fill="var(--text-muted)">{formatarMes(item.mes_referencia).split(' de ')[0].slice(0,3)}</text></g>)}
    </svg>
  );
}
