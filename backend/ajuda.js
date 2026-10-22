const NIVEIS = ['funcionario', 'lider', 'gerente', 'administrador'];

const nivelDoPerfil = (perfil) => ({
  leitor: 'funcionario',
  funcionario: 'funcionario',
  editor: 'lider',
  lider: 'lider',
  gerente: 'gerente',
  administrador: 'administrador',
}[String(perfil || '').toLowerCase()] || 'funcionario');

const indiceNivel = (nivel) => {
  const i = NIVEIS.indexOf(String(nivel || '').toLowerCase());
  return i < 0 ? 0 : i;
};

// Cada nível enxerga os próprios tópicos e os dos níveis inferiores.
function filtrarPorNivel(respostas, perfil) {
  const limite = indiceNivel(nivelDoPerfil(perfil));
  return (Array.isArray(respostas) ? respostas : [])
    .filter((r) => indiceNivel(r?.nivel) <= limite);
}

module.exports = { NIVEIS, nivelDoPerfil, indiceNivel, filtrarPorNivel };
