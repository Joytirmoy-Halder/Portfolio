/* ============ Custom cursor ============ */
const dot = document.querySelector('.cursor-dot');
const ring = document.querySelector('.cursor-ring');

let mouseX = 0, mouseY = 0;
let ringX = 0, ringY = 0;

document.addEventListener('mousemove', (e) => {
  mouseX = e.clientX;
  mouseY = e.clientY;
  dot.style.transform = `translate(${mouseX}px, ${mouseY}px) translate(-50%, -50%)`;
});

function animateRing() {
  ringX += (mouseX - ringX) * 0.18;
  ringY += (mouseY - ringY) * 0.18;
  ring.style.transform = `translate(${ringX}px, ${ringY}px) translate(-50%, -50%)`;
  requestAnimationFrame(animateRing);
}
animateRing();

/* Hover state for interactive elements */
const hoverables = document.querySelectorAll('a, button, [data-tilt], [data-magnetic]');
hoverables.forEach(el => {
  el.addEventListener('mouseenter', () => ring.classList.add('hover'));
  el.addEventListener('mouseleave', () => ring.classList.remove('hover'));
});

/* ============ Magnetic effect ============ */
document.querySelectorAll('[data-magnetic]').forEach(el => {
  el.addEventListener('mousemove', (e) => {
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    el.style.transform = `translate(${x * 0.25}px, ${y * 0.4}px)`;
  });
  el.addEventListener('mouseleave', () => {
    el.style.transform = '';
  });
});

/* ============ Tilt effect ============ */
document.querySelectorAll('[data-tilt]').forEach(card => {
  card.addEventListener('mousemove', (e) => {
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const rx = ((y - cy) / cy) * -6;
    const ry = ((x - cx) / cx) * 6;
    card.style.transform = `perspective(1200px) rotateX(${rx}deg) rotateY(${ry}deg) translateZ(0)`;
    card.style.setProperty('--mouse-x', `${x}px`);
    card.style.setProperty('--mouse-y', `${y}px`);
  });
  card.addEventListener('mouseleave', () => {
    card.style.transform = '';
  });
});

/* ============ Scroll reveal ============ */
const revealItems = document.querySelectorAll('[data-reveal]');
const revealObs = new IntersectionObserver((entries) => {
  entries.forEach((entry, i) => {
    if (entry.isIntersecting) {
      setTimeout(() => entry.target.classList.add('in-view'), i * 60);
      revealObs.unobserve(entry.target);
    }
  });
}, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });

revealItems.forEach(el => revealObs.observe(el));

/* Specifically watch about-text for highlight effect */
const aboutText = document.querySelector('.about-text');
if (aboutText) {
  const aboutObs = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) entry.target.classList.add('in-view');
    });
  }, { threshold: 0.4 });
  aboutObs.observe(aboutText);
}

/* ============ Counter animation ============ */
const counters = document.querySelectorAll('[data-count]');
const counterObs = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const el = entry.target;
      const target = parseInt(el.dataset.count, 10);
      const duration = 1600;
      const start = performance.now();
      const tick = (now) => {
        const t = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - t, 3);
        el.textContent = Math.floor(eased * target);
        if (t < 1) requestAnimationFrame(tick);
        else el.textContent = target;
      };
      requestAnimationFrame(tick);
      counterObs.unobserve(el);
    }
  });
}, { threshold: 0.6 });
counters.forEach(c => counterObs.observe(c));

/* ============ Scroll progress + nav state ============ */
const progress = document.getElementById('scrollProgress');
const nav = document.getElementById('nav');

window.addEventListener('scroll', () => {
  const h = document.documentElement;
  const scrolled = (h.scrollTop / (h.scrollHeight - h.clientHeight)) * 100;
  progress.style.width = `${scrolled}%`;

  if (h.scrollTop > 30) nav.classList.add('scrolled');
  else nav.classList.remove('scrolled');
}, { passive: true });

/* ============ Theme toggle ============ */
const themeBtn = document.getElementById('themeToggle');
const root = document.documentElement;

const stored = localStorage.getItem('theme');
if (stored) root.setAttribute('data-theme', stored);

themeBtn.addEventListener('click', () => {
  const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  root.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
});

/* ============ Mobile menu ============ */
const menuBtn = document.getElementById('menuBtn');
const navLinks = document.querySelector('.nav-links');

if (menuBtn && navLinks) {
  menuBtn.addEventListener('click', () => {
    menuBtn.classList.toggle('open');
    navLinks.classList.toggle('open');
  });

  navLinks.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      menuBtn.classList.remove('open');
      navLinks.classList.remove('open');
    });
  });
}

