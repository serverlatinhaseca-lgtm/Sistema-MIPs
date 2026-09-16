export function decodificarToken(token) {
  if (!token) return null;
  try {
    const partes = String(token).split('.');
    if (partes.length !== 3) return null;
    const payload = JSON.parse(atob(partes[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload;
  } catch {
    return null;
  }
}

export function tokenExpirado(token) {
  const payload = decodificarToken(token);
  if (!payload) return true;
  if (!payload.exp) return false;
  return Date.now() / 1000 >= payload.exp;
}

export function limparSessao() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  sessionStorage.clear();
}

export function obterSessao() {
  const token = localStorage.getItem('token');
  if (!token || tokenExpirado(token)) {
    if (token) limparSessao();
    return null;
  }
  let user = {};
  try {
    user = JSON.parse(localStorage.getItem('user') || '{}');
  } catch {
    user = {};
  }
  const payload = decodificarToken(token);
  // O perfil válido é o do JWT (assinado pelo backend).
  // O objeto `user` do localStorage é manipulável e serve só como fallback de exibição.
  const perfil = payload?.perfil || user.perfil || '';
  return { token, user, perfil };
}
