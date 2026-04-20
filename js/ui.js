// UI management for Capitalism.io

class UI {
  constructor(game, renderer) {
    this.game = game;
    this.renderer = renderer;
    this.activeModal = null;
    this.tradeState = { toId: null, fromProps: [], toProps: [], fromMoney: 0, toMoney: 0 };

    this._bindLobby();
    this._bindGameButtons();
    this._bindModals();

    // Wire up game callbacks
    game.onUpdate = () => this.refresh();
    game.onLog = (msg) => this.appendLog(msg);
    game.onModal = (type, data) => this.showModal(type, data);
  }

  // ---- Lobby ----
  _bindLobby() {
    const startBtn = document.getElementById('btn-start');
    startBtn && startBtn.addEventListener('click', () => this._startGame());
  }

  _startGame() {
    const configs = [];
    document.querySelectorAll('.player-slot').forEach(slot => {
      const active = slot.querySelector('.slot-toggle').checked;
      if (!active) return;
      const name = slot.querySelector('.slot-name').value || slot.querySelector('.slot-name').placeholder;
      const isAI = slot.querySelector('.slot-ai').checked;
      const token = slot.querySelector('.slot-token')?.value || '🎩';
      configs.push({ name, isAI, token });
    });

    if (configs.length < 2) {
      alert('Please enable at least 2 players!');
      return;
    }

    const rules = {
      startingMoney: parseInt(document.getElementById('local-start-money')?.value || 1500),
      goSalary: parseInt(document.getElementById('local-go-salary')?.value || 200),
      jailFine: parseInt(document.getElementById('local-jail-fine')?.value || 50),
      freeParkingJackpot: document.getElementById('local-fp')?.checked ?? true,
      doubleSalaryOnGO: document.getElementById('local-double-go')?.checked ?? false,
      noRentInJail: document.getElementById('local-no-jail-rent')?.checked ?? false,
      auctionsEnabled: document.getElementById('local-auctions')?.checked ?? true,
      evenBuildRule: document.getElementById('local-even-build')?.checked ?? true,
    };

    document.getElementById('screen-lobby').classList.remove('active');
    document.getElementById('screen-game').classList.add('active');
    this.game.initGame(configs, rules);
    this.refresh();
  }

  // ---- Game Buttons ----
  _bindGameButtons() {
    document.getElementById('btn-roll').addEventListener('click', () => {
      if (this.game.state !== STATE.ROLL_DICE) return;
      if (this.game.currentPlayer.isAI) return;
      this.game.rollDice();
    });

    document.getElementById('btn-end-turn').addEventListener('click', () => {
      if (this.game.state !== STATE.PLAYER_ACTIONS) return;
      if (this.game.currentPlayer.isAI) return;
      this.game.endTurn();
    });

    document.getElementById('btn-manage').addEventListener('click', () => {
      if (this.game.state !== STATE.PLAYER_ACTIONS) return;
      if (this.game.currentPlayer.isAI) return;
      this.showModal('manage', { player: this.game.currentPlayer });
    });

    document.getElementById('btn-trade').addEventListener('click', () => {
      if (this.game.state !== STATE.PLAYER_ACTIONS) return;
      if (this.game.currentPlayer.isAI) return;
      this.showModal('trade', { player: this.game.currentPlayer });
    });

    document.getElementById('btn-pay-jail').addEventListener('click', () => {
      if (this.game.currentPlayer.isAI) return;
      this.game.payJailFine(this.game.currentPlayer);
    });

    document.getElementById('btn-jail-card').addEventListener('click', () => {
      if (this.game.currentPlayer.isAI) return;
      this.game.useJailCard(this.game.currentPlayer);
    });

    document.getElementById('btn-new-game').addEventListener('click', () => {
      if (typeof netplay !== 'undefined' && netplay.inOnlineGame) {
        // Online game: go back to online lobby
        this.closeModal();
        netplay.endOnlineGame();
        netplay.showLobbyScreen();
      } else {
        // Local game: go back to local lobby
        document.getElementById('screen-game').classList.remove('active');
        document.getElementById('screen-lobby').classList.add('active');
        this.closeModal();
      }
    });
  }