/* ============ Particle background ============ */
const canvas = document.getElementById('bg-canvas');
const ctx = canvas.getContext('2d');
let particles = [];
let dpr = Math.min(window.devicePixelRatio || 1, 2);

function resize() {
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  canvas.style.width = window.innerWidth + 'px';
  canvas.style.height = window.innerHeight + 'px';
  ctx.scale(dpr, dpr);
}
resize();
window.addEventListener('resize', () => {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  resize();
  initParticles();
});

function getAccentColors() {
  const styles = getComputedStyle(root);
  return [
    styles.getPropertyValue('--accent').trim(),
    styles.getPropertyValue('--accent-2').trim(),
    styles.getPropertyValue('--accent-3').trim(),
  ];
}

function initParticles() {
  const count = Math.min(70, Math.floor((window.innerWidth * window.innerHeight) / 22000));
  particles = [];
  const colors = getAccentColors();
  for (let i = 0; i < count; i++) {
    particles.push({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      r: Math.random() * 1.6 + 0.4,
      color: colors[Math.floor(Math.random() * colors.length)],
    });
  }
}
initParticles();

let mx = window.innerWidth / 2, my = window.innerHeight / 2;
window.addEventListener('mousemove', (e) => {
  mx = e.clientX; my = e.clientY;
});

function tick() {
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

  // Update and draw particles
  for (const p of particles) {
    p.x += p.vx; p.y += p.vy;
    if (p.x < 0 || p.x > window.innerWidth) p.vx *= -1;
    if (p.y < 0 || p.y > window.innerHeight) p.vy *= -1;

    ctx.beginPath();
    ctx.fillStyle = p.color;
    ctx.globalAlpha = 0.7;
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Connect close particles
  ctx.globalAlpha = 1;
  for (let i = 0; i < particles.length; i++) {
    for (let j = i + 1; j < particles.length; j++) {
      const a = particles[i], b = particles[j];
      const dx = a.x - b.x, dy = a.y - b.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < 130) {
        ctx.beginPath();
        ctx.strokeStyle = a.color;
        ctx.globalAlpha = (1 - d / 130) * 0.18;
        ctx.lineWidth = 0.6;
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
  }

  // Mouse repel
  for (const p of particles) {
    const dx = p.x - mx, dy = p.y - my;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < 120) {
      const force = (120 - d) / 120;
      p.x += (dx / d) * force * 0.8;
      p.y += (dy / d) * force * 0.8;
    }
  }

  ctx.globalAlpha = 1;
  requestAnimationFrame(tick);
}
tick();

/* Re-init particles on theme change so colors match */
const themeObs = new MutationObserver(() => initParticles());
themeObs.observe(root, { attributes: true, attributeFilter: ['data-theme'] });

/* ============ Smooth anchor offset ============ */
document.querySelectorAll('a[href^="#"]').forEach(link => {
  link.addEventListener('click', (e) => {
    const id = link.getAttribute('href');
    if (id.length <= 1) return;
    const target = document.querySelector(id);
    if (target) {
      e.preventDefault();
      const top = target.getBoundingClientRect().top + window.scrollY - 80;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  });
});

/* ============ Hero word stagger reveal ============ */
window.addEventListener('load', () => {
  document.querySelectorAll('.hero-title .word').forEach((word, i) => {
    word.style.opacity = '0';
    word.style.transform = 'translateY(100%)';
    word.style.transition = `opacity 0.8s ${0.1 + i * 0.08}s cubic-bezier(0.22, 1, 0.36, 1), transform 0.8s ${0.1 + i * 0.08}s cubic-bezier(0.22, 1, 0.36, 1)`;
    requestAnimationFrame(() => {
      word.style.opacity = '1';
      word.style.transform = 'translateY(0)';
    });
  });
});

/* ============ Preloader ============ */
const preloader = document.getElementById('preloader');
const plFill = preloader?.querySelector('.preloader-fill');
const plPct = document.getElementById('plPct');
let plProgress = 0;
const plTick = setInterval(() => {
  plProgress += Math.random() * 18 + 6;
  if (plProgress >= 100) {
    plProgress = 100;
    clearInterval(plTick);
    setTimeout(() => preloader?.classList.add('done'), 280);
  }
  if (plFill) plFill.style.width = `${plProgress}%`;
  if (plPct) plPct.textContent = Math.floor(plProgress);
}, 110);

/* Failsafe: hide preloader after 4s no matter what */
setTimeout(() => preloader?.classList.add('done'), 4000);

/* ============ Cursor-follow spotlight ============ */
const spotlight = document.getElementById('spotlight');
let spotX = window.innerWidth / 2, spotY = window.innerHeight / 2;
let spotTargetX = spotX, spotTargetY = spotY;
document.addEventListener('mousemove', (e) => {
  spotTargetX = e.clientX;
  spotTargetY = e.clientY;
});
function spotlightTick() {
  spotX += (spotTargetX - spotX) * 0.08;
  spotY += (spotTargetY - spotY) * 0.08;
  if (spotlight) spotlight.style.transform = `translate(${spotX}px, ${spotY}px) translate(-50%, -50%)`;
  requestAnimationFrame(spotlightTick);
}
spotlightTick();

/* ============ Text scramble effect ============ */
class Scramble {
  constructor(el) {
    this.el = el;
    this.original = el.textContent;
    this.chars = '!<>-_\\/[]{}—=+*^?#________';
    this.queue = [];
    this.frame = 0;
    this.running = false;
  }
  setText(newText) {
    if (this.running) return;
    this.running = true;
    const oldText = this.el.textContent;
    const length = Math.max(oldText.length, newText.length);
    this.queue = [];
    for (let i = 0; i < length; i++) {
      const from = oldText[i] || '';
      const to = newText[i] || '';
      const start = Math.floor(Math.random() * 30);
      const end = start + Math.floor(Math.random() * 30);
      this.queue.push({ from, to, start, end, char: '' });
    }
    this.frame = 0;
    this.update();
  }
  update() {
    let output = '';
    let complete = 0;
    for (let i = 0, n = this.queue.length; i < n; i++) {
      let { from, to, start, end, char } = this.queue[i];
      if (this.frame >= end) { complete++; output += to; }
      else if (this.frame >= start) {
        if (!char || Math.random() < 0.28) {
          char = this.chars[Math.floor(Math.random() * this.chars.length)];
          this.queue[i].char = char;
        }
        output += `<span style="color:var(--accent-2)">${char}</span>`;
      } else { output += from; }
    }
    this.el.innerHTML = output;
    if (complete === this.queue.length) {
      this.running = false;
      this.el.textContent = this.queue.map(q => q.to).join('');
    } else {
      this.frame++;
      requestAnimationFrame(() => this.update());
    }
  }
}

document.querySelectorAll('[data-scramble]').forEach(el => {
  const scrambler = new Scramble(el);
  const original = el.textContent;
  const alts = ['WordPress', 'WooCommerce', 'Websites', 'Storefronts', 'Interfaces', 'Plugins'];
  let idx = 0;
  setInterval(() => {
    idx = (idx + 1) % alts.length;
    scrambler.setText(alts[idx]);
  }, 3500);
  el.addEventListener('mouseenter', () => {
    scrambler.setText(original);
  });
});

/* ============ Section indicator dots ============ */
const dots = document.querySelectorAll('.section-dots a');
const sections = ['home', 'about', 'skills', 'design', 'work', 'contact']
  .map(id => document.getElementById(id))
  .filter(Boolean);

const sectionObs = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const id = entry.target.id;
      dots.forEach(d => d.classList.toggle('active', d.getAttribute('href') === `#${id}`));
    }
  });
}, { threshold: 0.4 });
sections.forEach(s => sectionObs.observe(s));

