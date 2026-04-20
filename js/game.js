// Core game engine for Capitalism.io

const STARTING_MONEY = 1500;
const GO_BONUS = 200;
const JAIL_POSITION = 10;
const JAIL_FINE = 50;
const MAX_HOUSES_PER_PROPERTY = 4;
const MAX_JAIL_TURNS = 3;

// Game states
const STATE = {
  SETUP:          'setup',
  ROLL_DICE:      'roll_dice',
  MOVING:         'moving',
  LAND_RESOLVE:   'land_resolve',
  BUY_OFFER:      'buy_offer',
  CARD_EFFECT:    'card_effect',
  PLAYER_ACTIONS: 'player_actions',
  GAME_OVER:      'game_over',
  AUCTION:        'auction',
};

class Game {
  constructor() {
    this.players = [];
    this.properties = {}; // spaceId -> { owner, houses, hotel, mortgaged }
    this.state = STATE.SETUP;
    this.currentPlayerIdx = 0;
    this.doublesCount = 0;
    this.dice = [1, 1];
    this.log = [];
    this.chanceDeck = [];
    this.communityChestDeck = [];
    this.freeParkingPot = 0;
    this.jailFreeCards = {}; // playerId -> count
    this.pendingCard = null;
    this.lastDiceRoll = null;
    this._onUpdateFn = () => {};
    this._wrappedUpdate = () => {};
    this.onLog = () => {};
    this.onModal = () => {};
    this.winner = null;
    this.rules = { startingMoney: 1500, freeParkingJackpot: true, doubleSalaryOnGO: false, noRentInJail: false };
    this.stats = {}; // playerId -> { propertiesBought, rentPaid, rentCollected, turnsInJail }
    this.auctionData = null;
    this._animating = false;
  }

  // Wrap onUpdate so netplay sync fires automatically after every UI refresh
  get onUpdate() {
    return this._wrappedUpdate;
  }
  set onUpdate(fn) {
    this._onUpdateFn = fn;
    this._wrappedUpdate = () => {
      fn();
      if (!this._animating && typeof netplay !== 'undefined' && netplay.inOnlineGame) {
        netplay.syncState(this.serialize());
      }
    };
  }

  // ---- Initialization ----
  initGame(playerConfigs, rules = {}) {
    this.rules = { startingMoney: 1500, freeParkingJackpot: true, doubleSalaryOnGO: false, noRentInJail: false, ...rules };

    this.players = playerConfigs.map((cfg, i) => ({
      id: i,
      name: cfg.name,
      isAI: cfg.isAI,
      money: this.rules.startingMoney,
      position: 0,
      inJail: false,
      jailTurns: 0,
      bankrupt: false,
      jailFreeCards: 0,
    }));

    // Init stats for each player
    this.stats = {};
    this.players.forEach(p => {
      this.stats[p.id] = { propertiesBought: 0, rentPaid: 0, rentCollected: 0, turnsInJail: 0 };
    });

    this.properties = {};
    SPACES.forEach(sp => {
      if (sp.type === 'property' || sp.type === 'railroad' || sp.type === 'utility') {
        this.properties[sp.id] = { owner: null, houses: 0, hotel: false, mortgaged: false };
      }
    });

    this.chanceDeck = shuffle([...CHANCE_CARDS]);
    this.communityChestDeck = shuffle([...COMMUNITY_CHEST_CARDS]);
    this.freeParkingPot = 0;
    this.doublesCount = 0;
    this.state = STATE.ROLL_DICE;
    this.currentPlayerIdx = 0;
    this.log = [];
    this.winner = null;
    this.lastDiceRoll = null;

    this.addLog(`🎮 Game started! ${this.players.map(p=>p.name).join(', ')} are playing.`);
    this.onUpdate();

    // If first player is AI, trigger AI action
    this._maybeAI();
  }

  get currentPlayer() {
    return this.players[this.currentPlayerIdx];
  }

  addLog(msg) {
    this.log.unshift(msg);
    if (this.log.length > 80) this.log.pop();
    this.onLog(msg);
  }

  // ---- Dice ----
  rollDice() {
    if (this.state !== STATE.ROLL_DICE) return;
    if (typeof Sounds !== 'undefined') Sounds.dice();
    const d1 = Math.ceil(Math.random() * 6);
    const d2 = Math.ceil(Math.random() * 6);
    this.dice = [d1, d2];
    this.lastDiceRoll = d1 + d2;
    const doubles = d1 === d2;

    const p = this.currentPlayer;
    this.addLog(`${p.name} rolls ${d1}+${d2}=${d1+d2}${doubles ? ' (doubles!)' : ''}`);

    if (p.inJail) {
      this._handleJailRoll(d1, d2, doubles);
      return;
    }

    if (doubles) {
      this.doublesCount++;
      if (this.doublesCount >= 3) {
        this.addLog(`${p.name} rolled doubles 3 times — Go to Jail!`);
        this.doublesCount = 0;
        this._goToJail(p);
        this.state = STATE.PLAYER_ACTIONS;
        this.onUpdate();
        setTimeout(() => this._endTurnOrContinue(false), 800);
        return;
      }
    } else {
      this.doublesCount = 0;
    }

    this.state = STATE.MOVING;
    this.onUpdate();
    this._movePlayer(p, d1 + d2, doubles);
  }

