export const COMPETENCIAS = [
  {
    chave: 'manipulacao_higienica', titulo: 'Manipulação higiênica',
    pergunta: 'O colaborador cumpre corretamente as práticas de higiene, organização e limpeza durante a produção?',
    criterios: ['Colabora com a higienização das máquinas e a organização ao finalizar a produção.', 'Cumpre a higienização das demais áreas, como câmara fria e almoxarifado.', 'Mantém a área de embalagem organizada, com bancadas e piso em boas condições.'],
  },
  {
    chave: 'trabalho_em_equipe', titulo: 'Trabalho em equipe',
    pergunta: 'Demonstra cooperação e contribui positivamente para os objetivos comuns?',
    criterios: ['É educado, respeita opiniões e habilidades e mantém diálogo claro.', 'Respeita a hierarquia da empresa.', 'Comunica erros e situações que possam afetar a equipe.'],
  },
  {
    chave: 'proatividade', titulo: 'Proatividade', obrigatoria: true,
    pergunta: 'Identifica problemas, sugere melhorias e age sem supervisão constante?',
    criterios: ['Demonstra interesse em reuniões, treinamentos e na Carta de Valores.', 'Segue os processos ensinados e recebe orientações sem resistência.'],
  },
  {
    chave: 'comprometimento', titulo: 'Comprometimento',
    pergunta: 'É comprometido com horários, entregas e qualidade do pão?',
    criterios: ['Utiliza plástico com consciência.', 'Realiza a contagem do pão francês e do pão doce.', 'Tem consciência das entregas diárias.'],
  },
  {
    chave: 'higiene_pessoal', titulo: 'Higiene pessoal',
    pergunta: 'Adota diariamente as práticas de higiene pessoal necessárias à segurança do processo?',
    criterios: ['Usa uniforme e sapatos adequados, limpos e conservados, sem adornos.', 'Usa as camisas nos dias corretos e o uniforme completo.', 'Mantém barba, braços e cabelos com a proteção adequada.', 'Realiza corretamente a lavagem das mãos.'],
  },
  {
    chave: 'produtividade', titulo: 'Produtividade',
    pergunta: 'Contribui para a produtividade, considerando eficiência e cumprimento de prazos?',
    criterios: ['Mantém o foco durante as tarefas.', 'Cumpre a rotina diária de atividades.', 'Preenche e conhece as planilhas do seu setor.'],
  },
  {
    chave: 'gerais', titulo: 'Gerais',
    pergunta: 'Como está o desempenho nos aspectos gerais de conduta e cultura?',
    criterios: ['Assiduidade e pontualidade.', 'Assimilação e prática da Carta de Valores.', 'Advertências verbais ou escritas no período.'],
  },
];

export function formatarMes(valor) {
  if (!valor) return '—';
  const [ano, mes] = valor.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(ano, mes - 1, 1));
}
