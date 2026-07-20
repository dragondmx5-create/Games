// ACCOUNT panel (title screen): login/register/logout — a plain DOM
// overlay that works entirely before a Game instance exists.
import { setPanelOpen } from './tween';
import { AuthUser, ApiError, login, logout, register } from './api';

export interface AuthPanel {
  /** reflects an externally-known auth state (e.g. the boot-time me() check)
   * into the panel's DOM without opening it */
  setUser(user: AuthUser | null): void;
}

export function initAuthPanel(onAuthChange: (user: AuthUser | null) => void): AuthPanel {
  const panel = document.getElementById('auth-panel')!;
  const accountBtn = document.getElementById('account-btn')!;
  const closeBtn = document.getElementById('ath-close')!;
  const statusEl = document.getElementById('ath-status')!;

  const loggedOutEl = document.getElementById('ath-logged-out')!;
  const loggedInEl = document.getElementById('ath-logged-in')!;
  const usernameEl = document.getElementById('ath-username')!;
  const logoutBtn = document.getElementById('ath-logout')!;

  const loginForm = document.getElementById('ath-login-form') as HTMLFormElement;
  const loginEmail = document.getElementById('ath-login-email') as HTMLInputElement;
  const loginPassword = document.getElementById('ath-login-password') as HTMLInputElement;

  const registerForm = document.getElementById('ath-register-form') as HTMLFormElement;
  const regEmail = document.getElementById('ath-reg-email') as HTMLInputElement;
  const regUsername = document.getElementById('ath-reg-username') as HTMLInputElement;
  const regPassword = document.getElementById('ath-reg-password') as HTMLInputElement;

  const showRegisterBtn = document.getElementById('ath-show-register')!;
  const showLoginBtn = document.getElementById('ath-show-login')!;

  function setStatus(msg: string, isError = false): void {
    statusEl.textContent = msg;
    statusEl.classList.toggle('error', isError);
  }

  function showUser(user: AuthUser | null): void {
    setStatus('');
    if (user) {
      loggedOutEl.classList.add('ath-hidden');
      loggedInEl.classList.remove('ath-hidden');
      usernameEl.textContent = `Logged in as ${user.username}`;
    } else {
      loggedOutEl.classList.remove('ath-hidden');
      loggedInEl.classList.add('ath-hidden');
    }
  }

  accountBtn.addEventListener('click', () => setPanelOpen(panel, true, 'hidden', false));
  closeBtn.addEventListener('click', () => setPanelOpen(panel, false, 'hidden', false));

  showRegisterBtn.addEventListener('click', () => {
    loginForm.classList.add('ath-hidden');
    showRegisterBtn.classList.add('ath-hidden');
    registerForm.classList.remove('ath-hidden');
    showLoginBtn.classList.remove('ath-hidden');
  });
  showLoginBtn.addEventListener('click', () => {
    registerForm.classList.add('ath-hidden');
    showLoginBtn.classList.add('ath-hidden');
    loginForm.classList.remove('ath-hidden');
    showRegisterBtn.classList.remove('ath-hidden');
  });

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    setStatus('Logging in…');
    try {
      const { user } = await login(loginEmail.value, loginPassword.value);
      loginForm.reset();
      showUser(user);
      onAuthChange(user);
    } catch (err) {
      setStatus(err instanceof ApiError ? err.message : 'Login failed', true);
    }
  });

  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    setStatus('Creating account…');
    try {
      const { user } = await register(regEmail.value, regUsername.value, regPassword.value);
      registerForm.reset();
      showUser(user);
      onAuthChange(user);
    } catch (err) {
      setStatus(err instanceof ApiError ? err.message : 'Registration failed', true);
    }
  });

  logoutBtn.addEventListener('click', async () => {
    try {
      await logout();
    } catch {
      /* cookies are httpOnly and short-lived either way; treat as logged out client-side */
    }
    showUser(null);
    onAuthChange(null);
  });

  return { setUser: showUser };
}
