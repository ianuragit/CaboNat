// abilities.js - Special card ability handling


class AbilityHandler {
  constructor(game, ui) {
    this.game = game;
    this.ui = ui;
  }

  // Main entry: handle ability for current player after discarding
  handle(abilityType, isAI = false) {
    const game = this.game;
    switch (abilityType) {
      case 'peek_self':
        this._peekSelf(isAI);
        break;
      case 'spy_other':
        this._spyOther(isAI);
        break;
      case 'blind_swap':
        this._blindSwap(isAI);
        break;
      case 'spy_swap':
        this._spySwap(isAI);
        break;
      default:
        game.abilityDone();
    }
  }

  _peekSelf(isAI) {
    const game = this.game;
    const player = game.currentPlayer;
    if (isAI) {
      // AI: peek at first unknown slot
      let slot = -1;
      for (let i = 0; i < 4; i++) {
        if (!player.knownCards.has(i) && player.hand[i]) { slot = i; break; }
      }
      if (slot === -1) slot = 0;
      player.learnCard(slot, player.hand[slot]);
      game.addLog(`${player.name} peeked at their card (slot ${slot + 1}).`);
      this.ui.flashCard(player, slot, player.hand[slot], 1500, () => game.abilityDone());
    } else {
      // Human: highlight own cards, let them pick
      game.addLog("Choose one of YOUR cards to peek at.");
      this.ui.promptCardSelection({
        players: [player],
        playerIndices: [game.players.indexOf(player)],
        prompt: "Peek at one of your cards",
        onSelect: (pIdx, slotIdx) => {
          const card = game.players[pIdx].hand[slotIdx];
          player.learnCard(slotIdx, card);
          game.addLog(`You peeked: slot ${slotIdx + 1} is ${card.rank}${card.suit}.`);
          this.ui.flashCard(game.players[pIdx], slotIdx, card, 2000, () => game.abilityDone());
        }
      });
    }
  }

  _spyOther(isAI) {
    const game = this.game;
    const player = game.currentPlayer;
    const opponents = game.players.filter((p, i) => p !== player && !p.eliminated);

    if (isAI) {
      // AI: spy on an opponent's unknown card
      let target = opponents[0];
      let slot = 0;
      outer: for (const opp of opponents) {
        for (let i = 0; i < 4; i++) {
          if (opp.hand[i]) { target = opp; slot = i; break outer; }
        }
      }
      const card = target.hand[slot];
      player.learnCard(-(game.players.indexOf(target) * 10 + slot), card); // track opponent knowledge
      game.addLog(`${player.name} spied on ${target.name}'s slot ${slot + 1}.`);
      this.ui.flashCard(target, slot, card, 1500, () => game.abilityDone());
    } else {
      game.addLog("Choose an OPPONENT's card to spy on.");
      this.ui.promptCardSelection({
        players: opponents,
        playerIndices: opponents.map(p => game.players.indexOf(p)),
        prompt: "Spy on an opponent's card",
        onSelect: (pIdx, slotIdx) => {
          const card = game.players[pIdx].hand[slotIdx];
          game.addLog(`You spied: ${game.players[pIdx].name}'s slot ${slotIdx + 1} is ${card.rank}${card.suit}.`);
          this.ui.flashCard(game.players[pIdx], slotIdx, card, 2000, () => game.abilityDone());
        }
      });
    }
  }