/* ============ Skill bars fill on scroll ============ */
const bars = document.querySelectorAll('.skill-bar-fill[data-fill]');
const barObs = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const fill = entry.target.dataset.fill;
      entry.target.style.width = `${fill}%`;
      barObs.unobserve(entry.target);
    }
  });
}, { threshold: 0.5 });
bars.forEach(b => barObs.observe(b));

/* ============ Toast utility ============ */
const toast = document.getElementById('toast');
let toastTimer;
function showToast(msg) {
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2400);
}

/* ============ Keyboard shortcuts ============ */
let keyBuffer = '';
document.addEventListener('keydown', (e) => {
  if (e.target.matches('input, textarea')) return;

  // Single-key navigation
  const map = {
    'g': () => { window.scrollTo({ top: 0, behavior: 'smooth' }); showToast('↑ Top'); },
    'd': () => { document.getElementById('design')?.scrollIntoView({ behavior: 'smooth' }); showToast('Design section'); },
    'w': () => { document.getElementById('work')?.scrollIntoView({ behavior: 'smooth' }); showToast('Work section'); },
    'c': () => { document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' }); showToast('Contact section'); },
    't': () => { document.getElementById('themeToggle')?.click(); showToast('Theme toggled'); },
  };
  const action = map[e.key.toLowerCase()];
  if (action && !e.ctrlKey && !e.metaKey && !e.altKey) action();

  // Easter egg: type "design"
  keyBuffer = (keyBuffer + e.key.toLowerCase()).slice(-10);
  if (keyBuffer.endsWith('design')) {
    document.body.style.animation = 'none';
    document.body.offsetHeight;
    document.body.style.animation = '';
    showToast('🎨 Design mode unlocked — keep building.');
    document.querySelectorAll('.mock').forEach((m, i) => {
      m.style.animation = `pl-bounce 0.6s ${i * 0.1}s var(--ease)`;
      setTimeout(() => m.style.animation = '', 1200 + i * 100);
    });
  }
});

/* Show keyboard hint after 8s (desktop only) */
setTimeout(() => {
  if (window.innerWidth > 768) {
    showToast('Tip: press D for Design, W for Work, T to toggle theme');
  }
}, 8500);

/* ============ Avatar parallax (subtle pan) ============ */
const portrait = document.querySelector('.about-portrait img');
const portraitWrap = document.querySelector('.about-portrait');
if (portrait && portraitWrap) {
  portraitWrap.addEventListener('mousemove', (e) => {
    const rect = portraitWrap.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width - 0.5) * 20;
    const y = ((e.clientY - rect.top) / rect.height - 0.5) * 20;
    portrait.style.transform = `scale(1.08) translate(${x}px, ${y}px)`;
  });
  portraitWrap.addEventListener('mouseleave', () => {
    portrait.style.transform = '';
  });
}

