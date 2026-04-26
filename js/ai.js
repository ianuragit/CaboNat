// ai.js - AI opponent logic

import { PHASES } from './game.js';

class AIPlayer {
  constructor(player, game, abilityHandler) {
    this.player = player;
    this.game = game;
    this.abilityHandler = abilityHandler;
  }

  shouldCallCabo() {
    const est = this.player.estimatedTotal();
    // Call cabo when estimated hand is low enough
    return est <= 8;
  }

  takeTurn() {
    const game = this.game;
    const player = this.player;

    // Only call Cabo at the start of a normal turn, never during final turns
    if (this.shouldCallCabo() && game.phase === PHASES.PLAYER_TURN) {
      setTimeout(() => game.callCabo(), 600);
      return;
    }

    // Draw from deck (AI prefers deck over discard unless discard is very good)
    const topDiscard = game.topDiscard;
    let drawAction = 'deck';
    if (topDiscard && topDiscard.value === 0) {
      drawAction = 'discard'; // Always take a King (0 value)
    } else if (topDiscard && topDiscard.value <= 2) {
      drawAction = 'discard'; // Take very low cards
    }

    setTimeout(() => {
      let drawnCard;
      if (drawAction === 'discard') {
        drawnCard = game.takeFromDiscard();
      } else {
        drawnCard = game.drawFromDeck();
      }

      if (!drawnCard) return;

      setTimeout(() => this._decideAction(drawnCard), 800);
    }, 700);
  }

  _decideAction(drawnCard) {
    const game = this.game;
    const swapSlot = this._bestSwapSlot(drawnCard);

    if (swapSlot !== -1) {
      setTimeout(() => game.swapDrawnWithSlot(swapSlot), 600);
    } else {
      // Discard — ability fires via 'abilityTriggered' event if applicable
      setTimeout(() => game.discardDrawn(null), 600);
    }
  }

  _bestSwapSlot(drawnCard) {
    const player = this.player;
    // Look for a known slot with higher value than the drawn card
    let bestSlot = -1;
    let bestSaving = 0;

    for (const [slot, knownCard] of player.knownCards) {
      const saving = knownCard.value - drawnCard.value;
      if (saving > bestSaving) {
        bestSaving = saving;
        bestSlot = slot;
      }
    }

    return bestSlot;
  }
}

export { AIPlayer };