  _bindModals() {
    // Buy modal
    document.getElementById('btn-buy-confirm').addEventListener('click', () => {
      const p = this.game.currentPlayer;
      const sp = SPACES[p.position];
      this.game.buyProperty(p, sp);
      this.closeModal();
    });
    document.getElementById('btn-buy-skip').addEventListener('click', () => {
      this.game.skipBuy(this.game.currentPlayer);
      this.closeModal();
    });

    // Card modal
    document.getElementById('btn-card-ok').addEventListener('click', () => {
      const p = this.game.currentPlayer;
      const card = this.game.pendingCard;
      this.closeModal();
      this.game.resolveCard(p, card);
    });

    // Manage modal
    document.getElementById('btn-manage-close').addEventListener('click', () => this.closeModal());

    // Trade modal
    document.getElementById('btn-trade-confirm').addEventListener('click', () => this._confirmTrade());
    document.getElementById('btn-trade-cancel').addEventListener('click', () => this.closeModal());
    document.getElementById('select-trade-target').addEventListener('change', (e) => {
      this.tradeState.toId = parseInt(e.target.value);
      this._renderTradeProps();
    });

    // Game over
    document.getElementById('btn-play-again').addEventListener('click', () => {
      this.closeModal();
      if (typeof netplay !== 'undefined' && netplay.inOnlineGame) {
        netplay.endOnlineGame();
        netplay.showLobbyScreen();
      } else {
        document.getElementById('screen-game').classList.remove('active');
        document.getElementById('screen-lobby').classList.add('active');
      }
    });

    document.getElementById('btn-rematch').addEventListener('click', () => {
      if (typeof netplay !== 'undefined' && netplay.inOnlineGame) {
        netplay.rematchRoom();
      } else {
        // Local rematch: restart with same player config
        this.closeModal();
        this.game.initGame(
          this.game.players.map(p => ({ name: p.name, isAI: p.isAI, token: p.token })),
          { ...this.game.rules }
        );
        this.refresh();
      }
    });

    // Auction modal
    document.getElementById('btn-auction-bid').addEventListener('click', () => {
      if (!this.game.auctionData) return;
      const bidder = this.game.getCurrentAuctionBidder();
      if (!bidder) return;
      const input = document.getElementById('auction-bid-input');
      const amount = parseInt(input?.value || 0);
      this.game.submitBid(bidder.id, amount);
    });
    document.getElementById('btn-auction-pass').addEventListener('click', () => {
      if (!this.game.auctionData) return;
      const bidder = this.game.getCurrentAuctionBidder();
      if (bidder) this.game.passAuction(bidder.id);
    });

    // Close modal on backdrop
    document.querySelectorAll('.modal-backdrop').forEach(b => {
      b.addEventListener('click', (e) => {
        if (e.target === b) this.closeModal();
      });
    });
  }

  // ---- Refresh ----
  refresh() {
    const game = this.game;
    this.renderer.draw(game);
    this._updateDice();
    this._updatePlayers();
    this._updateButtons();
    this._updateStatus();
  }

  _updateDice() {
    const [d1, d2] = this.game.dice;
    const faces = ['', '⚀','⚁','⚂','⚃','⚄','⚅'];
    document.getElementById('die1').textContent = faces[d1];
    document.getElementById('die2').textContent = faces[d2];
  }