  _handleJailRoll(d1, d2, doubles) {
    const p = this.currentPlayer;
    if (doubles) {
      p.inJail = false;
      p.jailTurns = 0;
      this.addLog(`${p.name} rolled doubles and is free from jail!`);
      this.state = STATE.MOVING;
      this.onUpdate();
      this._movePlayer(p, d1 + d2, false); // doubles from jail don't give another turn
    } else {
      p.jailTurns++;
      if (p.jailTurns >= MAX_JAIL_TURNS) {
        this.addLog(`${p.name} must pay $${JAIL_FINE} to leave jail.`);
        this._charge(p, JAIL_FINE, null);
        p.inJail = false;
        p.jailTurns = 0;
        this.state = STATE.MOVING;
        this.onUpdate();
        this._movePlayer(p, d1 + d2, false);
      } else {
        this.addLog(`${p.name} stays in jail (turn ${p.jailTurns}/${MAX_JAIL_TURNS}).`);
        this.state = STATE.PLAYER_ACTIONS;
        this.onUpdate();
        setTimeout(() => this._endTurnOrContinue(false), 600);
      }
    }
  }

  _movePlayer(player, steps, rolledDoubles) {
    const oldPos = player.position;
    // animation handled by renderer/ui, then _onMoveDone called
    this.onUpdate();
    // We'll call _onMoveDone after animation
    this._pendingDoubles = rolledDoubles;
    this._animateMove(player, steps, () => {
      this._onMoveDone(player, oldPos);
    });
  }

  _animateMove(player, steps, done) {
    this._animating = true;
    let remaining = steps;
    const advance = () => {
      if (remaining <= 0) { this._animating = false; done(); return; }
      const oldPos = player.position;
      player.position = (player.position + 1) % 40;
      if (player.position === 0) {
        // Passed GO
        this._collectGo(player);
      }
      remaining--;
      this.onUpdate();
      setTimeout(advance, 130);
    };
    advance();
  }

  _collectGo(player) {
    const bonus = this.rules.doubleSalaryOnGO ? GO_BONUS * 2 : GO_BONUS;
    player.money += bonus;
    this.addLog(`${player.name} passed GO — collect $${bonus}!`);
    if (typeof Sounds !== 'undefined') Sounds.goBonus();
  }

  _onMoveDone(player, fromPos) {
    const spaceId = player.position;
    const sp = SPACES[spaceId];
    this.state = STATE.LAND_RESOLVE;
    this.addLog(`${player.name} landed on ${sp.name}.`);
    this._resolveLanding(player, sp);
  }

  _resolveLanding(player, sp) {
    if (sp.type === 'go') {
      // Extra $200 for landing exactly on GO
      const goBonus = this.rules.doubleSalaryOnGO ? GO_BONUS * 2 : GO_BONUS;
      player.money += goBonus;
      this.addLog(`${player.name} landed on GO! Collect $${goBonus}.`);
      if (typeof Sounds !== 'undefined') Sounds.goBonus();
      this._goToPlayerActions();
    } else if (sp.type === 'go_to_jail') {
      this._goToJail(player);
      this._goToPlayerActions();
    } else if (sp.type === 'jail') {
      this.addLog(`${player.name} is just visiting jail.`);
      this._goToPlayerActions();
    } else if (sp.type === 'free_parking') {
      if (this.freeParkingPot > 0) {
        this.addLog(`${player.name} collects Free Parking jackpot: $${this.freeParkingPot}!`);
        player.money += this.freeParkingPot;
        this.freeParkingPot = 0;
      } else {
        this.addLog(`${player.name} enjoys free parking.`);
      }
      this._goToPlayerActions();
    } else if (sp.type === 'tax') {
      this.addLog(`${player.name} pays ${sp.name}: $${sp.amount}.`);
      this._charge(player, sp.amount, null, true);
      if (!this._checkBankruptcy(player, null)) {
        this._goToPlayerActions();
      }
    } else if (sp.type === 'chance') {
      this._drawCard(player, 'chance');
    } else if (sp.type === 'community_chest') {
      this._drawCard(player, 'community_chest');
    } else if (sp.type === 'property' || sp.type === 'railroad' || sp.type === 'utility') {
      const prop = this.properties[sp.id];
      if (prop.owner === null) {
        // Offer to buy
        this._offerBuy(player, sp);
      } else if (prop.owner === player.id) {
        this.addLog(`${player.name} owns this property.`);
        this._goToPlayerActions();
      } else if (prop.mortgaged) {
        this.addLog(`${sp.name} is mortgaged — no rent due.`);
        this._goToPlayerActions();
      } else {
        this._chargeRent(player, sp, prop);
      }
    } else {
      this._goToPlayerActions();
    }
  }