  _blindSwap(isAI) {
    const game = this.game;
    const player = game.currentPlayer;
    const opponents = game.players.filter(p => p !== player && !p.eliminated);

    if (isAI) {
      // AI: swap its known highest card with an opponent's unknown slot
      const myHighSlot = player.highestKnownSlot();
      const mySlot = myHighSlot === -1 ? 0 : myHighSlot;
      const target = opponents[0];
      const oppSlot = 0;

      this._doSwap(player, mySlot, target, oppSlot);
      game.addLog(`${player.name} blind-swapped with ${target.name}.`);
      game.abilityDone();
    } else {
      // Step 1: pick your card
      game.addLog("Blind swap: first pick YOUR card to swap.");
      this.ui.promptCardSelection({
        players: [player],
        playerIndices: [game.players.indexOf(player)],
        prompt: "Pick your card to swap",
        onSelect: (myPIdx, mySlot) => {
          // Step 2: pick opponent's card
          game.addLog("Now pick an OPPONENT's card to swap with.");
          this.ui.promptCardSelection({
            players: opponents,
            playerIndices: opponents.map(p => game.players.indexOf(p)),
            prompt: "Pick opponent's card",
            onSelect: (oppPIdx, oppSlot) => {
              const myPlayer = game.players[myPIdx];
              const oppPlayer = game.players[oppPIdx];
              this._doSwap(myPlayer, mySlot, oppPlayer, oppSlot);
              game.addLog(`You swapped your slot ${mySlot + 1} with ${oppPlayer.name}'s slot ${oppSlot + 1}.`);
              game.abilityDone();
            }
          });
        }
      });
    }
  }

  _spySwap(isAI) {
    const game = this.game;
    const player = game.currentPlayer;
    const opponents = game.players.filter(p => p !== player && !p.eliminated);

    if (isAI) {
      // Spy on opponent's card, then decide to swap
      const target = opponents[0];
      const oppSlot = 0;
      const spiedCard = target.hand[oppSlot];
      const myHighSlot = player.highestKnownSlot();

      game.addLog(`${player.name} spied on ${target.name}'s slot ${oppSlot + 1}: ${spiedCard.rank}${spiedCard.suit}.`);

      // Swap if opponent's card is lower than our highest
      const myHighValue = myHighSlot !== -1 ? player.hand[myHighSlot].value : 10;
      if (spiedCard.value < myHighValue && myHighSlot !== -1) {
        this._doSwap(player, myHighSlot, target, oppSlot);
        game.addLog(`${player.name} swapped!`);
      } else {
        game.addLog(`${player.name} chose not to swap.`);
      }
      this.ui.flashCard(target, oppSlot, spiedCard, 1500, () => game.abilityDone());
    } else {
      // Step 1: pick opponent's card to spy on
      game.addLog("King: spy on an opponent's card, then optionally swap.");
      this.ui.promptCardSelection({
        players: opponents,
        playerIndices: opponents.map(p => game.players.indexOf(p)),
        prompt: "Spy on an opponent's card",
        onSelect: (oppPIdx, oppSlot) => {
          const oppPlayer = game.players[oppPIdx];
          const spiedCard = oppPlayer.hand[oppSlot];
          game.addLog(`You see: ${oppPlayer.name}'s slot ${oppSlot + 1} is ${spiedCard.rank}${spiedCard.suit}.`);

          this.ui.flashCard(oppPlayer, oppSlot, spiedCard, 2000, () => {
            // After seeing the card, ask if they want to swap
            this.ui.promptSwapDecision(spiedCard, (doSwap) => {
              if (doSwap) {
                // Pick own card to swap
                this.ui.promptCardSelection({
                  players: [player],
                  playerIndices: [game.players.indexOf(player)],
                  prompt: "Pick your card to give away",
                  onSelect: (myPIdx, mySlot) => {
                    this._doSwap(game.players[myPIdx], mySlot, oppPlayer, oppSlot);
                    game.addLog(`You swapped your slot ${mySlot + 1} with ${oppPlayer.name}'s slot ${oppSlot + 1}.`);
                    game.abilityDone();
                  }
                });
              } else {
                game.addLog("You chose not to swap.");
                game.abilityDone();
              }
            });
          });
        }
      });
    }
  }

  _doSwap(playerA, slotA, playerB, slotB) {
    const cardA = playerA.hand[slotA];
    const cardB = playerB.hand[slotB];
    playerA.hand[slotA] = cardB;
    playerB.hand[slotB] = cardA;
    // Update known cards
    playerA.forgetCard(slotA);
    playerB.forgetCard(slotB);
    this.game.emit('swapDone', { playerA, slotA, playerB, slotB });
  }
}

export { AbilityHandler };
