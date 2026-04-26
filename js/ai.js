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
      setTimeout(() => game.callCabo(), 350);
      return;
    }

    // Draw from deck (AI prefers deck over discard unless discard is very good)
    const topDiscard = game.topDiscard;
    let drawAction = 'deck';
    if (topDiscard && topDiscard.value === 0) {
      drawAction = 'discard';
    } else if (topDiscard && topDiscard.value <= 2) {
      drawAction = 'discard';
    }

    setTimeout(() => {
      // Guard: bail if phase changed (e.g. new round started mid-delay)
      if (game.phase !== PHASES.PLAYER_TURN && game.phase !== PHASES.FINAL_TURNS) return;

      let drawnCard;
      if (drawAction === 'discard') {
        drawnCard = game.takeFromDiscard();
      } else {
        drawnCard = game.drawFromDeck();
      }

      if (!drawnCard) {
        // Fallback: deck and discard both empty — force end turn
        game.endAction();
        return;
      }

      setTimeout(() => this._decideAction(drawnCard), 500);
    }, 400);
  }

  _decideAction(drawnCard) {
    const game = this.game;
    // Guard: bail if no longer holding a drawn card (phase changed)
    if (!game.drawnCard) return;

    const swapSlot = this._bestSwapSlot(drawnCard);

    if (swapSlot !== -1) {
      setTimeout(() => game.swapDrawnWithSlot(swapSlot), 350);
    } else {
      setTimeout(() => game.discardDrawn(null), 350);
    }
  }

  _bestSwapSlot(drawnCard) {
    const player = this.player;
    let bestSlot = -1;
    let bestSaving = 0;

    for (const [slot, knownCard] of player.knownCards) {
      if (slot < 0 || slot > 3) continue; // skip opponent-knowledge entries (negative keys)
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
