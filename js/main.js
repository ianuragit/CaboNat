// main.js - App entry point

import { GameState, PHASES } from './game.js';
import { UIRenderer } from './ui.js';
import { AbilityHandler } from './abilities.js';
import { AIPlayer } from './ai.js';

let game, ui, abilityHandler, aiPlayers;
let peekTimer = null;
let aiTurnTimeout = null;
let stuckWatchdog = null;

function init() {
  game = new GameState();
  ui = new UIRenderer(game);
  abilityHandler = new AbilityHandler(game, ui);
  aiPlayers = [];

  bindStaticButtons();
  setupGameEvents();

  // Show the start screen
  document.getElementById('start-screen').style.display = 'flex';
  document.getElementById('game-screen').style.display = 'none';
}

function bindStaticButtons() {
  document.getElementById('btn-start-game')?.addEventListener('click', startGame);
  document.getElementById('btn-new-game')?.addEventListener('click', () => {
    if (peekTimer) { clearTimeout(peekTimer); peekTimer = null; }
    document.getElementById('start-screen').style.display = 'flex';
    document.getElementById('game-screen').style.display = 'none';
  });
  document.getElementById('btn-new-round')?.addEventListener('click', newRound);

  document.getElementById('btn-info')?.addEventListener('click', showAbilityInfo);
  document.getElementById('btn-rules')?.addEventListener('click', showRules);

  document.getElementById('btn-cabo')?.addEventListener('click', () => {
    if (game.phase !== PHASES.PLAYER_TURN) return;
    if (game.currentPlayer !== game.players[0]) return;
    game.callCabo();
  });

  document.getElementById('btn-deck')?.addEventListener('click', () => {
    if (!isHumanTurnReady()) return;
    game.drawFromDeck();
    ui.renderCenter();
    ui.updateButtons();
    ui.updatePhaseInfo();
  });

  document.getElementById('btn-discard-take')?.addEventListener('click', () => {
    if (!isHumanTurnReady()) return;
    game.takeFromDiscard();
    ui.renderCenter();
    ui.updateButtons();
    ui.updatePhaseInfo();
  });

  document.getElementById('btn-swap')?.addEventListener('click', () => {
    if (!isHumanTurnReady(true)) return;
    const human = game.players[0];
    ui.promptCardSelection({
      players: [human],
      playerIndices: [0],
      prompt: 'Choose your card to replace',
      onSelect: (pIdx, slotIdx) => {
        game.swapDrawnWithSlot(slotIdx);
        ui.renderBoard();
      }
    });
  });

  document.getElementById('btn-keep')?.addEventListener('click', () => {
    if (!isHumanTurnReady(true)) return;
    game.discardDrawn(null);
    ui.renderBoard();
  });

  document.getElementById('btn-cancel-select')?.addEventListener('click', () => {
    ui.clearSelectionMode();
    // If cancelled mid-ability, skip the ability so the turn can proceed
    if (game.phase === PHASES.ABILITY_PHASE) {
      game.abilityDone();
    }
  });
}

function isHumanTurnReady(needsDrawn = false) {
  const human = game.players[0];
  const isHumanTurn = game.currentPlayer === human;
  const inTurn = game.phase === PHASES.PLAYER_TURN || game.phase === PHASES.FINAL_TURNS;
  if (!isHumanTurn || !inTurn) return false;
  if (needsDrawn && !game.drawnCard) return false;
  if (!needsDrawn && game.drawnCard) return false;
  return true;
}

