// animations.js - Card flip, deal, swap animations

function flipCardElement(cardEl, toFaceUp, duration = 400) {
  return new Promise(resolve => {
    cardEl.style.transition = `transform ${duration / 2}ms ease-in`;
    cardEl.style.transform = 'rotateY(90deg)';
    setTimeout(() => {
      if (toFaceUp) {
        cardEl.classList.add('face-up');
        cardEl.classList.remove('face-down');
      } else {
        cardEl.classList.add('face-down');
        cardEl.classList.remove('face-up');
      }
      cardEl.style.transition = `transform ${duration / 2}ms ease-out`;
      cardEl.style.transform = 'rotateY(0deg)';
      setTimeout(() => {
        cardEl.style.transition = '';
        cardEl.style.transform = '';
        resolve();
      }, duration / 2);
    }, duration / 2);
  });
}

function dealAnimation(cardEl, targetX, targetY, duration = 400) {
  return new Promise(resolve => {
    cardEl.style.transition = 'none';
    cardEl.style.transform = 'translate(-50vw, -50vh) scale(0.5)';
    cardEl.style.opacity = '0';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        cardEl.style.transition = `transform ${duration}ms ease-out, opacity ${duration}ms ease-out`;
        cardEl.style.transform = 'translate(0,0) scale(1)';
        cardEl.style.opacity = '1';
        setTimeout(() => {
          cardEl.style.transition = '';
          resolve();
        }, duration);
      });
    });
  });
}

function pulseAnimation(el) {
  el.classList.add('pulse');
  el.addEventListener('animationend', () => el.classList.remove('pulse'), { once: true });
}

function showFloatingScore(el, value, container) {
  const float = document.createElement('div');
  float.className = 'floating-score';
  float.textContent = value >= 0 ? `+${value}` : value;
  float.style.color = value <= 3 ? '#4ade80' : value >= 8 ? '#f87171' : '#fbbf24';

  const rect = el.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  float.style.left = (rect.left - containerRect.left + rect.width / 2) + 'px';
  float.style.top = (rect.top - containerRect.top) + 'px';

  container.appendChild(float);
  setTimeout(() => float.remove(), 1200);
}

function highlightElement(el, duration = 2000) {
  el.classList.add('highlighted');
  setTimeout(() => el.classList.remove('highlighted'), duration);
}

export { flipCardElement, dealAnimation, pulseAnimation, showFloatingScore, highlightElement };
