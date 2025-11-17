// /public/js/room-landing.js

function isValidPattern(value, pattern) {
  try {
    const re = new RegExp(pattern);
    return re.test(value);
  } catch {
    return true; // if pattern invalid or missing, don't block
  }
}

export function handleLandingForm({
  formSelector,
  roomIdSelector,
  passwordSelector,
  verifyUrl = '/verify'
}) {
  const form = document.querySelector(formSelector);
  const roomInput = document.querySelector(roomIdSelector);
  const pwInput = document.querySelector(passwordSelector);

  if (!form || !roomInput || !pwInput) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const roomId = roomInput.value.trim();
    const password = pwInput.value;

    if (!roomId || !password) {
      alert('Please enter both room ID and password.');
      return;
    }

    const pattern = roomInput.getAttribute('pattern');
    if (pattern && !isValidPattern(roomId, pattern)) {
      alert('Room ID format is invalid. Expected: aaaa-bbbb-1234');
      return;
    }

    try {
      const res = await fetch(verifyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, password })
      });

      // Expect JSON response: { exists: boolean, validPassword: boolean }
      const data = await res.json();

      if (!res.ok) {
        // Server-side validation error
        alert(data?.error || 'Verification failed.');
        return;
      }

      if (!data.exists) {
        // Room does not exist: create it first, then redirect to room page with pw
        const createRes = await fetch('/room', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ room: roomId, password })
        });
        const createData = await createRes.json();
        if (!createRes.ok || !createData?.success) {
          alert(createData?.error || 'Failed to create room.');
          return;
        }
        // Redirect to the room page and pass pw in query for initial auth
        window.location.href = `/room/${encodeURIComponent(roomId)}?pw=${encodeURIComponent(password)}`;
        return;
      }

      if (!data.validPassword) {
        alert('Incorrect password for this room.');
        return;
      }

      // Success: room exists and password valid -> redirect to room page and pass pw
      window.location.href = `/room/${encodeURIComponent(roomId)}?pw=${encodeURIComponent(password)}`;
    } catch (err) {
      console.error('Landing form error:', err);
      alert('Network error. Please try again.');
    }
  });
}

export function bindRoomGenerator({ buttonSelector, targetInputSelector }) {
  const btn = document.querySelector(buttonSelector);
  const target = document.querySelector(targetInputSelector);
  if (!btn || !target) return;

  btn.addEventListener('click', () => {
    const chars = 'abcdefghijklmnopqrstuvwxyz';
    const digits = '0123456789';
    const pick = (src, n) => Array.from({ length: n }, () => src[Math.floor(Math.random() * src.length)]).join('');
    const roomId = `${pick(chars, 4)}-${pick(chars, 4)}-${pick(digits, 4)}`;
    target.value = roomId;
  });
}
