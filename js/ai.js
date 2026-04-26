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
      try {
        // Bail if phase changed while waiting (e.g. new round started)
        if (game.phase !== PHASES.PLAYER_TURN && game.phase !== PHASES.FINAL_TURNS) return;

        let drawnCard;
        if (drawAction === 'discard') {
          drawnCard = game.takeFromDiscard();
        } else {
          drawnCard = game.drawFromDeck();
        }

        if (!drawnCard) {
          game.endAction();
          return;
        }

        setTimeout(() => {
          try {
            this._decideAction(drawnCard);
          } catch (e) {
            game.emit('aiError', { msg: e.message, stack: e.stack });
            game.drawnCard = null;
            game.endAction();
          }
        }, 500);
      } catch (e) {
        game.emit('aiError', { msg: e.message, stack: e.stack });
        game.endAction();
      }
    }, 400);
  }

  _decideAction(drawnCard) {
    const game = this.game;
    // If drawnCard was already consumed (phase changed mid-delay), end the turn
    if (!game.drawnCard) {
      game.endAction();
      return;
    }

    const swapSlot = this._bestSwapSlot(drawnCard);

    if (swapSlot !== -1) {
      setTimeout(() => {
        try {
          game.swapDrawnWithSlot(swapSlot);
        } catch (e) {
          game.emit('aiError', { msg: e.message, stack: e.stack });
          game.drawnCard = null;
          game.endAction();
        }
      }, 350);
    } else {
      setTimeout(() => {
        try {
          game.discardDrawn(null);
        } catch (e) {
          game.emit('aiError', { msg: e.message, stack: e.stack });
          game.drawnCard = null;
          game.endAction();
        }
      }, 350);
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
