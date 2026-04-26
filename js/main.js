// main.js - App entry point

import { GameState, PHASES } from './game.js';
import { UIRenderer } from './ui.js';
import { AbilityHandler } from './abilities.js';
import { AIPlayer } from './ai.js';

let game, ui, abilityHandler, aiPlayers;
let peekTimer = null;
let aiTurnTimeout = null;
let stuckWatchdog = null;

// ── Debug log ────────────────────────────────────────────────────
const debugLog = [];
function dbg(msg) {
  const ts = new Date().toISOString().substring(11, 23);
  debugLog.push(`[${ts}] ${msg}`);
  if (debugLog.length > 500) debugLog.shift();
}
function gameSnapshot() {
  if (!game || !game.players.length) return '(no game)';
  const players = game.players.map(p =>
    `  ${p.name}${p.eliminated ? '[OUT]' : ''}: score=${p.score} ` +
    `hand=[${p.hand.map(c => c ? `${c.rank}${c.suit}(${c.faceUp ? 'up' : 'dn'})` : 'null').join(',')}]`
  ).join('\n');
  const drawn = game.drawnCard ? `${game.drawnCard.rank}${game.drawnCard.suit}` : 'none';
  return `Round=${game.roundNumber} Phase=${game.phase} Current=${game.currentPlayer?.name} Drawn=${drawn}\n${players}`;
}

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

  document.getElementById('btn-info')?.addEventListener('click', () => {
    document.getElementById('abilities-modal').style.display = 'flex';
  });
  document.getElementById('btn-rules')?.addEventListener('click', () => {
    document.getElementById('rules-modal').style.display = 'flex';
  });
  document.getElementById('btn-export-log')?.addEventListener('click', exportDebugLog);

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
  game.on('log', msg => { ui.renderLog(); dbg('LOG: ' + msg); });

  game.on('roundStart', ({ round }) => {
    dbg(`--- ROUND ${round} START ---`);
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
    dbg(`TURN_START: ${player.name} phase=${game.phase}`);
    ui.renderBoard();
    scheduleAITurn(player);
  });

  game.on('aiError', ({ msg, stack }) => {
    dbg(`AI_ERROR: ${msg}\n${stack}`);
    console.error('[Cabo AI Error]', msg, stack);
    ui.renderBoard();
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
          dbg(`WATCHDOG_FIRED: forcing endAction for ${cp.name}, phase=${phase}`);
          dbg(gameSnapshot());
          game.drawnCard = null;
          if (phase === PHASES.ABILITY_PHASE) game.abilityContext = null;
          game.endAction();
          ui.renderBoard();
        }
      }
    }, 4000);
  }, 300);
}

function exportDebugLog() {
  const lines = [
    '=== Cabo Debug Log ===',
    `Exported: ${new Date().toISOString()}`,
    '',
    '--- Current Game State ---',
    gameSnapshot(),
    '',
    '--- Event Log ---',
    ...debugLog,
  ];
  const content = lines.join('\n');

  // Populate the modal textarea
  const textarea = document.getElementById('debug-log-text');
  if (textarea) textarea.value = content;

  // Wire the download button each time (content changes)
  const dlBtn = document.getElementById('debug-download-btn');
  if (dlBtn) {
    dlBtn.onclick = () => {
      try {
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `cabo-debug-${Date.now()}.txt`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);
      } catch (e) {
        alert('Download failed — use Copy to Clipboard instead.');
      }
    };
  }

  document.getElementById('debug-modal').style.display = 'flex';
}

document.addEventListener('DOMContentLoaded', init);