function setupGameEvents() {
  game.on('log', () => ui.renderLog());

  game.on('roundStart', () => {
    ui.renderBoard();
    setupAIPlayers();
    startPeekPhase();
  });

  game.on('phaseChange', () => {
    ui.renderBoard();
  });

  game.on('cardDrawn', () => {
    ui.renderCenter();
    ui.updateButtons();
  });

  game.on('cardSwapped', ({ player, slotIdx }) => {
    ui.renderPlayers();
    ui.renderCenter();
    ui.updateButtons();
    ui.updatePhaseInfo();
  });

  game.on('cardDiscarded', () => {
    ui.renderCenter();
    ui.updateButtons();
    ui.updatePhaseInfo();
  });

  game.on('caboCalled', () => {
    ui.renderBoard();
  });

  game.on('abilityTriggered', ({ ability, player }) => {
    ui.updatePhaseInfo();
    ui.renderBoard();
    abilityHandler.handle(ability, player.isAI);
  });

  game.on('swapDone', () => {
    ui.renderPlayers();
  });

  game.on('reveal', () => {
    ui.renderBoard();
    setTimeout(() => ui.showRevealScores(), 400);
  });

  game.on('roundEnd', async ({ totals, minTotal, winners }) => {
    ui.renderBoard();

    const resultLines = totals.map(({ player, total }) => {
      const isWinner = total === minTotal;
      const pen = player === game.caboCaller && total > minTotal ? ' (+10 penalty)' : '';
      return `<div class="${isWinner ? 'winner-row' : ''}">${player.name}: ${total}${pen} → Total: ${player.score}</div>`;
    }).join('');

    const winnerNames = winners.map(w => w.player.name).join(', ');
    await ui.showModal(
      `Round ${game.roundNumber} Results`,
      `<div class="round-results">${resultLines}</div><div class="round-winner">Winner: ${winnerNames}</div>`,
      'Next Round'
    );

    newRound();
  });

  game.on('gameOver', async ({ winner }) => {
    ui.renderBoard();
    await ui.showModal(
      '🏆 Game Over!',
      `<div class="game-over-msg">${winner.name} wins the game!</div>
       <div class="final-scores">${game.players.map(p =>
         `<div>${p.name}: ${p.score} pts</div>`
       ).join('')}</div>`,
      'Play Again'
    );
    document.getElementById('start-screen').style.display = 'flex';
    document.getElementById('game-screen').style.display = 'none';
  });

  game.on('turnStart', ({ player }) => {
    ui.renderBoard();
    scheduleAITurn(player);
  });
}

function setupAIPlayers() {
  aiPlayers = game.players
    .filter(p => p.isAI && !p.eliminated)
    .map(p => new AIPlayer(p, game, abilityHandler));
}

function startPeekPhase() {
  ui.renderBoard();
  // Show bottom 2 cards to human for 2.5 seconds
  document.getElementById('peek-overlay')?.classList.add('show');

  peekTimer = setTimeout(() => {
    document.getElementById('peek-overlay')?.classList.remove('show');
    game.peekStartDone();
    ui.renderBoard();
  }, 2500);
}

function newRound() {
  if (peekTimer) { clearTimeout(peekTimer); peekTimer = null; }
  if (aiTurnTimeout) { clearTimeout(aiTurnTimeout); aiTurnTimeout = null; }
  if (stuckWatchdog) { clearTimeout(stuckWatchdog); stuckWatchdog = null; }
  ui.clearSelectionMode();
  game.startRound();
}

function startGame() {
  const count = parseInt(document.getElementById('player-count')?.value || '2');
  document.getElementById('start-screen').style.display = 'none';
  document.getElementById('game-screen').style.display = 'flex';

  game = new GameState();
  ui = new UIRenderer(game);
  abilityHandler = new AbilityHandler(game, ui);
  aiPlayers = [];

  setupGameEvents();
  game.initGame(count);
}

function scheduleAITurn(player) {
  if (!player.isAI) return;
  if (game.phase !== PHASES.PLAYER_TURN && game.phase !== PHASES.FINAL_TURNS) return;

  const aiPlayer = aiPlayers.find(ai => ai.player === player);
  if (!aiPlayer) return;

  clearTimeout(stuckWatchdog);
  aiTurnTimeout = setTimeout(() => {
    aiPlayer.takeTurn();
    // Watchdog: if game is still stuck in AI turn after 6s, force endAction
    stuckWatchdog = setTimeout(() => {
      const cp = game.currentPlayer;
      if (cp && cp.isAI) {
        const phase = game.phase;
        if (phase === PHASES.PLAYER_TURN || phase === PHASES.FINAL_TURNS || phase === PHASES.ABILITY_PHASE) {
          game.drawnCard = null;
          if (phase === PHASES.ABILITY_PHASE) game.abilityContext = null;
          game.endAction();
          ui.renderBoard();
        }
      }
    }, 6000);
  }, 300);
}