/* ============ Project ripple on click ============ */
document.querySelectorAll('.project').forEach(p => {
  p.addEventListener('click', (e) => {
    const rect = p.getBoundingClientRect();
    const ripple = document.createElement('span');
    ripple.style.cssText = `
      position: absolute;
      left: ${e.clientX - rect.left}px;
      top: ${e.clientY - rect.top}px;
      width: 8px; height: 8px;
      background: var(--accent);
      border-radius: 50%;
      transform: translate(-50%, -50%);
      pointer-events: none;
      animation: ripple 0.7s ease-out forwards;
      z-index: 0;
    `;
    p.appendChild(ripple);
    setTimeout(() => ripple.remove(), 700);
  });
});

const rippleStyle = document.createElement('style');
rippleStyle.textContent = `
  @keyframes ripple {
    to { width: 600px; height: 600px; opacity: 0; }
  }
`;
document.head.appendChild(rippleStyle);

/* ============ Email popover ============ */
const EMAIL = 'joyti.halder25@gmail.com';
const emailTrigger = document.getElementById('emailTrigger');
const emailPop = document.getElementById('emailPop');

function setEmailPopOpen(open) {
  if (!emailPop || !emailTrigger) return;
  emailPop.classList.toggle('open', open);
  emailTrigger.setAttribute('aria-expanded', open ? 'true' : 'false');
  emailPop.setAttribute('aria-hidden', open ? 'false' : 'true');
}

emailTrigger?.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  setEmailPopOpen(!emailPop.classList.contains('open'));
});

emailPop?.querySelectorAll('button[data-action]').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const action = btn.dataset.action;
    if (action === 'gmail') {
      const url = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(EMAIL)}&su=${encodeURIComponent("Project inquiry")}`;
      window.open(url, '_blank', 'noopener,noreferrer');
      showToast('Opening Gmail in a new tab…');
    } else if (action === 'mailto') {
      window.location.href = `mailto:${EMAIL}?subject=Project%20inquiry`;
      showToast('Opening your default mail app…');
    } else if (action === 'copy') {
      const fallback = () => {
        const ta = document.createElement('textarea');
        ta.value = EMAIL; document.body.appendChild(ta);
        ta.select(); try { document.execCommand('copy'); } catch (_) {}
        ta.remove();
      };
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(EMAIL)
          .then(() => showToast(`✓ Copied ${EMAIL}`))
          .catch(() => { fallback(); showToast(`✓ Copied ${EMAIL}`); });
      } else {
        fallback();
        showToast(`✓ Copied ${EMAIL}`);
      }
    }
    setEmailPopOpen(false);
  });
});

document.addEventListener('click', (e) => {
  if (!emailPop || !emailTrigger) return;
  if (!emailPop.contains(e.target) && e.target !== emailTrigger && !emailTrigger.contains(e.target)) {
    setEmailPopOpen(false);
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') setEmailPopOpen(false);
});

/* ============ Mock CTA: idle → loading → done micro-interaction ============ */
document.querySelectorAll('.mock-cta').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (btn.dataset.state !== 'idle') return;
    const card = btn.closest('.mock-card');
    btn.dataset.state = 'loading';
    card?.classList.add('is-loading');
    setTimeout(() => {
      btn.dataset.state = 'done';
      card?.classList.remove('is-loading');
      if (window.innerWidth > 768) {
        showToast('✓ Demo: micro-interaction complete');
      }
      setTimeout(() => { btn.dataset.state = 'idle'; }, 1700);
    }, 1150);
  });
});


