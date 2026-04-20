// Entry point for Capitalism.io

let game, renderer, ui;

window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('board-canvas');

  game = new Game();
  renderer = new Renderer(canvas);
  ui = new UI(game, renderer);

  // Initial render (empty board for lobby)
  renderer.draw(game);

  // Canvas click: show property info
  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = BOARD_SIZE / rect.width;
    const scaleY = BOARD_SIZE / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;

    for (let i = 0; i < 40; i++) {
      const r = getSpaceRect(i);
      if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) {
        _showSpaceInfo(i);
        break;
      }
    }
  });
});

function _showSpaceInfo(spaceId) {
  const sp = SPACES[spaceId];
  const prop = game.properties[spaceId];
  if (!prop && sp.type !== 'go' && sp.type !== 'jail' && sp.type !== 'free_parking' && sp.type !== 'go_to_jail') return;

  let info = `${sp.name}`;
  if (prop) {
    info += `\nPrice: $${sp.price}`;
    if (prop.owner !== null) {
      info += `\nOwner: ${game.players[prop.owner].name}`;
      if (prop.mortgaged) info += ' (MORTGAGED)';
      if (prop.hotel) info += '\n🏨 Hotel';
      else if (prop.houses > 0) info += `\n🏠 × ${prop.houses}`;
    } else {
      info += '\nUnowned';
    }
    if (sp.rent) {
      info += `\nBase Rent: $${sp.rent[0]}`;
      if (prop.owner !== null && !prop.mortgaged && !prop.hotel && prop.houses === 0) {
        const hasMonopoly = game._hasMonopoly(prop.owner, sp.group);
        if (hasMonopoly) info += ` (monopoly: $${sp.rent[0]*2})`;
      }
    }
  }
  // Show as floating tooltip instead of alert for better UX
  showTooltip(info, spaceId);
}

function showTooltip(text, spaceId) {
  let tip = document.getElementById('space-tooltip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'space-tooltip';
    document.body.appendChild(tip);
    tip.addEventListener('click', () => tip.style.display = 'none');
  }
  tip.style.display = 'block';
  tip.innerHTML = text.split('\n').map(l => `<div>${l}</div>`).join('');

  // Position near canvas
  const canvas = document.getElementById('board-canvas');
  const cr = canvas.getBoundingClientRect();
  const spRect = getSpaceRect(spaceId);
  const scale = cr.width / BOARD_SIZE;
  const sx = cr.left + spRect.x * scale;
  const sy = cr.top + spRect.y * scale;
  tip.style.left = Math.min(sx, window.innerWidth - 200) + 'px';
  tip.style.top = Math.min(sy + 20, window.innerHeight - 150) + 'px';

  clearTimeout(tip._timeout);
  tip._timeout = setTimeout(() => { tip.style.display = 'none'; }, 3000);
}