  _offerBuy(player, sp) {
    this.state = STATE.BUY_OFFER;
    this.onModal('buy', { player, space: sp });
    if (player.isAI) {
      // AI decides after brief delay
      setTimeout(() => this._aiDecideBuy(player, sp), 600);
    }
  }

  buyProperty(player, sp) {
    if (player.money < sp.price) {
      this.addLog(`${player.name} can't afford ${sp.name}.`);
      this._goToPlayerActions();
      return;
    }
    player.money -= sp.price;
    this.properties[sp.id].owner = player.id;
    if (this.stats[player.id]) this.stats[player.id].propertiesBought++;
    this.addLog(`${player.name} bought ${sp.name} for $${sp.price}.`);
    if (typeof Sounds !== 'undefined') Sounds.buy();
    this._goToPlayerActions();
  }

  skipBuy(player) {
    const sp = SPACES[player.position];
    this.addLog(`${player.name} passes on ${sp.name} — going to auction!`);
    this._startAuction(player.position);
  }

  // ---- Auction ----
  _startAuction(spaceId) {
    const sp = SPACES[spaceId];
    // Bid order: start from player after current, include all active players (current player bids last)
    const bidOrder = [];
    let idx = (this.currentPlayerIdx + 1) % this.players.length;
    for (let i = 0; i < this.players.length; i++) {
      if (!this.players[idx].bankrupt) bidOrder.push(this.players[idx].id);
      idx = (idx + 1) % this.players.length;
    }
    this.state = STATE.AUCTION;
    this.auctionData = {
      spaceId,
      highestBid: 0,
      highestBidder: null,
      passed: [],
      bidOrder,
      currentBidderId: bidOrder[0],
    };
    this.addLog(`🔨 Auction for ${sp.name}! Minimum bid: $1`);
    this.onUpdate();
    this.onModal('auction', { spaceId, auctionData: this.auctionData });
    this._maybeAIAuction();
  }

  getCurrentAuctionBidder() {
    return this.auctionData ? (this.players[this.auctionData.currentBidderId] || null) : null;
  }

  submitBid(playerId, amount) {
    if (this.state !== STATE.AUCTION || !this.auctionData) return;
    const ad = this.auctionData;
    if (ad.currentBidderId !== playerId) return;
    const player = this.players[playerId];
    const sp = SPACES[ad.spaceId];
    if (amount <= ad.highestBid || amount < 1 || amount > player.money) {
      this.addLog(`${player.name}: invalid bid amount.`); return;
    }
    ad.highestBid = amount;
    ad.highestBidder = playerId;
    this.addLog(`${player.name} bids $${amount} on ${sp.name}.`);
    this._advanceAuction(playerId, false);
  }

  passAuction(playerId) {
    if (this.state !== STATE.AUCTION || !this.auctionData) return;
    const ad = this.auctionData;
    if (ad.currentBidderId !== playerId) return;
    if (!ad.passed.includes(playerId)) ad.passed.push(playerId);
    this.addLog(`${this.players[playerId].name} passes the auction.`);
    this._advanceAuction(playerId, true);
  }

  _advanceAuction(fromId, justPassed) {
    const ad = this.auctionData;
    const remaining = ad.bidOrder.filter(pid => !ad.passed.includes(pid));
    if (remaining.length <= 1) { this._resolveAuction(); return; }
    // Find next bidder in bidOrder skipping passed players
    const origIdx = ad.bidOrder.indexOf(fromId);
    let next = (origIdx + 1) % ad.bidOrder.length;
    while (ad.passed.includes(ad.bidOrder[next])) {
      next = (next + 1) % ad.bidOrder.length;
    }
    ad.currentBidderId = ad.bidOrder[next];
    this.onUpdate();
    this.onModal('auction', { spaceId: ad.spaceId, auctionData: ad });
    this._maybeAIAuction();
  }

  _resolveAuction() {
    const ad = this.auctionData;
    const sp = SPACES[ad.spaceId];
    if (ad.highestBidder !== null && ad.highestBid > 0) {
      const winner = this.players[ad.highestBidder];
      winner.money -= ad.highestBid;
      this.properties[ad.spaceId].owner = ad.highestBidder;
      if (this.stats[ad.highestBidder]) this.stats[ad.highestBidder].propertiesBought++;
      this.addLog(`🔨 ${winner.name} wins ${sp.name} for $${ad.highestBid}!`);
      if (typeof Sounds !== 'undefined') Sounds.buy();
    } else {
      this.addLog(`🔨 No bids — ${sp.name} goes unsold.`);
    }
    this.auctionData = null;
    this.onModal(null);
    this._goToPlayerActions();
  }

