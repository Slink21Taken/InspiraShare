
function isValidRoomPattern(value) {
  const pattern = /^[a-zA-Z]{4}-[a-zA-Z]{4}-[0-9]{4}$/;
  return pattern.test(value);
}
function handleLandingForm() {
  const form = document.getElementById('roomForm');
  const roomInput = document.getElementById('roomId');
  const passwordInput = document.getElementById('password');

  if (!form || !roomInput || !passwordInput) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const roomId = roomInput.value.trim();
    const password = passwordInput.value;

    if (!roomId || !password) {
      alert('Please enter both Room ID and Password.');
      return;
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn?.innerHTML || 'JOIN ROOM';
    if (submitBtn) submitBtn.innerHTML = '<strong>CONNECTING...</strong>';
    form.style.pointerEvents = 'none';

    try {
      const res = await fetch('/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Verification failed');

      if (!data.validPassword) {
        alert('❌ Incorrect password.');
        if (submitBtn) submitBtn.innerHTML = originalText;
        form.style.pointerEvents = '';
        return;
      }

      window.location.href = data.redirect;
    } catch (err) {
      alert(`⚠️ Error: ${err.message}`);
      if (submitBtn) submitBtn.innerHTML = originalText;
      form.style.pointerEvents = '';
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  handleLandingForm();
});


// Generate random room ID
function bindRoomGenerator() {
  const btn = document.getElementById('generateRoom');
  const roomInput = document.getElementById('roomId');
  const passwordInput = document.getElementById('password');

  if (!btn || !roomInput || !passwordInput) {
    console.warn('Room generator elements not found');
    return;
  }

  btn.addEventListener('click', async () => {
    const roomId = roomInput.value.trim();
    const password = passwordInput.value.trim();

    if (!roomId || !password) {
      alert('Please enter both Room ID and Password before creating.');
      return;
    }
    btn.innerHTML = '<strong>CREATING...</strong>';
    btn.disabled = true;

    try {
      const res = await fetch('/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, password })
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data?.error || 'Request failed');

      if (!data.validPassword) {
        alert('❌ Password invalid or room already exists with a different password.');
      } else {
        alert('✓ Room verified/created successfully!');
        window.location.href = data.redirect;
      }
    } catch (err) {
      console.error(err);
      alert(`⚠️ Error: ${err.message}`);
    } finally {
      btn.innerHTML = '<strong>GENERATE ROOM</strong>';
      btn.disabled = false;
    }
  });
}

function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      const href = this.getAttribute('href');
      if (href === '#') return;

      const target = document.querySelector(href);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
}
function initNavbar() {
  const navbar = document.getElementById('navbar');
  if (!navbar) return;

  let lastScroll = 0;
  window.addEventListener('scroll', () => {
    const currentScroll = window.pageYOffset;

    if (currentScroll > 100) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
    if (currentScroll > lastScroll && currentScroll > 300) {
      navbar.style.transform = 'translateY(-100%)';
    } else {
      navbar.style.transform = 'translateY(0)';
    }

    lastScroll = currentScroll;
  });
}
function initScrollAnimations() {
  const observerOptions = { threshold: 0.1, rootMargin: '0px 0px -50px 0px' };

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) entry.target.classList.add('visible');
    });
  }, observerOptions);

  document.querySelectorAll('.fade-in, .feature-card, .stat-card').forEach(el => observer.observe(el));
}

// Animate gradient
function initGradientOrbs() {
  const orbs = document.querySelectorAll('.gradient-orb');

  orbs.forEach((orb, index) => {
    const baseX = Math.random() * 100;
    const baseY = Math.random() * 100;
    const speed = 30000 + index * 10000;

    orb.style.left = baseX + '%';
    orb.style.top = baseY + '%';

    setInterval(() => {
      const newX = Math.random() * 100;
      const newY = Math.random() * 100;
      orb.style.left = newX + '%';
      orb.style.top = newY + '%';
    }, speed);
  });
}

// Handle URL error 
function handleUrlErrors() {
  const params = new URLSearchParams(window.location.search);
  const error = params.get('error');

  if (error === 'auth') {
    alert('❌ Authentication failed.\n\nPlease check your Room ID and Password.');
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

// Initialize everything
document.addEventListener('DOMContentLoaded', () => {
  handleUrlErrors();
  handleLandingForm();
  bindRoomGenerator();
  initSmoothScroll();
  initNavbar();
  initScrollAnimations();
  initGradientOrbs();

  console.log('🎨 InspiraDraw landing page initialized');
});

//Maybe it will be useful
window.handleLandingForm = handleLandingForm;
window.bindRoomGenerator = bindRoomGenerator;