  _updatePlayers() {
    const container = document.getElementById('player-panels');
    container.innerHTML = '';
    const game = this.game;

    game.players.forEach((p, i) => {
      const isCurrent = i === game.currentPlayerIdx && !p.bankrupt;
      const div = document.createElement('div');
      div.className = `player-panel${p.bankrupt ? ' bankrupt' : ''}${isCurrent ? ' active' : ''}`;
      div.style.borderColor = PLAYER_COLORS[i];

      // Count owned properties
      const ownedCount = SPACES.filter(sp => {
        const prop = game.properties[sp.id];
        return prop && prop.owner === i;
      }).length;

      const s = game.stats[i];
      div.innerHTML = `
        <div class="player-header">
          <span class="player-token" style="color:${PLAYER_COLORS[i]}">${p.token || ['●','■','▲','◆'][i]}</span>
          <span class="player-name">${p.name}${p.isAI ? ' 🤖' : ''}</span>
          ${p.bankrupt ? '<span class="bankrupt-label">BANKRUPT</span>' : ''}
        </div>
        <div class="player-stats">
          <div class="stat"><span class="stat-label">Cash</span><span class="stat-val" style="color:#00ffcc">$${p.money.toLocaleString()}</span></div>
          <div class="stat"><span class="stat-label">Net Worth</span><span class="stat-val">$${game.netWorth(i).toLocaleString()}</span></div>
          <div class="stat"><span class="stat-label">Properties</span><span class="stat-val">${ownedCount}</span></div>
          ${s && s.rentCollected > 0 ? `<div class="stat"><span class="stat-label">Rent Earned</span><span class="stat-val" style="color:#00cc66">$${s.rentCollected.toLocaleString()}</span></div>` : ''}
          ${s && s.rentPaid > 0 ? `<div class="stat"><span class="stat-label">Rent Paid</span><span class="stat-val" style="color:#ff4488">$${s.rentPaid.toLocaleString()}</span></div>` : ''}
          ${p.inJail ? `<div class="stat" style="grid-column:1/-1"><span class="stat-label jail-label">🔒 Jail — turn ${p.jailTurns + 1}/${MAX_JAIL_TURNS}</span></div>` : ''}
          ${p.jailFreeCards > 0 ? `<div class="stat"><span class="stat-label">🃏 Get Out Free ×${p.jailFreeCards}</span></div>` : ''}
        </div>
        <div class="player-space">@ ${SPACES[p.position].name}</div>
      `;
      container.appendChild(div);
    });
  }

  _updateButtons() {
    const game = this.game;
    const p = game.currentPlayer;
    const isHuman = p && !p.isAI;
    const isRoll = game.state === STATE.ROLL_DICE;
    const isActions = game.state === STATE.PLAYER_ACTIONS;
    const isInJail = p && p.inJail;

    // In online game, only allow controls when it's our turn
    const myTurn = typeof netplay !== 'undefined' ? netplay.isMyTurn() : true;
    const canAct = isHuman && myTurn;

    document.getElementById('btn-roll').disabled = !(isRoll && canAct);
    document.getElementById('btn-end-turn').disabled = !(isActions && canAct);
    document.getElementById('btn-manage').disabled = !(isActions && canAct);
    document.getElementById('btn-trade').disabled = !(isActions && canAct && game.players.filter(pl => !pl.bankrupt).length > 1);

    const jailRow = document.getElementById('jail-actions');
    if (isRoll && isInJail && canAct) {
      jailRow.style.display = 'flex';
      document.getElementById('btn-pay-jail').disabled = p.money < 50;
      document.getElementById('btn-jail-card').disabled = p.jailFreeCards <= 0;
    } else {
      jailRow.style.display = 'none';
    }

    // Update waiting overlay if online
    if (typeof netplay !== 'undefined' && netplay.inOnlineGame) {
      const overlay = document.getElementById('waiting-overlay');
      if (overlay) {
        if (!myTurn && game.state !== STATE.GAME_OVER) {
          const cp = game.currentPlayer;
          const name = cp ? cp.name : '...';
          const textEl = overlay.querySelector('.waiting-text');
          if (textEl) textEl.textContent = `Waiting for ${name}...`;
          overlay.classList.add('active');
        } else {
          overlay.classList.remove('active');
        }
      }
    }
  }

  _updateStatus() {
    const game = this.game;
    const p = game.currentPlayer;
    let statusText = '';
    if (game.state === STATE.GAME_OVER) {
      statusText = `🏆 Game Over!`;
    } else if (p) {
      const stateLabels = {
        [STATE.ROLL_DICE]: p.inJail ? '🔒 In Jail — Roll or pay to escape' : '🎲 Roll the dice',
        [STATE.MOVING]: '🏃 Moving...',
        [STATE.LAND_RESOLVE]: '⚡ Resolving...',
        [STATE.BUY_OFFER]: '🏠 Buy property?',
        [STATE.CARD_EFFECT]: '🃏 Card drawn!',
        [STATE.PLAYER_ACTIONS]: '💼 Manage your turn',
      };
      statusText = `${p.name}: ${stateLabels[game.state] || game.state}`;
    }
    document.getElementById('game-status').textContent = statusText;

    // Free parking pot
    document.getElementById('free-parking-amount').textContent = `Free Parking: $${game.freeParkingPot}`;
  }

