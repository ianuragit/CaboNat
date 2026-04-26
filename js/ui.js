// ui.js - DOM rendering & updates

import { isRedSuit } from './deck.js';
import { flipCardElement, showFloatingScore } from './animations.js';
import { PHASES } from './game.js';

class UIRenderer {
  constructor(game) {
    this.game = game;
    this.selectionMode = null; // active selection callback
    this.drawnCardEl = null;
    this._boundHandlers = new Map();
  }

  // ─── Card Element Creation ────────────────────────────────────────────────

  createCardElement(card, faceUp = false, isSmall = false) {
    const el = document.createElement('div');
    el.className = `card ${isSmall ? 'card-sm' : ''} ${faceUp ? 'face-up' : 'face-down'}`;
    if (card) {
      el.dataset.cardId = card.id;
      el.dataset.rank = card.rank;
      el.dataset.suit = card.suit;
    }
    this._renderCardContent(el, card, faceUp);
    return el;
  }

  _renderCardContent(el, card, faceUp) {
    el.innerHTML = '';
    if (!faceUp || !card) {
      el.innerHTML = `<div class="card-back-pattern"></div>`;
      return;
    }
    const red = card && isRedSuit(card.suit);
    el.classList.toggle('red-card', !!red);
    el.classList.toggle('black-card', !red);
    el.innerHTML = `
      <div class="card-corner top-left">
        <span class="card-rank">${card.rank}</span>
        <span class="card-suit">${card.suit}</span>
      </div>
      <div class="card-center-suit">${card.suit}</div>
      <div class="card-corner bottom-right">
        <span class="card-rank">${card.rank}</span>
        <span class="card-suit">${card.suit}</span>
      </div>
    `;
  }

  updateCardElement(el, card, faceUp) {
    const wasFaceUp = el.classList.contains('face-up');
    if (wasFaceUp !== faceUp) {
      flipCardElement(el, faceUp, 300).then(() => {
        this._renderCardContent(el, card, faceUp);
      });
    } else {
      this._renderCardContent(el, card, faceUp);
    }
  }

  // ─── Board Rendering ──────────────────────────────────────────────────────

  renderBoard() {
    this.renderPlayers();
    this.renderCenter();
    this.renderScores();
    this.renderLog();
    this.updateButtons();
    this.updatePhaseInfo();
  }

  renderPlayers() {
    const game = this.game;
    const container = document.getElementById('table');
    if (!container) return;

    // Clear existing player areas (but not center)
    document.querySelectorAll('.player-area').forEach(el => el.remove());

    game.players.forEach((player, pIdx) => {
      if (player.eliminated) return;
      const area = document.createElement('div');
      area.className = `player-area player-pos-${pIdx}`;
      area.dataset.playerIdx = pIdx;
      if (player === game.currentPlayer) area.classList.add('active-player');
      if (player === game.caboCaller) area.classList.add('cabo-caller');

      const nameEl = document.createElement('div');
      nameEl.className = 'player-name';
      nameEl.textContent = player.name + (player === game.caboCaller ? ' [CABO]' : '');
      area.appendChild(nameEl);

      const scoreEl = document.createElement('div');
      scoreEl.className = 'player-score-inline';
      scoreEl.textContent = `Score: ${player.score}`;
      area.appendChild(scoreEl);

      const hand = document.createElement('div');
      hand.className = 'player-hand';
      this.renderHand(player, pIdx, hand);
      area.appendChild(hand);

      container.appendChild(area);
    });
  }

