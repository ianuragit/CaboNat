// deck.js - Deck creation, shuffle, draw

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function getCardValue(rank) {
  if (rank === 'A') return 1;
  if (rank === 'K') return 0;
  if (rank === 'J' || rank === 'Q') return 10;
  return parseInt(rank);
}

function createDeck() {
  const deck = [];
  let id = 0;
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({
        id: id++,
        rank,
        suit,
        value: getCardValue(rank),
        faceUp: false,
      });
    }
  }
  return deck;
}

function shuffle(deck) {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

function drawCard(deck) {
  return deck.pop();
}

function isRedSuit(suit) {
  return suit === '♥' || suit === '♦';
}

function getAbility(rank) {
  if (rank === '7' || rank === '8') return 'peek_self';
  if (rank === '9' || rank === '10') return 'spy_other';
  if (rank === 'J' || rank === 'Q') return 'blind_swap';
  if (rank === 'K') return 'spy_swap';
  return null;
}

export { createDeck, shuffle, drawCard, isRedSuit, getAbility, getCardValue };