  appendLog(msg) {
    const logEl = document.getElementById('game-log');
    const entry = document.createElement('div');
    // Color-code by event type
    let cls = 'log-entry';
    if (/🏆|wins the game/.test(msg))              cls += ' log-win';
    else if (/💀|bankrupt/.test(msg))              cls += ' log-bankrupt';
    else if (/pays.*rent|rent to/.test(msg))        cls += ' log-rent-out';
    else if (/collects.*rent|rent.*collect/.test(msg)) cls += ' log-rent-in';
    else if (/bought|wins.*for \$|builds|hotel|unmortgage/.test(msg)) cls += ' log-buy';
    else if (/mortgages/.test(msg))                 cls += ' log-mortgage';
    else if (/Jail|jail/.test(msg))                 cls += ' log-jail';
    else if (/draws:|🃏|Chance|Community/.test(msg)) cls += ' log-card';
    else if (/passed GO|passed go|collect \$200|GO!/.test(msg)) cls += ' log-go';
    else if (/rolls/.test(msg))                     cls += ' log-roll';
    else if (/Auction|auction|bids \$/.test(msg))   cls += ' log-auction';
    else if (/Trade:|trade/.test(msg))              cls += ' log-trade';
    entry.className = cls;
    entry.textContent = msg;
    logEl.insertBefore(entry, logEl.firstChild);
    while (logEl.children.length > 60) logEl.removeChild(logEl.lastChild);
  }

  // ---- Modals ----
  showModal(type, data) {
    this.closeModal();
    if (!type) return;

    if (type === 'buy') {
      this._showBuyModal(data);
    } else if (type === 'card') {
      this._showCardModal(data);
    } else if (type === 'manage') {
      this._showManageModal(data);
    } else if (type === 'trade') {
      this._showTradeModal(data);
    } else if (type === 'auction') {
      this._showAuctionModal(data);
    } else if (type === 'game_over') {
      this._showGameOverModal(data);
    }
  }

  closeModal() {
    document.querySelectorAll('.modal-backdrop').forEach(b => b.classList.remove('active'));
  }

  _showBuyModal(data) {
    const { player, space } = data;
    const el = document.getElementById('modal-buy');
    const canAfford = player.money >= space.price;

    el.querySelector('.modal-title').textContent = `Buy ${space.name}?`;
    el.querySelector('.modal-body').innerHTML = `
      <div class="property-card${space.color ? ' colored' : ''}" style="border-top: 12px solid ${space.color ? COLOR_MAP[space.color] : '#888'}">
        <div class="prop-name">${space.name}</div>
        <div class="prop-price">Price: <strong>$${space.price}</strong></div>
        <div class="prop-mortgage">Mortgage: $${space.mortgage || Math.floor(space.price/2)}</div>
        ${space.type === 'property' ? `
          <div class="prop-rents">
            <div>Rent: $${space.rent[0]}</div>
            <div>1 House: $${space.rent[1]}</div>
            <div>2 Houses: $${space.rent[2]}</div>
            <div>3 Houses: $${space.rent[3]}</div>
            <div>4 Houses: $${space.rent[4]}</div>
            <div>Hotel: $${space.rent[5]}</div>
          </div>
        ` : ''}
        ${space.type === 'railroad' ? '<div class="prop-rents"><div>1 RR: $25</div><div>2 RR: $50</div><div>3 RR: $100</div><div>4 RR: $200</div></div>' : ''}
        ${space.type === 'utility' ? '<div class="prop-rents"><div>1 Utility: 4× dice</div><div>2 Utilities: 10× dice</div></div>' : ''}
      </div>
      <p style="margin-top:12px">Your cash: <strong style="color:#00ffcc">$${player.money}</strong></p>
      ${!canAfford ? '<p style="color:#ff4488">⚠ You cannot afford this property!</p>' : ''}
    `;
    document.getElementById('btn-buy-confirm').disabled = !canAfford || player.isAI;
    document.getElementById('btn-buy-skip').disabled = player.isAI;
    document.getElementById('modal-buy').closest('.modal-backdrop').classList.add('active');
  }

