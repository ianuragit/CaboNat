// game.js - Core game state & logic

import { createDeck, shuffle, drawCard, getAbility } from './deck.js';
import { Player } from './player.js';

const PHASES = {
  IDLE: 'IDLE',
  DEALING: 'DEALING',
  PEEK_START: 'PEEK_START',
  PLAYER_TURN: 'PLAYER_TURN',
  ABILITY_PHASE: 'ABILITY_PHASE',
  CABO_CALLED: 'CABO_CALLED',
  FINAL_TURNS: 'FINAL_TURNS',
  REVEAL: 'REVEAL',
  SCORING: 'SCORING',
  GAME_OVER: 'GAME_OVER',
};

class GameState {
  constructor() {
    this.players = [];
    this.deck = [];
    this.discardPile = [];
    this.phase = PHASES.IDLE;
    this.currentPlayerIndex = 0;
    this.caboCaller = null;
    this.drawnCard = null;
    this.roundNumber = 0;
    this.finalTurnsLeft = 0;
    this.abilityContext = null; // { type, card, callback }
    this.log = [];
    this.listeners = {};
  }

  on(event, fn) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(fn);
  }

  emit(event, data) {
    if (this.listeners[event]) {
      for (const fn of this.listeners[event]) fn(data);
    }
  }

  addLog(msg) {
    this.log.push(msg);
    if (this.log.length > 50) this.log.shift();
    this.emit('log', msg);
  }

  get currentPlayer() {
    return this.players[this.currentPlayerIndex];
  }

  get topDiscard() {
    return this.discardPile[this.discardPile.length - 1] || null;
  }

  initGame(playerCount = 2) {
    this.players = [];
    const names = ['You', 'AI Alex', 'AI Blake', 'AI Casey'];
    for (let i = 0; i < playerCount; i++) {
      this.players.push(new Player(names[i], i !== 0, 'smart'));
    }
    this.roundNumber = 0;
    this.log = [];
    this.startRound();
  }

  startRound() {
    this.roundNumber++;
    this.deck = shuffle(createDeck());
    this.discardPile = [];
    this.caboCaller = null;
    this.drawnCard = null;
    this.abilityContext = null;

    // Reset hands and known cards
    for (const player of this.players) {
      if (!player.eliminated) {
        player.hand = [null, null, null, null];
        player.knownCards = new Map();
      }
    }

    // Deal 4 cards to each non-eliminated player
    const activePlayers = this.players.filter(p => !p.eliminated);
    for (let slot = 0; slot < 4; slot++) {
      for (const player of activePlayers) {
        player.hand[slot] = drawCard(this.deck);
      }
    }

    // Flip one card to start discard pile
    const firstDiscard = drawCard(this.deck);
    firstDiscard.faceUp = true;
    this.discardPile.push(firstDiscard);

    this.phase = PHASES.PEEK_START;
    this.currentPlayerIndex = this.players.findIndex(p => !p.eliminated);

    // Each player learns their bottom 2 cards (slots 2, 3)
    for (const player of activePlayers) {
      player.learnCard(2, player.hand[2]);
      player.learnCard(3, player.hand[3]);
    }

    this.addLog(`Round ${this.roundNumber} started!`);
    this.emit('roundStart', { round: this.roundNumber });
  }

  peekStartDone() {
    this.phase = PHASES.PLAYER_TURN;
    this.emit('phaseChange', { phase: this.phase });
    this.emit('turnStart', { player: this.currentPlayer });
  }

  callCabo() {
    if (this.phase !== PHASES.PLAYER_TURN) return false;
    this.caboCaller = this.currentPlayer;
    this.phase = PHASES.CABO_CALLED;
    this.addLog(`${this.currentPlayer.name} called CABO!`);
    this.emit('caboCalled', { caller: this.currentPlayer });
    this.advanceToFinalTurns();
    return true;
  }

  advanceToFinalTurns() {
    // Count how many other players need a final turn
    const active = this.players.filter(p => !p.eliminated);
    this.finalTurnsLeft = active.length - 1;
    if (this.finalTurnsLeft === 0) {
      this.resolveRound();
      return;
    }
    this.phase = PHASES.FINAL_TURNS;
    this.advanceTurn();
  }

  drawFromDeck() {
    if (this.deck.length === 0) this.reshuffleDiscard();
    if (this.deck.length === 0) return null;
    const card = drawCard(this.deck);
    card.faceUp = true;
    this.drawnCard = card;
    this.addLog(`${this.currentPlayer.name} drew from deck.`);
    this.emit('cardDrawn', { card, source: 'deck' });
    return card;
  }

  takeFromDiscard() {
    if (this.discardPile.length === 0) return null;
    const card = this.discardPile.pop();
    card.faceUp = true;
    this.drawnCard = card;
    this.addLog(`${this.currentPlayer.name} took from discard.`);
    this.emit('cardDrawn', { card, source: 'discard' });
    return card;
  }

  // Swap drawn card with hand slot; old card goes to discard
  swapDrawnWithSlot(slotIndex) {
    const player = this.currentPlayer;
    const oldCard = player.hand[slotIndex];
    if (!oldCard || !this.drawnCard) { this.endAction(); return; } // safety guard

    const incoming = this.drawnCard;
    incoming.faceUp = false; // card entering hand is no longer visible to others
    player.hand[slotIndex] = incoming;
    player.learnCard(slotIndex, incoming);

    oldCard.faceUp = true;
    this.discardPile.push(oldCard);
    this.drawnCard = null;

    this.addLog(`${player.name} swapped slot ${slotIndex + 1}.`);
    this.emit('cardSwapped', { player, slotIndex, newCard: incoming, discarded: oldCard });
    this.endAction();
  }

  // Discard drawn card (may trigger ability)
  discardDrawn(onAbilityComplete) {
    const card = this.drawnCard;
    if (!card) { this.endAction(); return; } // safety: nothing drawn
    this.drawnCard = null;
    card.faceUp = true;
    this.discardPile.push(card);

    this.addLog(`${this.currentPlayer.name} discarded ${card.rank}${card.suit}.`);
    this.emit('cardDiscarded', { card });

    const ability = getAbility(card.rank);
    if (ability) {
      this.triggerAbility(card, ability);
    } else {
      this.endAction();
    }
  }

  triggerAbility(card, ability) {
    if (!ability) { this.endAction(); return; }

    const priorPhase = this.phase;
    this.phase = PHASES.ABILITY_PHASE;
    this.abilityContext = { type: ability, card, priorPhase };
    this.addLog(`${this.currentPlayer.name} triggered: ${ability}.`);
    this.emit('abilityTriggered', { ability, player: this.currentPlayer });
  }

  // Called by ability handler when ability is resolved
  abilityDone() {
    const prior = this.abilityContext?.priorPhase;
    this.abilityContext = null;
    this.phase = prior || PHASES.PLAYER_TURN;
    this.endAction();
  }

  endAction() {
    if (this.phase === PHASES.FINAL_TURNS) {
      this.finalTurnsLeft--;
      if (this.finalTurnsLeft <= 0) {
        this.resolveRound();
        return;
      }
    }
    this.advanceTurn();
  }

  advanceTurn() {
    const active = this.players.filter(p => !p.eliminated);
    let next = (this.currentPlayerIndex + 1) % this.players.length;
    // Skip eliminated players
    let tries = 0;
    while (this.players[next].eliminated && tries < this.players.length) {
      next = (next + 1) % this.players.length;
      tries++;
    }

    // If in final turns, skip the cabo caller
    if (this.phase === PHASES.FINAL_TURNS && this.players[next] === this.caboCaller) {
      next = (next + 1) % this.players.length;
      tries = 0;
      while (this.players[next].eliminated && tries < this.players.length) {
        next = (next + 1) % this.players.length;
        tries++;
      }
    }

    this.currentPlayerIndex = next;

    if (this.phase !== PHASES.FINAL_TURNS) {
      this.phase = PHASES.PLAYER_TURN;
    }

    this.emit('turnStart', { player: this.currentPlayer });
  }

  resolveRound() {
    this.phase = PHASES.REVEAL;
    this.addLog('Revealing all hands...');

    // Flip all cards face up
    for (const p of this.players) {
      if (!p.eliminated) {
        for (const card of p.hand) {
          if (card) card.faceUp = true;
        }
      }
    }

    this.emit('reveal', {});

    // Scoring after reveal animation
    setTimeout(() => this.scoreRound(), 1500);
  }

  scoreRound() {
    this.phase = PHASES.SCORING;
    const active = this.players.filter(p => !p.eliminated);
    const totals = active.map(p => ({ player: p, total: p.calculateTotal() }));
    const minTotal = Math.min(...totals.map(t => t.total));
    const winners = totals.filter(t => t.total === minTotal);

    for (const { player, total } of totals) {
      let roundScore = total;
      // Cabo caller penalty
      if (player === this.caboCaller && total > minTotal) {
        roundScore += 10;
        this.addLog(`${player.name} called Cabo but didn't win — +10 penalty!`);
      }
      player.score += roundScore;
      player.roundScores.push(roundScore);
      this.addLog(`${player.name}: ${total} pts (total: ${player.score})`);
    }

    // Eliminate players at 100+
    for (const player of active) {
      if (player.score >= 100 && !player.eliminated) {
        player.eliminated = true;
        this.addLog(`${player.name} is eliminated with ${player.score} points!`);
      }
    }

    const remaining = this.players.filter(p => !p.eliminated);
    if (remaining.length <= 1) {
      this.phase = PHASES.GAME_OVER;
      const winner = remaining[0] || this.players.reduce((a, b) => a.score < b.score ? a : b);
      this.addLog(`Game Over! ${winner.name} wins!`);
      this.emit('gameOver', { winner, totals });
    } else {
      this.emit('roundEnd', { totals, minTotal, winners });
    }
  }

  reshuffleDiscard() {
    if (this.discardPile.length <= 1) return;
    const top = this.discardPile.pop();
    this.deck = shuffle(this.discardPile.map(c => { c.faceUp = false; return c; }));
    this.discardPile = [top];
    this.addLog('Deck reshuffled from discard pile.');
  }
}

export { GameState, PHASES };