  _maybeAIAuction() {
    if (!this.auctionData || this.state !== STATE.AUCTION) return;
    const bidder = this.getCurrentAuctionBidder();
    if (!bidder || !bidder.isAI) return;
    setTimeout(() => {
      if (!this.auctionData) return;
      const ad = this.auctionData;
      const sp = SPACES[ad.spaceId];
      const b = this.getCurrentAuctionBidder();
      if (!b || !b.isAI) return;
      const maxBid = Math.floor(sp.price * 0.7);
      const nextBid = Math.max(ad.highestBid + 10, 1);
      if (nextBid <= maxBid && b.money >= nextBid) {
        this.submitBid(b.id, nextBid);
      } else {
        this.passAuction(b.id);
      }
    }, 700);
  }

  _chargeRent(player, sp, prop) {
    const owner = this.players[prop.owner];

    // No rent while owner is in jail rule
    if (this.rules.noRentInJail && owner.inJail) {
      this.addLog(`${sp.name} — no rent (owner in jail).`);
      this._goToPlayerActions();
      return;
    }

    let rent = 0;

    if (sp.type === 'railroad') {
      const railrooadsOwned = RAILROAD_IDS.filter(rid => this.properties[rid].owner === prop.owner).length;
      rent = 25 * Math.pow(2, railrooadsOwned - 1);
    } else if (sp.type === 'utility') {
      const utilitiesOwned = UTILITY_IDS.filter(uid => this.properties[uid].owner === prop.owner).length;
      const mult = utilitiesOwned === 2 ? 10 : 4;
      rent = this.lastDiceRoll * mult;
    } else {
      // Property
      const hasMonopoly = this._hasMonopoly(prop.owner, sp.group);
      const houses = prop.houses;
      const hotel = prop.hotel;
      if (hotel) {
        rent = sp.rent[5];
      } else if (houses > 0) {
        rent = sp.rent[houses];
      } else if (hasMonopoly) {
        rent = sp.rent[0] * 2; // double rent with monopoly
      } else {
        rent = sp.rent[0];
      }
    }

    this.addLog(`${player.name} pays $${rent} rent to ${owner.name} for ${sp.name}.`);

    // Track stats
    if (this.stats[player.id]) this.stats[player.id].rentPaid += rent;
    if (this.stats[owner.id]) this.stats[owner.id].rentCollected += rent;

    if (typeof Sounds !== 'undefined') Sounds.rent();

    this._charge(player, rent, owner);
    if (!this._checkBankruptcy(player, owner)) {
      this._goToPlayerActions();
    }
  }

  _charge(player, amount, recipient, toFreeParking = false) {
    player.money -= amount;
    if (recipient) {
      recipient.money += amount;
    } else if (toFreeParking) {
      this.freeParkingPot += amount;
    }
  }

  _hasMonopoly(playerId, group) {
    const groupSpaces = SPACES.filter(s => s.type === 'property' && s.group === group);
    return groupSpaces.every(s => this.properties[s.id] && this.properties[s.id].owner === playerId);
  }

  _goToJail(player) {
    player.position = JAIL_POSITION;
    player.inJail = true;
    player.jailTurns = 0;
    this.addLog(`${player.name} goes to Jail!`);
    this.doublesCount = 0;
    this.onUpdate();
  }

  _goToPlayerActions() {
    this.state = STATE.PLAYER_ACTIONS;
    this.onUpdate();
    if (this.currentPlayer.isAI) {
      setTimeout(() => this._runAIActions(), 400);
    }
  }

  // ---- Cards ----
  _drawCard(player, deck) {
    let card;
    if (deck === 'chance') {
      if (this.chanceDeck.length === 0) this.chanceDeck = shuffle([...CHANCE_CARDS]);
      card = this.chanceDeck.pop();
    } else {
      if (this.communityChestDeck.length === 0) this.communityChestDeck = shuffle([...COMMUNITY_CHEST_CARDS]);
      card = this.communityChestDeck.pop();
    }

    this.pendingCard = card;
    this.addLog(`${player.name} draws: "${card.text}"`);
    if (typeof Sounds !== 'undefined') Sounds.card();
    this.state = STATE.CARD_EFFECT;
    this.onModal('card', { player, card });

    if (player.isAI) {
      setTimeout(() => this.resolveCard(player, card), 1200);
    }
  }