  _showCardModal(data) {
    const { player, card } = data;
    const el = document.getElementById('modal-card');
    const isChance = CHANCE_CARDS.includes(card);
    el.querySelector('.modal-title').textContent = isChance ? '🃏 Chance!' : '📦 Community Chest!';
    el.querySelector('.modal-body').innerHTML = `
      <div class="card-text">${card.text}</div>
    `;
    document.getElementById('btn-card-ok').disabled = player.isAI;
    el.closest('.modal-backdrop').classList.add('active');
  }

  _showManageModal(data) {
    const { player } = data;
    const game = this.game;
    const el = document.getElementById('modal-manage');
    el.querySelector('.modal-title').textContent = `Manage Properties — ${player.name}`;

    const owned = SPACES.filter(sp => {
      const prop = game.properties[sp.id];
      return prop && prop.owner === player.id;
    });

    let html = '<div class="manage-list">';
    if (owned.length === 0) {
      html += '<p style="color:#888">You own no properties yet.</p>';
    }
    owned.forEach(sp => {
      const prop = game.properties[sp.id];
      const colorStyle = sp.color ? `style="background:${COLOR_MAP[sp.color]}"` : '';
      const canBuild = game.canBuildHouse(player.id, sp.id);
      const canSell = game.canSellHouse(player.id, sp.id);
      const canMortgage = game.canMortgage(player.id, sp.id);
      const canUnmortgage = game.canUnmortgage(player.id, sp.id);

      html += `<div class="manage-item${prop.mortgaged ? ' mortgaged' : ''}">
        <div class="manage-item-header">
          ${sp.color ? `<span class="color-dot" ${colorStyle}></span>` : ''}
          <span class="manage-item-name">${sp.name}</span>
          ${prop.mortgaged ? '<span class="badge-mort">MORTGAGED</span>' : ''}
          ${prop.hotel ? '<span class="badge-hotel">🏨</span>' : prop.houses > 0 ? `<span class="badge-house">${'🏠'.repeat(prop.houses)}</span>` : ''}
        </div>
        <div class="manage-item-actions">
          ${canBuild ? `<button class="btn-sm btn-green" onclick="ui._manageBuild(${sp.id})">Build ${prop.houses >= 4 ? 'Hotel' : 'House'} ($${sp.houseCost})</button>` : ''}
          ${canSell ? `<button class="btn-sm btn-red" onclick="ui._manageSell(${sp.id})">Sell Building</button>` : ''}
          ${canMortgage ? `<button class="btn-sm btn-orange" onclick="ui._manageMortgage(${sp.id})">Mortgage ($${sp.mortgage})</button>` : ''}
          ${canUnmortgage ? `<button class="btn-sm btn-teal" onclick="ui._manageUnmortgage(${sp.id})">Unmortgage ($${Math.floor(sp.mortgage*1.1)})</button>` : ''}
        </div>
      </div>`;
    });
    html += '</div>';
    el.querySelector('.modal-body').innerHTML = html;
    el.closest('.modal-backdrop').classList.add('active');
  }

  _manageBuild(spaceId) {
    this.game.buildHouse(this.game.currentPlayerIdx, spaceId);
    this._showManageModal({ player: this.game.currentPlayer });
  }

  _manageSell(spaceId) {
    this.game.sellHouse(this.game.currentPlayerIdx, spaceId);
    this._showManageModal({ player: this.game.currentPlayer });
  }

  _manageMortgage(spaceId) {
    this.game.mortgage(this.game.currentPlayerIdx, spaceId);
    this._showManageModal({ player: this.game.currentPlayer });
  }

  _manageUnmortgage(spaceId) {
    this.game.unmortgage(this.game.currentPlayerIdx, spaceId);
    this._showManageModal({ player: this.game.currentPlayer });
  }

