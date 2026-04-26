// player.js - Player class

class Player {
  constructor(name, isAI = false, aiDifficulty = 'smart') {
    this.name = name;
    this.isAI = isAI;
    this.aiDifficulty = aiDifficulty;
    this.hand = [null, null, null, null]; // 4 card slots
    this.knownCards = new Map(); // slotIndex -> card (cards this player has seen)
    this.score = 0;
    this.roundScores = [];
    this.eliminated = false;
  }

  calculateTotal() {
    return this.hand.reduce((sum, card) => sum + (card ? card.value : 0), 0);
  }

  // Mark a card at slot as known to this player
  learnCard(slotIndex, card) {
    this.knownCards.set(slotIndex, card);
  }

  // Forget a card slot (e.g., after swap)
  forgetCard(slotIndex) {
    this.knownCards.delete(slotIndex);
  }

  // Estimated total based on known cards (unknown slots assumed avg ~5)
  estimatedTotal() {
    let total = 0;
    for (let i = 0; i < 4; i++) {
      if (this.knownCards.has(i)) {
        total += this.knownCards.get(i).value;
      } else {
        total += 5; // unknown card estimate
      }
    }
    return total;
  }

  // Get the known highest-value slot index (own hand only, slots 0-3)
  highestKnownSlot() {
    let maxVal = -1;
    let maxSlot = -1;
    for (const [slot, card] of this.knownCards) {
      if (slot < 0 || slot > 3) continue; // skip opponent knowledge entries
      if (card.value > maxVal) {
        maxVal = card.value;
        maxSlot = slot;
      }
    }
    return maxSlot;
  }
}

export { Player };