  resolveCard(player, card) {
    this.onModal(null); // close card modal

    if (card.type === 'move') {
      const target = card.target;
      const passGo = card.passGo && target < player.position;
      player.position = target;
      if (passGo || (card.passGo && target <= player.position - 1)) {
        // Recalculate: if target < current pos, they passed go (unless it's a backward move like go back 3)
        if (target < player.position || target === 0) {
          player.money += GO_BONUS;
          this.addLog(`${player.name} passed GO — collect $${GO_BONUS}!`);
        }
      }
      this.onUpdate();
      const sp = SPACES[target];
      this._resolveLanding(player, sp);
    } else if (card.type === 'move_back') {
      player.position = ((player.position - card.steps) + 40) % 40;
      this.onUpdate();
      const sp = SPACES[player.position];
      this.addLog(`${player.name} moves back to ${sp.name}.`);
      this._resolveLanding(player, sp);
    } else if (card.type === 'go_to_jail') {
      this._goToJail(player);
      this._goToPlayerActions();
    } else if (card.type === 'collect') {
      player.money += card.amount;
      this.addLog(`${player.name} collects $${card.amount}.`);
      this._goToPlayerActions();
    } else if (card.type === 'pay') {
      this.addLog(`${player.name} pays $${card.amount}.`);
      this._charge(player, card.amount, null, true);
      if (!this._checkBankruptcy(player, null)) this._goToPlayerActions();
    } else if (card.type === 'collect_each') {
      let total = 0;
      this.players.forEach(p => {
        if (p.id !== player.id && !p.bankrupt) {
          const amt = Math.min(card.amount, p.money);
          p.money -= amt;
          player.money += amt;
          total += amt;
        }
      });
      this.addLog(`${player.name} collects $${card.amount} from each player ($${total} total).`);
      this._goToPlayerActions();
    } else if (card.type === 'pay_each') {
      let total = 0;
      this.players.forEach(p => {
        if (p.id !== player.id && !p.bankrupt) {
          const amt = Math.min(card.amount, player.money);
          player.money -= amt;
          p.money += amt;
          total += amt;
        }
      });
      this.addLog(`${player.name} pays $${card.amount} to each player ($${total} total).`);
      if (!this._checkBankruptcy(player, null)) this._goToPlayerActions();
    } else if (card.type === 'jail_free') {
      player.jailFreeCards++;
      this.addLog(`${player.name} keeps a Get Out of Jail Free card.`);
      this._goToPlayerActions();
    } else if (card.type === 'repairs') {
      let total = 0;
      SPACES.forEach(sp => {
        if (sp.type === 'property') {
          const prop = this.properties[sp.id];
          if (prop && prop.owner === player.id) {
            if (prop.hotel) total += card.perHotel;
            else total += prop.houses * card.perHouse;
          }
        }
      });
      this.addLog(`${player.name} pays $${total} for repairs.`);
      this._charge(player, total, null, true);
      if (!this._checkBankruptcy(player, null)) this._goToPlayerActions();
    } else if (card.type === 'nearest_railroad') {
      const rrs = RAILROAD_IDS.sort((a,b) => a-b);
      const pos = player.position;
      let nearest = rrs.find(r => r > pos) || rrs[0];
      const passedGo = nearest < pos;
      if (passedGo) {
        player.money += GO_BONUS;
        this.addLog(`${player.name} passed GO — collect $${GO_BONUS}!`);
      }
      player.position = nearest;
      this.onUpdate();
      const sp = SPACES[nearest];
      const prop = this.properties[nearest];
      if (prop && prop.owner !== null && prop.owner !== player.id && !prop.mortgaged) {
        const owner = this.players[prop.owner];
        const railrooadsOwned = RAILROAD_IDS.filter(rid => this.properties[rid].owner === prop.owner).length;
        const rent = 25 * Math.pow(2, railrooadsOwned - 1) * card.multiplier;
        this.addLog(`${player.name} pays $${rent} rent to ${owner.name} (2x railroad).`);
        this._charge(player, rent, owner);
        if (!this._checkBankruptcy(player, owner)) this._goToPlayerActions();
      } else if (prop && prop.owner === null) {
        this._offerBuy(player, sp);
      } else {
        this._goToPlayerActions();
      }
    } else if (card.type === 'nearest_utility') {
      const utils = UTILITY_IDS.sort((a,b) => a-b);
      const pos = player.position;
      let nearest = utils.find(u => u > pos) || utils[0];
      const passedGo = nearest < pos;
      if (passedGo) {
        player.money += GO_BONUS;
        this.addLog(`${player.name} passed GO — collect $${GO_BONUS}!`);
      }
      player.position = nearest;
      this.onUpdate();
      const sp = SPACES[nearest];
      const prop = this.properties[nearest];
      if (prop && prop.owner !== null && prop.owner !== player.id && !prop.mortgaged) {
        const owner = this.players[prop.owner];
        const rent = this.lastDiceRoll * 10;
        this.addLog(`${player.name} pays $${rent} (10x dice) to ${owner.name} for utility.`);
        this._charge(player, rent, owner);
        if (!this._checkBankruptcy(player, owner)) this._goToPlayerActions();
      } else if (prop && prop.owner === null) {
        this._offerBuy(player, sp);
      } else {
        this._goToPlayerActions();
      }
    } else {
      this._goToPlayerActions();
    }
  }

