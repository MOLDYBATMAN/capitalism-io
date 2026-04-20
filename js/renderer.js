// Canvas renderer for the Capitalism.io board — dark premium look inspired by RichUp.io

class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.canvas.width = BOARD_SIZE;
    this.canvas.height = BOARD_SIZE;
  }

  // ---- Main draw entry point ----
  draw(game) {
    const ctx = this.ctx;

    // Very dark board background
    ctx.fillStyle = '#07071a';
    ctx.fillRect(0, 0, BOARD_SIZE, BOARD_SIZE);

    this._drawCenter(game);

    for (let i = 0; i < 40; i++) this._drawSpace(i, game);

    // Houses/hotels
    for (let i = 0; i < 40; i++) {
      const sp = SPACES[i];
      if (sp.type === 'property') {
        const prop = game.properties[i];
        if (prop && prop.owner !== null && (prop.houses > 0 || prop.hotel)) {
          this._drawBuildings(i, prop.houses, prop.hotel);
        }
      }
    }

    // Tokens
    for (let pi = 0; pi < game.players.length; pi++) {
      const p = game.players[pi];
      if (!p.bankrupt) this._drawToken(p, pi, game.players);
    }
  }

  // ---- Center area ----
  _drawCenter(game) {
    const ctx = this.ctx;
    const C = CORNER_SIZE;
    const inner = BOARD_SIZE - 2 * C;

    // Dark center
    ctx.fillStyle = '#07071a';
    ctx.fillRect(C, C, inner, inner);

    // Subtle dot grid pattern
    ctx.fillStyle = 'rgba(255,255,255,0.025)';
    for (let gx = C + 10; gx < C + inner; gx += 18) {
      for (let gy = C + 10; gy < C + inner; gy += 18) {
        ctx.beginPath();
        ctx.arc(gx, gy, 1, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Inner border accents
    ctx.strokeStyle = 'rgba(0,255,204,0.08)';
    ctx.lineWidth = 1;
    ctx.strokeRect(C + 10, C + 10, inner - 20, inner - 20);
    ctx.strokeStyle = 'rgba(255,68,136,0.06)';
    ctx.strokeRect(C + 20, C + 20, inner - 40, inner - 40);

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // CAPITALISM neon text
    ctx.fillStyle = '#00ffcc';
    ctx.font = 'bold 36px "Segoe UI", Arial, sans-serif';
    ctx.shadowColor = '#00ffcc';
    ctx.shadowBlur = 22;
    ctx.fillText('CAPITALISM', BOARD_SIZE / 2, BOARD_SIZE / 2 - 22);

    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ff4488';
    ctx.font = 'bold 24px "Segoe UI", Arial, sans-serif';
    ctx.shadowColor = '#ff4488';
    ctx.shadowBlur = 14;
    ctx.fillText('.io', BOARD_SIZE / 2, BOARD_SIZE / 2 + 14);
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  // ---- Draw a single space ----
  _drawSpace(id, game) {
    const ctx = this.ctx;
    const sp = SPACES[id];
    const rect = getSpaceRect(id);
    const side = getSpaceSide(id);
    const prop = (sp.type === 'property' || sp.type === 'railroad' || sp.type === 'utility')
      ? game.properties[id] : null;

    // Draw dark rounded tile background
    this._roundRect(rect.x, rect.y, rect.w, rect.h, 4, '#1a1a35');

    // Tile border
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 0.5;
    this._strokeRoundRect(rect.x, rect.y, rect.w, rect.h, 4);

    const BAND = 18;

    // Color band for properties
    if (sp.type === 'property') {
      const clr = COLOR_MAP[sp.color];
      let bx = rect.x, by = rect.y, bw = rect.w, bh = BAND;
      if (side === 'bottom')     { by = rect.y; }
      else if (side === 'top')   { by = rect.y + rect.h - BAND; }
      else if (side === 'left')  { bx = rect.x + rect.w - BAND; bw = BAND; bh = rect.h; }
      else if (side === 'right') { bx = rect.x; bw = BAND; bh = rect.h; }

      ctx.fillStyle = clr;
      ctx.fillRect(bx, by, bw, bh);

      // Mortgage overlay on band
      if (prop && prop.mortgaged) {
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillRect(bx, by, bw, bh);
        ctx.fillStyle = '#ffd700';
        ctx.font = 'bold 8px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('M', bx + bw / 2, by + bh / 2);
      }
    }

    // Ownership glow border (2px colored stroke)
    if (prop && prop.owner !== null) {
      const ownerColor = PLAYER_COLORS[prop.owner];
      ctx.save();
      ctx.strokeStyle = ownerColor;
      ctx.lineWidth = 2;
      ctx.shadowColor = ownerColor;
      ctx.shadowBlur = 8;
      this._strokeRoundRect(rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2, 3);
      ctx.shadowBlur = 0;
      ctx.restore();
    }

    // Draw content
    this._drawSpaceContent(id, rect, side, prop, BAND);
  }

  // ---- Rounded rect helpers ----
  _roundRect(x, y, w, h, r, fill) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  }

  _strokeRoundRect(x, y, w, h, r) {
    this._roundRect(x, y, w, h, r, null);
    this.ctx.stroke();
  }

  // ---- Space content (text, icons) ----
  _drawSpaceContent(id, rect, side, prop, BAND) {
    const ctx = this.ctx;
    const sp = SPACES[id];

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Corner spaces get their own treatment
    if (side === 'corner') {
      this._drawCornerSpace(id, rect);
      ctx.restore();
      return;
    }

    // Rotate context for left/right columns so text reads correctly
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    ctx.translate(cx, cy);
    if (side === 'left')  ctx.rotate(Math.PI / 2);
    if (side === 'right') ctx.rotate(-Math.PI / 2);

    const isVertical = (side === 'left' || side === 'right');
    const wForText = isVertical ? rect.h : rect.w;
    const hForText = isVertical ? rect.w : rect.h;
    const textAreaH = hForText - BAND;

    // Center of the text area (excluding color band)
    let textAreaCenterY;
    if (sp.type === 'property') {
      textAreaCenterY = (side === 'bottom')
        ? BAND / 2 + textAreaH / 2 - hForText / 2
        : -BAND / 2 - textAreaH / 2 + hForText / 2;
    } else {
      textAreaCenterY = 0;
    }

    const textAreaTopY = textAreaCenterY - textAreaH / 2;
    const textAreaBottomY = textAreaCenterY + textAreaH / 2;

    // --- Airport / railroad ---
    if (sp.type === 'railroad') {
      // Big plane icon
      ctx.font = '16px Arial';
      ctx.fillText('✈', 0, textAreaCenterY - 10);

      // Airport code name
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 6.5px Arial, sans-serif';
      const shortName = sp.name.replace(' Airport', '');
      ctx.fillText(shortName, 0, textAreaCenterY + 4);

      // Price
      ctx.fillStyle = '#ffd700';
      ctx.font = 'bold 6.5px Arial';
      ctx.fillText('$' + sp.price, 0, textAreaBottomY - 5);

      ctx.restore();
      return;
    }

    // --- Utility ---
    if (sp.type === 'utility') {
      ctx.font = '16px Arial';
      ctx.fillText(sp.flag || (id === 12 ? '⚡' : '💧'), 0, textAreaCenterY - 10);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 6.5px Arial, sans-serif';
      ctx.fillText(sp.name, 0, textAreaCenterY + 4);

      ctx.fillStyle = '#ffd700';
      ctx.font = 'bold 6.5px Arial';
      ctx.fillText('$' + sp.price, 0, textAreaBottomY - 5);

      ctx.restore();
      return;
    }

    // --- Chance / Community Chest ---
    if (sp.type === 'chance') {
      ctx.font = 'bold 22px Arial';
      ctx.fillStyle = '#e8a020';
      ctx.shadowColor = '#ffa500';
      ctx.shadowBlur = 8;
      ctx.fillText('?', 0, textAreaCenterY - 6);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ccaa55';
      ctx.font = 'bold 6px Arial';
      ctx.fillText('SURPRISE', 0, textAreaCenterY + 10);
      ctx.restore();
      return;
    }

    if (sp.type === 'community_chest') {
      ctx.font = '16px Arial';
      ctx.fillText('💰', 0, textAreaCenterY - 8);
      ctx.fillStyle = '#ccaa55';
      ctx.font = 'bold 6px Arial';
      ctx.fillText('TREASURE', 0, textAreaCenterY + 8);
      ctx.restore();
      return;
    }

    // --- Tax ---
    if (sp.type === 'tax') {
      ctx.font = '14px Arial';
      ctx.fillText('💸', 0, textAreaCenterY - 10);
      ctx.fillStyle = '#ff8888';
      ctx.font = 'bold 6.5px Arial';
      ctx.fillText(sp.name, 0, textAreaCenterY + 4);
      ctx.fillStyle = '#ffd700';
      ctx.font = 'bold 6.5px Arial';
      ctx.fillText('$' + sp.amount, 0, textAreaBottomY - 5);
      ctx.restore();
      return;
    }

    // --- Regular property ---
    // Flag emoji centered in upper portion of text area
    const flagY = textAreaTopY + (textAreaH * 0.32);
    ctx.font = '13px Arial';
    ctx.fillText(sp.flag || '', 0, flagY);

    // City name below flag — word-wrapped, bold 7px white
    const name = sp.name;
    const words = name.split(' ');
    const fontSize = 7;
    ctx.font = `bold ${fontSize}px Arial, sans-serif`;
    const lineH = fontSize + 2.5;

    const lines = [];
    let line = '';
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > wForText - 8) {
        if (line) lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);

    const totalNameH = lines.length * lineH;
    const nameStartY = flagY + 10 - totalNameH / 2 + lineH / 2;

    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], 0, nameStartY + i * lineH);
    }

    // Price at bottom of text area in gold
    if (sp.price) {
      ctx.fillStyle = '#ffd700';
      ctx.font = 'bold 7px Arial';
      ctx.fillText('$' + sp.price, 0, textAreaBottomY - 5);
    }

    ctx.restore();
  }

  // ---- Corner spaces ----
  _drawCornerSpace(id, rect) {
    const ctx = this.ctx;
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;

    if (id === 0) { // START
      // Green background
      ctx.fillStyle = '#1a4a1a';
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Arrow
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 28px Arial';
      ctx.shadowColor = '#00ff88';
      ctx.shadowBlur = 12;
      ctx.fillText('→', cx, cy + 8);
      ctx.shadowBlur = 0;

      // "START" text
      ctx.fillStyle = '#00ff88';
      ctx.font = 'bold 14px "Segoe UI", Arial';
      ctx.shadowColor = '#00ff88';
      ctx.shadowBlur = 8;
      ctx.fillText('START', cx, cy - 14);
      ctx.shadowBlur = 0;

      // "Collect $200"
      ctx.fillStyle = '#aaffcc';
      ctx.font = 'bold 6.5px Arial';
      ctx.fillText('Collect $200', cx, rect.y + 10);

    } else if (id === 10) { // IN PRISON
      ctx.fillStyle = '#2a2a2a';
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Jail bars
      ctx.strokeStyle = '#888';
      ctx.lineWidth = 2.5;
      for (let i = 0; i < 3; i++) {
        const bx = rect.x + 14 + i * 13;
        ctx.beginPath();
        ctx.moveTo(bx, rect.y + rect.h * 0.42);
        ctx.lineTo(bx, rect.y + rect.h * 0.82);
        ctx.stroke();
      }
      // Horizontal bar
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(rect.x + 10, rect.y + rect.h * 0.58);
      ctx.lineTo(rect.x + 50, rect.y + rect.h * 0.58);
      ctx.stroke();

      ctx.fillStyle = '#f90';
      ctx.font = 'bold 7.5px Arial';
      ctx.fillText('IN PRISON', cx, cy + 24);

      // "Just Visiting"
      ctx.fillStyle = '#aaaaaa';
      ctx.font = 'bold 5px Arial';
      ctx.fillText('JUST VISITING', cx + 14, cy - 22);

    } else if (id === 20) { // VACATION
      ctx.fillStyle = '#0d3d3d';
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      ctx.font = '28px Arial';
      ctx.fillText('🏖', cx, cy - 6);

      ctx.fillStyle = '#00e5cc';
      ctx.font = 'bold 9px Arial';
      ctx.shadowColor = '#00e5cc';
      ctx.shadowBlur = 8;
      ctx.fillText('VACATION', cx, cy + 18);
      ctx.shadowBlur = 0;

    } else if (id === 30) { // GO TO PRISON
      ctx.fillStyle = '#3a1010';
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      ctx.font = '26px Arial';
      ctx.fillText('👮', cx, cy - 10);

      ctx.fillStyle = '#ff4400';
      ctx.font = 'bold 7.5px Arial';
      ctx.shadowColor = '#ff4400';
      ctx.shadowBlur = 6;
      ctx.fillText('GO TO', cx, cy + 10);
      ctx.fillText('PRISON', cx, cy + 20);
      ctx.shadowBlur = 0;
    }
  }

  // ---- Buildings ----
  _drawBuildings(id, houses, hotel) {
    const ctx = this.ctx;
    const rect = getSpaceRect(id);
    const side = getSpaceSide(id);
    const BAND = 18;
    const count = hotel ? 1 : houses;
    const size = hotel ? 11 : 8;

    if (hotel) {
      // Red rounded square with star
      ctx.fillStyle = '#cc2222';
      ctx.strokeStyle = '#ff6666';
      ctx.lineWidth = 0.8;
    } else {
      // Green rounded square
      ctx.fillStyle = '#1a9a2a';
      ctx.strokeStyle = '#44dd55';
      ctx.lineWidth = 0.8;
    }

    const drawBuilding = (hx, hy) => {
      // Small rounded square
      const r = 2;
      ctx.beginPath();
      ctx.moveTo(hx - size/2 + r, hy - size/2);
      ctx.lineTo(hx + size/2 - r, hy - size/2);
      ctx.arcTo(hx + size/2, hy - size/2, hx + size/2, hy - size/2 + r, r);
      ctx.lineTo(hx + size/2, hy + size/2 - r);
      ctx.arcTo(hx + size/2, hy + size/2, hx + size/2 - r, hy + size/2, r);
      ctx.lineTo(hx - size/2 + r, hy + size/2);
      ctx.arcTo(hx - size/2, hy + size/2, hx - size/2, hy + size/2 - r, r);
      ctx.lineTo(hx - size/2, hy - size/2 + r);
      ctx.arcTo(hx - size/2, hy - size/2, hx - size/2 + r, hy - size/2, r);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Label
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${hotel ? 7 : 6}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(hotel ? '★' : 'H', hx, hy);
    };

    if (side === 'bottom') {
      const startX = rect.x + (rect.w - count * (size + 3)) / 2 + size / 2;
      for (let i = 0; i < count; i++) drawBuilding(startX + i * (size + 3), rect.y + BAND / 2);
    } else if (side === 'top') {
      const startX = rect.x + (rect.w - count * (size + 3)) / 2 + size / 2;
      for (let i = 0; i < count; i++) drawBuilding(startX + i * (size + 3), rect.y + rect.h - BAND / 2);
    } else if (side === 'left') {
      const startY = rect.y + (rect.h - count * (size + 3)) / 2 + size / 2;
      for (let i = 0; i < count; i++) drawBuilding(rect.x + rect.w - BAND / 2, startY + i * (size + 3));
    } else if (side === 'right') {
      const startY = rect.y + (rect.h - count * (size + 3)) / 2 + size / 2;
      for (let i = 0; i < count; i++) drawBuilding(rect.x + BAND / 2, startY + i * (size + 3));
    }
  }

  // ---- Player tokens ----
  _drawToken(player, idx, allPlayers) {
    const ctx = this.ctx;
    const active = allPlayers.filter(p => !p.bankrupt && p.position === player.position);
    const shareCount = active.length;
    const shareIdx = active.findIndex(p => p.id === player.id);

    const center = getSpaceCenter(player.position);
    const offset = this._getTokenOffset(shareIdx, shareCount);
    const x = center.x + offset.x;
    const y = center.y + offset.y;
    const R = 10;
    const color = PLAYER_COLORS[idx];
    const shape = PLAYER_SHAPES[idx];

    ctx.save();

    // Outer glow
    ctx.shadowColor = color;
    ctx.shadowBlur = 16;
    ctx.strokeStyle = _hexToRgba(color, 0.35);
    ctx.lineWidth = 3;
    if (shape === 'circle') {
      ctx.beginPath(); ctx.arc(x, y, R + 4, 0, Math.PI * 2); ctx.stroke();
    }

    // Inner glow
    ctx.shadowBlur = 6;
    ctx.strokeStyle = _hexToRgba(color, 0.6);
    ctx.lineWidth = 1.5;
    if (shape === 'circle') {
      ctx.beginPath(); ctx.arc(x, y, R + 2, 0, Math.PI * 2); ctx.stroke();
    }

    // Fill token shape
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.fillStyle = color;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;

    if (shape === 'circle') {
      ctx.beginPath();
      ctx.arc(x, y, R, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    } else if (shape === 'square') {
      ctx.fillRect(x - R, y - R, R * 2, R * 2);
      ctx.strokeRect(x - R, y - R, R * 2, R * 2);
      ctx.shadowBlur = 10;
      ctx.strokeStyle = _hexToRgba(color, 0.5);
      ctx.lineWidth = 2;
      ctx.strokeRect(x - R - 3, y - R - 3, (R + 3) * 2, (R + 3) * 2);
    } else if (shape === 'triangle') {
      ctx.beginPath();
      ctx.moveTo(x, y - R);
      ctx.lineTo(x + R, y + R);
      ctx.lineTo(x - R, y + R);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else if (shape === 'diamond') {
      ctx.beginPath();
      ctx.moveTo(x, y - R);
      ctx.lineTo(x + R, y);
      ctx.lineTo(x, y + R);
      ctx.lineTo(x - R, y);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Player initial letter
    ctx.shadowBlur = 0;
    const name = player.name || ('P' + (idx + 1));
    const initial = name.slice(0, 1).toUpperCase();
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 8px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initial, x, y);

    ctx.restore();
  }

  _getTokenOffset(shareIdx, shareCount) {
    const offsets = [
      [{ x: 0, y: 0 }],
      [{ x: -7, y: 0 }, { x: 7, y: 0 }],
      [{ x: -7, y: -6 }, { x: 7, y: -6 }, { x: 0, y: 6 }],
      [{ x: -7, y: -6 }, { x: 7, y: -6 }, { x: -7, y: 6 }, { x: 7, y: 6 }],
    ];
    return offsets[Math.min(shareCount - 1, 3)][shareIdx] || { x: 0, y: 0 };
  }
}
