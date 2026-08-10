document.addEventListener('click', function(e) {
  if (e.target.tagName === 'IMG' && !e.target.closest('#img-modal')) {
    let m = document.getElementById('img-modal');
    
    if (!m) {
      m = document.createElement('div');
      m.id = 'img-modal';
      
      // Fundo ainda mais escuro e desfocado para dar destaque
      m.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.85);backdrop-filter:blur(15px);-webkit-backdrop-filter:blur(15px);display:flex;justify-content:center;align-items:center;z-index:999999;cursor:zoom-out;opacity:0;transition:opacity 0.25s ease-out;';
      
      // A MÁGICA AQUI: width: 95vw e height: 95vh forçam a imagem a ocupar quase toda a tela, e o object-fit: contain impede que ela fique achatada ou esticada feio.
      m.innerHTML = '<img style="width:100vw;height:95vh;object-fit:contain;transform:scale(0.9);transition:transform 0.25s ease-out;" src="">';
      
      m.onclick = () => {
        m.style.opacity = '0';
        m.querySelector('img').style.transform = 'scale(0.9)';
        setTimeout(() => m.style.display = 'none', 250);
      };
      
      document.body.appendChild(m);
    }
    
    m.querySelector('img').src = e.target.src;
    m.style.display = 'flex';
    
    setTimeout(() => {
      m.style.opacity = '1';
      m.querySelector('img').style.transform = 'scale(1)';
    }, 10);
  }
});