  // ---- Jail Actions ----
  payJailFine(player) {
    if (player.money < JAIL_FINE) return;
    this._charge(player, JAIL_FINE, null, true);
    player.inJail = false;
    player.jailTurns = 0;
    this.addLog(`${player.name} pays $${JAIL_FINE} to leave jail.`);
    this.state = STATE.ROLL_DICE;
    this.onUpdate();
    if (player.isAI) setTimeout(() => this.rollDice(), 500);
  }

  useJailCard(player) {
    if (player.jailFreeCards <= 0) return;
    player.jailFreeCards--;
    player.inJail = false;
    player.jailTurns = 0;
    this.addLog(`${player.name} uses a Get Out of Jail Free card!`);
    this.state = STATE.ROLL_DICE;
    this.onUpdate();
    if (player.isAI) setTimeout(() => this.rollDice(), 500);
  }

  // ---- Building ----
  canBuildHouse(playerId, spaceId) {
    const sp = SPACES[spaceId];
    if (sp.type !== 'property') return false;
    const prop = this.properties[spaceId];
    if (!prop || prop.owner !== playerId) return false;
    if (prop.hotel) return false;
    if (prop.houses >= MAX_HOUSES_PER_PROPERTY) return false;
    if (!this._hasMonopoly(playerId, sp.group)) return false;
    if (prop.mortgaged) return false;
    const player = this.players[playerId];
    if (player.money < sp.houseCost) return false;
    // Even building rule: houses must be built evenly
    const groupProps = SPACES.filter(s => s.type === 'property' && s.group === sp.group);
    const minHouses = Math.min(...groupProps.map(s => this.properties[s.id].houses));
    return prop.houses === minHouses;
  }

  buildHouse(playerId, spaceId) {
    if (!this.canBuildHouse(playerId, spaceId)) return false;
    const sp = SPACES[spaceId];
    const prop = this.properties[spaceId];
    const player = this.players[playerId];
    if (prop.houses === MAX_HOUSES_PER_PROPERTY) {
      // Upgrade to hotel
      player.money -= sp.houseCost;
      prop.houses = 0;
      prop.hotel = true;
      this.addLog(`${player.name} builds a hotel on ${sp.name}!`);
    } else {
      player.money -= sp.houseCost;
      prop.houses++;
      this.addLog(`${player.name} builds house #${prop.houses} on ${sp.name}.`);
    }
    this.onUpdate();
    return true;
  }

  canSellHouse(playerId, spaceId) {
    const sp = SPACES[spaceId];
    if (sp.type !== 'property') return false;
    const prop = this.properties[spaceId];
    if (!prop || prop.owner !== playerId) return false;
    if (!prop.hotel && prop.houses === 0) return false;
    return true;
  }

  sellHouse(playerId, spaceId) {
    if (!this.canSellHouse(playerId, spaceId)) return false;
    const sp = SPACES[spaceId];
    const prop = this.properties[spaceId];
    const player = this.players[playerId];
    const refund = Math.floor(sp.houseCost / 2);
    if (prop.hotel) {
      prop.hotel = false;
      prop.houses = MAX_HOUSES_PER_PROPERTY;
      this.addLog(`${player.name} sells hotel on ${sp.name} (refund $${refund}).`);
    } else {
      prop.houses--;
      this.addLog(`${player.name} sells house on ${sp.name} (refund $${refund}).`);
    }
    player.money += refund;
    this.onUpdate();
    return true;
  }

  // ---- Mortgage ----
  canMortgage(playerId, spaceId) {
    const prop = this.properties[spaceId];
    if (!prop || prop.owner !== playerId || prop.mortgaged) return false;
    if (prop.houses > 0 || prop.hotel) return false; // must sell buildings first
    return true;
  }

  mortgage(playerId, spaceId) {
    if (!this.canMortgage(playerId, spaceId)) return false;
    const sp = SPACES[spaceId];
    const prop = this.properties[spaceId];
    const player = this.players[playerId];
    prop.mortgaged = true;
    player.money += sp.mortgage;
    this.addLog(`${player.name} mortgages ${sp.name} for $${sp.mortgage}.`);
    this.onUpdate();
    return true;
  }

  canUnmortgage(playerId, spaceId) {
    const sp = SPACES[spaceId];
    const prop = this.properties[spaceId];
    if (!prop || prop.owner !== playerId || !prop.mortgaged) return false;
    const cost = Math.floor(sp.mortgage * 1.1);
    return this.players[playerId].money >= cost;
  }