  _showTradeModal(data) {
    const { player } = data;
    const game = this.game;
    const others = game.players.filter(p => !p.bankrupt && p.id !== player.id);

    const el = document.getElementById('modal-trade');
    el.querySelector('.modal-title').textContent = `Trade — ${player.name}`;

    const sel = document.getElementById('select-trade-target');
    sel.innerHTML = '<option value="">Select player...</option>';
    others.forEach(p => {
      sel.innerHTML += `<option value="${p.id}">${p.name}</option>`;
    });

    this.tradeState = { toId: null, fromProps: [], toProps: [], fromMoney: 0, toMoney: 0 };
    document.getElementById('trade-props-area').innerHTML = '<p style="color:#888">Select a player to trade with.</p>';
    el.closest('.modal-backdrop').classList.add('active');
  }

  _renderTradeProps() {
    const game = this.game;
    const fromPlayer = game.currentPlayer;
    const toId = this.tradeState.toId;
    if (toId === null) return;
    const toPlayer = game.players[toId];

    const getProps = (pid) => SPACES.filter(sp => {
      const prop = game.properties[sp.id];
      return prop && prop.owner === pid && !prop.mortgaged && sp.price;
    });

    const fromProps = getProps(fromPlayer.id);
    const toProps = getProps(toId);

    let html = `
      <div class="trade-columns">
        <div class="trade-col">
          <h4 style="color:${PLAYER_COLORS[fromPlayer.id]}">${fromPlayer.name} offers:</h4>
          <div class="trade-money">
            Cash: $<input type="number" id="trade-from-money" min="0" max="${fromPlayer.money}" value="0" style="width:80px">
          </div>
          <div class="trade-props-list">
          ${fromProps.map(sp => `
            <label class="trade-prop-label">
              <input type="checkbox" class="from-prop-check" data-id="${sp.id}">
              <span class="color-dot" style="background:${sp.color ? COLOR_MAP[sp.color] : '#888'}"></span>
              ${sp.name} ($${sp.price})
            </label>
          `).join('')}
          ${fromProps.length === 0 ? '<p style="color:#888">No properties</p>' : ''}
          </div>
        </div>
        <div class="trade-col">
          <h4 style="color:${PLAYER_COLORS[toId]}">${toPlayer.name} offers:</h4>
          <div class="trade-money">
            Cash: $<input type="number" id="trade-to-money" min="0" max="${toPlayer.money}" value="0" style="width:80px">
          </div>
          <div class="trade-props-list">
          ${toProps.map(sp => `
            <label class="trade-prop-label">
              <input type="checkbox" class="to-prop-check" data-id="${sp.id}">
              <span class="color-dot" style="background:${sp.color ? COLOR_MAP[sp.color] : '#888'}"></span>
              ${sp.name} ($${sp.price})
            </label>
          `).join('')}
          ${toProps.length === 0 ? '<p style="color:#888">No properties</p>' : ''}
          </div>
        </div>
      </div>
    `;
    document.getElementById('trade-props-area').innerHTML = html;
  }

  _confirmTrade() {
    const game = this.game;
    const fromPlayer = game.currentPlayer;
    const toId = this.tradeState.toId !== null ? this.tradeState.toId :
      parseInt(document.getElementById('select-trade-target').value);

    if (isNaN(toId) || toId === null) { alert('Select a player!'); return; }

    const fromMoney = parseInt(document.getElementById('trade-from-money')?.value || 0);
    const toMoney = parseInt(document.getElementById('trade-to-money')?.value || 0);
    const fromProps = [...document.querySelectorAll('.from-prop-check:checked')].map(c => parseInt(c.dataset.id));
    const toProps = [...document.querySelectorAll('.to-prop-check:checked')].map(c => parseInt(c.dataset.id));

    if (fromMoney > fromPlayer.money) { alert('You don\'t have that much money!'); return; }
    if (toMoney > game.players[toId].money) { alert('That player doesn\'t have that much money!'); return; }

    game.proposeTrade(fromPlayer.id, toId, fromMoney, toMoney, fromProps, toProps);
    this.closeModal();
  }