  renderHand(player, pIdx, container) {
    container.innerHTML = '';
    const isHuman = pIdx === 0;
    const game = this.game;

    player.hand.forEach((card, slotIdx) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'card-slot';
      wrapper.dataset.playerIdx = pIdx;
      wrapper.dataset.slotIdx = slotIdx;

      const showFace = card && (
        card.faceUp ||
        (game.phase === PHASES.PEEK_START && isHuman && (slotIdx === 2 || slotIdx === 3))
      );

      const cardEl = this.createCardElement(card, showFace);
      wrapper.appendChild(cardEl);

      // Selection click handler
      wrapper.addEventListener('click', () => this._handleSlotClick(pIdx, slotIdx));

      container.appendChild(wrapper);
    });
  }

  _handleSlotClick(pIdx, slotIdx) {
    if (!this.selectionMode) return;
    const { playerIndices, onSelect, onCancel } = this.selectionMode;
    if (!playerIndices.includes(pIdx)) return;

    const card = this.game.players[pIdx].hand[slotIdx];
    if (!card) return;

    this.clearSelectionMode();
    onSelect(pIdx, slotIdx);
  }

  renderCenter() {
    const game = this.game;
    const deckCount = document.getElementById('deck-count');
    const deckEl = document.getElementById('deck-pile');
    const discardEl = document.getElementById('discard-pile');
    const drawnEl = document.getElementById('drawn-card-area');

    if (deckCount) deckCount.textContent = game.deck.length;
    if (deckEl) {
      deckEl.className = `card face-down ${game.deck.length === 0 ? 'empty' : ''}`;
      deckEl.innerHTML = game.deck.length > 0 ? `<div class="card-back-pattern"></div>` : '<div class="empty-pile">Empty</div>';
    }

    if (discardEl) {
      const top = game.topDiscard;
      discardEl.innerHTML = '';
      if (top) {
        const cardEl = this.createCardElement(top, true);
        discardEl.appendChild(cardEl);
      } else {
        discardEl.innerHTML = '<div class="empty-pile">Discard</div>';
      }
    }

    if (drawnEl) {
      drawnEl.innerHTML = '';
      if (game.drawnCard) {
        const cardEl = this.createCardElement(game.drawnCard, true);
        drawnEl.appendChild(cardEl);
        this.drawnCardEl = cardEl;
      } else {
        this.drawnCardEl = null;
      }
    }
  }

  renderScores() {
    const game = this.game;
    const scoreBody = document.getElementById('score-body');
    if (!scoreBody) return;
    scoreBody.innerHTML = '';
    for (const player of game.players) {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${player.name}${player.eliminated ? ' ❌' : ''}</td>
        <td>${player.score}</td>
        <td>${player.roundScores.join(', ') || '—'}</td>
      `;
      scoreBody.appendChild(row);
    }
  }

  renderLog() {
    const logEl = document.getElementById('game-log');
    if (!logEl) return;
    logEl.innerHTML = '';
    const msgs = [...this.game.log].reverse().slice(0, 20);
    for (const msg of msgs) {
      const line = document.createElement('div');
      line.className = 'log-entry';
      line.textContent = msg;
      logEl.appendChild(line);
    }
  }

  updateButtons() {
    const game = this.game;
    const human = game.players[0];
    const isHumanTurn = game.currentPlayer === human;
    const phase = game.phase;

    const btnCabo = document.getElementById('btn-cabo');
    const btnDeck = document.getElementById('btn-deck');
    const btnDiscard = document.getElementById('btn-discard');
    const btnSwap = document.getElementById('btn-swap');
    const btnKeep = document.getElementById('btn-keep');

    const inTurn = phase === PHASES.PLAYER_TURN || phase === PHASES.FINAL_TURNS;
    const canAct = isHumanTurn && inTurn;
    const hasDrawn = !!game.drawnCard;

    if (btnCabo) {
      btnCabo.disabled = !(canAct && !hasDrawn && !game.caboCaller);
      btnCabo.classList.toggle('available', !btnCabo.disabled);
    }
    if (btnDeck) {
      btnDeck.disabled = !(canAct && !hasDrawn);
      btnDeck.classList.toggle('available', !btnDeck.disabled);
    }
    if (btnDiscard) {
      btnDiscard.disabled = !(canAct && !hasDrawn && game.discardPile.length > 0);
      btnDiscard.classList.toggle('available', !btnDiscard.disabled);
    }
    if (btnSwap) {
      btnSwap.disabled = !(canAct && hasDrawn);
      btnSwap.classList.toggle('available', !btnSwap.disabled);
    }
    if (btnKeep) {
      btnKeep.disabled = !(canAct && hasDrawn);
      btnKeep.classList.toggle('available', !btnKeep.disabled);
    }

    // Selection cancel button
    const cancelBtn = document.getElementById('btn-cancel-select');
    if (cancelBtn) cancelBtn.style.display = this.selectionMode ? 'inline-block' : 'none';
  }

  updatePhaseInfo() {
    const game = this.game;
    const phaseEl = document.getElementById('phase-info');
    const turnEl = document.getElementById('turn-info');
    const roundEl = document.getElementById('round-info');

    if (phaseEl) {
      const labels = {
        [PHASES.IDLE]: 'Waiting',
        [PHASES.DEALING]: 'Dealing...',
        [PHASES.PEEK_START]: 'Peek your cards!',
        [PHASES.PLAYER_TURN]: game.currentPlayer?.name + "'s Turn",
        [PHASES.ABILITY_PHASE]: 'Ability active!',
        [PHASES.CABO_CALLED]: 'Cabo Called!',
        [PHASES.FINAL_TURNS]: 'Final Turns',
        [PHASES.REVEAL]: 'Revealing...',
        [PHASES.SCORING]: 'Scoring',
        [PHASES.GAME_OVER]: 'Game Over!',
      };
      phaseEl.textContent = labels[game.phase] || game.phase;
    }
    if (turnEl) {
      turnEl.textContent = game.currentPlayer ? game.currentPlayer.name : '—';
    }
    if (roundEl) {
      roundEl.textContent = `Round ${game.roundNumber}`;
    }

    // Ability prompt
    const abilityPrompt = document.getElementById('ability-prompt');
    if (abilityPrompt) {
      if (game.phase === PHASES.ABILITY_PHASE && game.abilityContext) {
        const labels = {
          peek_self: '7/8: Peek at one of your cards',
          spy_other: "9/10: Spy on opponent's card",
          blind_swap: 'J/Q: Blind swap a card',
          spy_swap: 'K: Spy on opponent, then optionally swap',
        };
        abilityPrompt.textContent = labels[game.abilityContext.type] || '';
        abilityPrompt.style.display = 'block';
      } else {
        abilityPrompt.style.display = 'none';
      }
    }
  }

  // ─── Selection Mode ───────────────────────────────────────────────────────

  promptCardSelection({ players, playerIndices, prompt, onSelect, onCancel }) {
    this.selectionMode = { players, playerIndices, prompt, onSelect, onCancel };

    // Highlight selectable slots
    document.querySelectorAll('.card-slot').forEach(slot => {
      const pIdx = parseInt(slot.dataset.playerIdx);
      if (playerIndices.includes(pIdx)) {
        slot.classList.add('selectable');
      }
    });

    const selPrompt = document.getElementById('selection-prompt');
    if (selPrompt) {
      selPrompt.textContent = prompt;
      selPrompt.style.display = 'block';
    }
    this.updateButtons();
  }

  clearSelectionMode() {
    this.selectionMode = null;
    document.querySelectorAll('.card-slot.selectable').forEach(s => s.classList.remove('selectable'));
    const selPrompt = document.getElementById('selection-prompt');
    if (selPrompt) selPrompt.style.display = 'none';
    this.updateButtons();
  }

  promptSwapDecision(card, callback) {
    const modal = document.getElementById('swap-modal');
    const cardPreview = document.getElementById('swap-modal-card');
    const yesBtn = document.getElementById('swap-yes');
    const noBtn = document.getElementById('swap-no');

    if (!modal) {
      callback(false);
      return;
    }

    if (cardPreview) {
      cardPreview.innerHTML = '';
      cardPreview.appendChild(this.createCardElement(card, true));
    }

    modal.style.display = 'flex';

    const cleanup = (result) => {
      modal.style.display = 'none';
      yesBtn.removeEventListener('click', onYes);
      noBtn.removeEventListener('click', onNo);
      callback(result);
    };
    const onYes = () => cleanup(true);
    const onNo = () => cleanup(false);

    yesBtn.addEventListener('click', onYes, { once: true });
    noBtn.addEventListener('click', onNo, { once: true });
  }

  // ─── Card Flash (peek/spy reveal) ────────────────────────────────────────

  flashCard(player, slotIdx, card, duration, onDone) {
    const pIdx = this.game.players.indexOf(player);
    const slot = document.querySelector(
      `.card-slot[data-player-idx="${pIdx}"][data-slot-idx="${slotIdx}"]`
    );
    if (!slot) { if (onDone) onDone(); return; }

    const cardEl = slot.querySelector('.card');
    if (!cardEl) { if (onDone) onDone(); return; }

    flipCardElement(cardEl, true, 300).then(() => {
      this._renderCardContent(cardEl, card, true);
      setTimeout(() => {
        flipCardElement(cardEl, false, 300).then(() => {
          this._renderCardContent(cardEl, null, false);
          if (onDone) onDone();
        });
      }, duration);
    });
  }

  // Show all scores as floating score elements
  showRevealScores() {
    const game = this.game;
    const table = document.getElementById('table');
    if (!table) return;

    game.players.forEach((player, pIdx) => {
      if (player.eliminated) return;
      player.hand.forEach((card, slotIdx) => {
        if (!card) return;
        const slot = document.querySelector(
          `.card-slot[data-player-idx="${pIdx}"][data-slot-idx="${slotIdx}"]`
        );
        if (slot) showFloatingScore(slot, card.value, table);
      });
    });
  }

  showModal(title, body, buttonLabel = 'OK') {
    return new Promise(resolve => {
      const modal = document.getElementById('info-modal');
      const titleEl = document.getElementById('info-modal-title');
      const bodyEl = document.getElementById('info-modal-body');
      const okBtn = document.getElementById('info-modal-ok');

      if (!modal) { resolve(); return; }

      titleEl.textContent = title;
      bodyEl.innerHTML = body;
      okBtn.textContent = buttonLabel;
      modal.style.display = 'flex';

      okBtn.addEventListener('click', () => {
        modal.style.display = 'none';
        resolve();
      }, { once: true });
    });
  }
}

export { UIRenderer };