  unmortgage(playerId, spaceId) {
    if (!this.canUnmortgage(playerId, spaceId)) return false;
    const sp = SPACES[spaceId];
    const prop = this.properties[spaceId];
    const player = this.players[playerId];
    const cost = Math.floor(sp.mortgage * 1.1);
    prop.mortgaged = false;
    player.money -= cost;
    this.addLog(`${player.name} unmortgages ${sp.name} for $${cost}.`);
    this.onUpdate();
    return true;
  }

  // ---- Trade ----
  proposeTrade(fromId, toId, fromMoney, toMoney, fromProps, toProps) {
    const from = this.players[fromId];
    const to = this.players[toId];
    fromProps.forEach(sid => {
      this.properties[sid].owner = toId;
    });
    toProps.forEach(sid => {
      this.properties[sid].owner = fromId;
    });
    from.money -= fromMoney;
    from.money += toMoney;
    to.money += fromMoney;
    to.money -= toMoney;
    const desc = [
      fromProps.length ? `${fromProps.map(s=>SPACES[s].name).join(', ')}` : '',
      fromMoney ? `$${fromMoney}` : '',
    ].filter(Boolean).join(' + ');
    const desc2 = [
      toProps.length ? `${toProps.map(s=>SPACES[s].name).join(', ')}` : '',
      toMoney ? `$${toMoney}` : '',
    ].filter(Boolean).join(' + ');
    this.addLog(`Trade: ${from.name} gives [${desc}] for [${desc2}] from ${to.name}.`);
    this.onUpdate();
  }

  // ---- End Turn ----
  endTurn() {
    if (this.state !== STATE.PLAYER_ACTIONS) return;
    const rolled = this.lastDiceRoll !== null;
    const doubles = this.dice[0] === this.dice[1];
    this._endTurnOrContinue(doubles && !this.currentPlayer.inJail && rolled);
  }

  _endTurnOrContinue(playAgain) {
    if (playAgain && this.doublesCount > 0) {
      // Player gets to go again
      this.addLog(`${this.currentPlayer.name} rolled doubles — goes again!`);
      this.lastDiceRoll = null;
      this.state = STATE.ROLL_DICE;
      this.onUpdate();
      this._maybeAI();
      return;
    }
    this.lastDiceRoll = null;
    this.doublesCount = 0;
    this._nextPlayer();
  }

  _nextPlayer() {
    const active = this.players.filter(p => !p.bankrupt);
    if (active.length <= 1) {
      this.winner = active[0] || this.players[0];
      this.state = STATE.GAME_OVER;
      this.addLog(`🏆 ${this.winner.name} wins the game!`);
      this.onUpdate();
      this.onModal('game_over', { winner: this.winner });
      return;
    }

    // Move to next non-bankrupt player
    let next = (this.currentPlayerIdx + 1) % this.players.length;
    while (this.players[next].bankrupt) {
      next = (next + 1) % this.players.length;
    }
    this.currentPlayerIdx = next;
    this.state = STATE.ROLL_DICE;
    this.addLog(`--- ${this.currentPlayer.name}'s turn ---`);
    this.onUpdate();
    this._maybeAI();
  }

  // ---- Bankruptcy ----
  _checkBankruptcy(player, creditor) {
    if (player.money >= 0) return false;

    // Can player raise money by selling houses/mortgaging?
    const canRaise = this._liquidationValue(player.id);
    if (player.money + canRaise >= 0) {
      // Player needs to raise money - prompt UI
      this.addLog(`${player.name} needs to raise funds! (deficit: $${-player.money})`);
      this.state = STATE.PLAYER_ACTIONS;
      this.onUpdate();
      if (player.isAI) {
        setTimeout(() => this._aiRaiseMoney(player, creditor), 400);
      }
      return true;
    }

    // Bankrupt
    this._declareBankruptcy(player, creditor);
    return true;
  }

  _liquidationValue(playerId) {
    let total = 0;
    SPACES.forEach(sp => {
      const prop = this.properties[sp.id];
      if (prop && prop.owner === playerId) {
        if (!prop.mortgaged) total += sp.mortgage || 0;
        if (prop.houses) total += prop.houses * Math.floor((sp.houseCost || 0) / 2);
        if (prop.hotel) total += MAX_HOUSES_PER_PROPERTY * Math.floor((sp.houseCost || 0) / 2);
      }
    });
    return total;
  }

  _declareBankruptcy(player, creditor) {
    this.addLog(`💀 ${player.name} is bankrupt!`);
    if (typeof Sounds !== 'undefined') Sounds.bankrupt();
    player.bankrupt = true;

    // Transfer assets to creditor or bank
    SPACES.forEach(sp => {
      const prop = this.properties[sp.id];
      if (prop && prop.owner === player.id) {
        prop.owner = creditor ? creditor.id : null;
        prop.houses = 0;
        prop.hotel = false;
        if (!creditor) prop.mortgaged = false; // bank gets clear title; creditor keeps mortgaged status
      }
    });

    if (creditor) {
      creditor.money += Math.max(0, player.money);
      this.addLog(`${creditor.name} receives ${player.name}'s assets.`);
    }
    player.money = 0;
    this.onUpdate();
    setTimeout(() => this._nextPlayer(), 800);
  }