function showAbilityInfo() {
  ui.showModal(
    'Card Abilities',
    `<table style="width:100%;border-collapse:collapse;font-size:0.9rem;">
      <thead><tr style="color:var(--gold)"><th style="text-align:left;padding:6px 4px">Card</th><th style="text-align:left;padding:6px 4px">Ability (when discarded)</th></tr></thead>
      <tbody>
        <tr><td style="padding:5px 4px;font-weight:bold;color:#fbbf24">7 / 8</td><td style="padding:5px 4px;color:#e8ead0">Peek at any one of <em>your own</em> face-down cards</td></tr>
        <tr style="background:rgba(255,255,255,0.04)"><td style="padding:5px 4px;font-weight:bold;color:#fbbf24">9 / 10</td><td style="padding:5px 4px;color:#e8ead0">Spy on any one of an <em>opponent's</em> cards</td></tr>
        <tr><td style="padding:5px 4px;font-weight:bold;color:#fbbf24">J / Q</td><td style="padding:5px 4px;color:#e8ead0">Blind swap — exchange one of your cards with an opponent's <em>without looking</em></td></tr>
        <tr style="background:rgba(255,255,255,0.04)"><td style="padding:5px 4px;font-weight:bold;color:#4ade80">K&nbsp;<span style="font-size:0.75em">(= 0 pts)</span></td><td style="padding:5px 4px;color:#e8ead0">Look at one opponent's card, then <em>optionally</em> swap it with one of yours</td></tr>
      </tbody>
    </table>
    <p style="margin-top:10px;font-size:0.78rem;color:#8aad96">Abilities only trigger when you <strong>discard</strong> the drawn card — not when you swap it into your hand.</p>`,
    'Got it'
  );
}

function showRules() {
  ui.showModal(
    'How to Play Cabo',
    `<div style="text-align:left;font-size:0.85rem;line-height:1.6;max-height:60vh;overflow-y:auto;padding-right:6px">
      <p style="color:var(--gold);font-weight:bold;margin-bottom:6px">Objective</p>
      <p style="color:#e8ead0">Have the <strong>lowest total hand value</strong> when "Cabo" is called. Kings = 0, Aces = 1, J/Q = 10, others = face value.</p>

      <p style="color:var(--gold);font-weight:bold;margin:10px 0 6px">Setup</p>
      <p style="color:#e8ead0">Each player gets 4 face-down cards. At the start you secretly peek at your <strong>bottom 2 cards</strong> (slots 3 & 4).</p>

      <p style="color:var(--gold);font-weight:bold;margin:10px 0 6px">Your Turn</p>
      <ol style="color:#e8ead0;padding-left:18px;margin:0">
        <li><strong>Call Cabo</strong> — skip drawing; triggers final turns for everyone else</li>
        <li><strong>Draw from Deck</strong> — draw the top card face-up</li>
        <li><strong>Take Discard</strong> — take the top discard card</li>
      </ol>
      <p style="color:#e8ead0;margin-top:6px">After drawing, choose:</p>
      <ul style="color:#e8ead0;padding-left:18px;margin:0">
        <li><strong>Swap with Hand</strong> — replace one of your cards (your old card is discarded)</li>
        <li><strong>Discard Drawn Card</strong> — discard it and trigger its ability if it has one (7/8/9/10/J/Q/K)</li>
      </ul>

      <p style="color:var(--gold);font-weight:bold;margin:10px 0 6px">Calling Cabo</p>
      <p style="color:#e8ead0">On your turn, instead of drawing, you can call <strong>Cabo</strong>. Every other player gets one final turn, then all hands are revealed.</p>
      <p style="color:#f87171;margin-top:4px">⚠ If you call Cabo but don't have the lowest hand, you get a <strong>+10 point penalty</strong>!</p>

      <p style="color:var(--gold);font-weight:bold;margin:10px 0 6px">Scoring & Winning</p>
      <p style="color:#e8ead0">The player with the <strong>lowest hand total wins the round</strong>. All players add their hand total to their score. Reach <strong>100 points → eliminated</strong>. The last player standing wins.</p>
    </div>`,
    'Close'
  );
}

document.addEventListener('DOMContentLoaded', init);