  _showAuctionModal(data) {
    const { spaceId, auctionData: ad } = data;
    const sp = SPACES[spaceId];
    const game = this.game;
    const bidder = game.getCurrentAuctionBidder();
    const isOnline = typeof netplay !== 'undefined' && netplay.inOnlineGame;
    const myIdx = isOnline ? netplay.myPlayerIdx : (game.currentPlayerIdx);
    const isMyBid = bidder && !bidder.isAI && bidder.id === myIdx;

    const el = document.getElementById('modal-auction');
    el.querySelector('.modal-body').innerHTML = `
      <div class="auction-prop-header">
        <span class="auction-flag">${sp.flag || '🏢'}</span>
        <div>
          <div class="auction-prop-name">${sp.name}</div>
          ${sp.color ? `<div class="auction-color-bar" style="background:${COLOR_MAP[sp.color]}"></div>` : ''}
          <div class="auction-prop-sub">Listed price: $${sp.price}</div>
        </div>
      </div>
      <div class="auction-bid-display">
        <div class="auction-bid-label">CURRENT HIGH BID</div>
        <div class="auction-bid-amount">${ad.highestBid > 0 ? '$' + ad.highestBid : 'No bids yet'}</div>
        ${ad.highestBidder !== null ? `<div class="auction-bid-by">by ${game.players[ad.highestBidder].name}</div>` : ''}
      </div>
      <div class="auction-bidder-row">
        Now bidding: <strong style="color:#00ffcc">${bidder ? bidder.name : '—'}</strong>
      </div>
      ${isMyBid ? `
        <div class="auction-input-row">
          <span>$</span>
          <input type="number" id="auction-bid-input" class="auth-input"
            style="width:110px"
            min="${ad.highestBid + 1}" max="${game.players[bidder.id].money}"
            value="${Math.min(ad.highestBid + 10, game.players[bidder.id].money)}">
          <span class="auction-cash-label">/ $${game.players[bidder.id].money} cash</span>
        </div>
      ` : `<div style="color:var(--text-dim);font-size:12px;margin-bottom:8px">Waiting for ${bidder ? bidder.name : '—'} to bid...</div>`}
      <div class="auction-chips">
        ${ad.bidOrder.map(pid => {
          const p = game.players[pid];
          const passed = ad.passed.includes(pid);
          const isCurrent = pid === ad.currentBidderId;
          const isHigh = pid === ad.highestBidder;
          return `<span class="auction-chip${passed ? ' chip-out' : ''}${isCurrent ? ' chip-current' : ''}${isHigh ? ' chip-high' : ''}">
            ${p.name}${passed ? ' ✕' : isCurrent ? ' 💬' : isHigh ? ' ★' : ''}
          </span>`;
        }).join('')}
      </div>
    `;

    document.getElementById('btn-auction-bid').disabled = !isMyBid;
    document.getElementById('btn-auction-pass').disabled = !isMyBid;
    document.getElementById('backdrop-auction').classList.add('active');
  }

  _showGameOverModal(data) {
    const { winner } = data;
    const el = document.getElementById('modal-gameover');
    el.querySelector('.modal-title').textContent = `🏆 ${winner.name} Wins!`;
    // Show rematch button always (local games get instant rematch, online games send socket event)
    const rematchBtn = document.getElementById('btn-rematch');
    if (rematchBtn) rematchBtn.style.display = 'block';
    el.querySelector('.modal-body').innerHTML = `
      <div class="winner-display">
        <div class="winner-token" style="color:${PLAYER_COLORS[winner.id]}">${['●','■','▲','◆'][winner.id]}</div>
        <div class="winner-name">${winner.name}</div>
        <div class="winner-stats">
          <div>Final Cash: <strong style="color:#00ffcc">$${winner.money.toLocaleString()}</strong></div>
          <div>Net Worth: <strong style="color:#ffcc00">$${this.game.netWorth(winner.id).toLocaleString()}</strong></div>
        </div>
      </div>
      <div class="final-standings">
        <h4>Final Standings</h4>
        ${this.game.players.map((p, i) => `
          <div class="standing-row" style="color:${PLAYER_COLORS[i]}">
            ${p.bankrupt ? '💀' : '🏆'} ${p.name}: $${this.game.netWorth(i).toLocaleString()} net worth
          </div>
        `).join('')}
      </div>
    `;
    el.closest('.modal-backdrop').classList.add('active');
  }
}