  setPlayerAI(playerIdx) {
    if (playerIdx >= 0 && playerIdx < this.players.length) {
      this.players[playerIdx].isAI = true;
      this.onUpdate();
      if (this.currentPlayerIdx === playerIdx) this._maybeAI();
    }
  }

  // ---- Serialize / Restore (for online multiplayer) ----
  serialize() {
    return {
      players: this.players.map(p => ({ ...p })),
      properties: Object.fromEntries(
        Object.entries(this.properties).map(([k, v]) => [k, { ...v }])
      ),
      state: this.state,
      currentPlayerIdx: this.currentPlayerIdx,
      doublesCount: this.doublesCount,
      dice: [...this.dice],
      log: [...this.log].slice(0, 50),
      chanceDeck: [...this.chanceDeck],
      communityChestDeck: [...this.communityChestDeck],
      freeParkingPot: this.freeParkingPot,
      pendingCard: this.pendingCard,
      lastDiceRoll: this.lastDiceRoll,
      winner: this.winner,
      rules: { ...this.rules },
      stats: JSON.parse(JSON.stringify(this.stats)),
      auctionData: this.auctionData ? JSON.parse(JSON.stringify(this.auctionData)) : null,
    };
  }

  restore(s) {
    this.players = s.players;
    this.properties = s.properties;
    this.state = s.state;
    this.currentPlayerIdx = s.currentPlayerIdx;
    this.doublesCount = s.doublesCount;
    this.dice = s.dice;
    this.log = s.log;
    this.chanceDeck = s.chanceDeck;
    this.communityChestDeck = s.communityChestDeck;
    this.freeParkingPot = s.freeParkingPot;
    this.pendingCard = s.pendingCard;
    this.lastDiceRoll = s.lastDiceRoll;
    this.winner = s.winner;
    if (s.rules) this.rules = { ...this.rules, ...s.rules };
    if (s.stats) this.stats = s.stats;
    if (s.auctionData !== undefined) this.auctionData = s.auctionData;
  }

  // ---- Net Worth ----
  netWorth(playerId) {
    const player = this.players[playerId];
    let total = player.money;
    SPACES.forEach(sp => {
      const prop = this.properties[sp.id];
      if (prop && prop.owner === playerId) {
        total += sp.price || 0;
        if (prop.houses) total += prop.houses * (sp.houseCost || 0);
        if (prop.hotel) total += MAX_HOUSES_PER_PROPERTY * (sp.houseCost || 0);
      }
    });
    return total;
  }

  // ---- AI ----
  _maybeAI() {
    if (this.currentPlayer && this.currentPlayer.isAI && this.state === STATE.ROLL_DICE) {
      setTimeout(() => this.rollDice(), 700);
    }
  }

  _aiDecideBuy(player, sp) {
    if (player.money >= sp.price + 200) {
      this.buyProperty(player, sp);
    } else {
      this.skipBuy(player);
    }
  }

  _runAIActions() {
    if (!this.currentPlayer.isAI || this.state !== STATE.PLAYER_ACTIONS) return;
    const player = this.currentPlayer;

    // Try to build houses
    let built = true;
    while (built) {
      built = false;
      for (const sp of SPACES) {
        if (sp.type !== 'property') continue;
        const prop = this.properties[sp.id];
        if (!prop || prop.owner !== player.id) continue;
        if (this.canBuildHouse(player.id, sp.id) && player.money > sp.houseCost + 300) {
          this.buildHouse(player.id, sp.id);
          built = true;
          break;
        }
      }
    }

    setTimeout(() => this.endTurn(), 300);
  }

  _aiRaiseMoney(player, creditor) {
    // Sell houses first
    for (const sp of SPACES) {
      if (sp.type !== 'property') continue;
      const prop = this.properties[sp.id];
      if (prop && prop.owner === player.id && (prop.houses > 0 || prop.hotel)) {
        this.sellHouse(player.id, sp.id);
        if (player.money >= 0) { this._goToPlayerActions(); return; }
      }
    }
    // Mortgage
    for (const sp of SPACES) {
      const prop = this.properties[sp.id];
      if (prop && prop.owner === player.id && !prop.mortgaged) {
        if (this.canMortgage(player.id, sp.id)) {
          this.mortgage(player.id, sp.id);
          if (player.money >= 0) { this._goToPlayerActions(); return; }
        }
      }
    }
    // Still bankrupt
    this._declareBankruptcy(player, creditor);
  }
}
