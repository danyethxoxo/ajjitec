(() => {
  const client = window.ajjitecSupabase;
  if (!client) return;

  const form = (id) => document.querySelector(`#${id}`);
  const status = document.querySelector('#auth-status');
  document.querySelectorAll('a[href^="mailto:"]').forEach((link) => {
    if (link.textContent.toLowerCase().includes('olvid')) link.href = 'recuperar.html';
  });
  const setStatus = (message, isError = false) => {
    if (!status) return;
    status.textContent = message;
    status.dataset.state = isError ? 'error' : 'success';
  };

  const errorMessage = (error) => {
    const messages = {
      'Invalid login credentials': 'El correo o la contraseña no son correctos.',
      'Email not confirmed': 'Confirma tu correo electrónico antes de iniciar sesión.',
      'User already registered': 'Este correo ya tiene una cuenta registrada.',
      'Password should be at least 6 characters.': 'La contraseña debe tener al menos 6 caracteres.'
    };
    return messages[error?.message] || 'No pudimos completar la solicitud. Inténtalo de nuevo.';
  };

  const loginForm = form('login-form');
  loginForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(loginForm);
    setStatus('Verificando acceso…');
    const { error } = await client.auth.signInWithPassword({
      email: data.get('email'),
      password: data.get('password')
    });
    if (error) return setStatus(errorMessage(error), true);
    window.location.href = `${window.ajjitecAuthBase}cuenta.html`;
  });

  const registerForm = form('register-form');
  registerForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(registerForm);
    if (data.get('password') !== data.get('password_confirmation')) {
      return setStatus('Las contraseñas no coinciden.', true);
    }
    setStatus('Creando tu acceso…');
    const { data: result, error } = await client.auth.signUp({
      email: data.get('email'),
      password: data.get('password'),
      options: {
        emailRedirectTo: `${window.ajjitecAuthBase}cuenta.html`,
        data: {
          name: data.get('name'),
          company: data.get('company'),
          phone: data.get('phone')
        }
      }
    });
    if (error) return setStatus(errorMessage(error), true);
    if (result.session) return window.location.href = `${window.ajjitecAuthBase}cuenta.html`;
    setStatus('Cuenta creada. Revisa tu correo para confirmar el acceso.');
    registerForm.reset();
  });

  const recoveryForm = form('recovery-form');
  recoveryForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(recoveryForm);
    setStatus('Enviando instrucciones…');
    const { error } = await client.auth.resetPasswordForEmail(data.get('email'), {
      redirectTo: `${window.ajjitecAuthBase}cuenta.html?reset=1`
    });
    if (error) return setStatus(errorMessage(error), true);
    setStatus('Si el correo existe, recibirás instrucciones para crear una nueva contraseña.');
    recoveryForm.reset();
  });

  const accountPage = document.querySelector('[data-account-page]');
  if (accountPage) {
    const loadAccount = async () => {
      const { data, error } = await client.auth.getUser();
      if (error || !data.user) return window.location.replace(`${window.ajjitecAuthBase}login.html`);
      const user = data.user;
      const metadata = user.user_metadata || {};
      document.querySelector('[data-user-email]').textContent = user.email || '';
      document.querySelector('[data-user-name]').textContent = metadata.name || 'Usuario AJJITEC';
      document.querySelector('[data-user-company]').textContent = metadata.company || 'Empresa no indicada';
      document.querySelector('[data-user-phone]').textContent = metadata.phone || 'Teléfono no indicado';
      if (new URLSearchParams(window.location.search).get('reset') === '1') {
        document.querySelector('[data-password-panel]')?.removeAttribute('hidden');
      }
    };
    loadAccount();
  }

  document.querySelector('#logout-button')?.addEventListener('click', async () => {
    await client.auth.signOut();
    window.location.replace(`${window.ajjitecAuthBase}login.html`);
  });

  const passwordForm = form('password-form');
  passwordForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(passwordForm);
    if (data.get('password') !== data.get('password_confirmation')) {
      return setStatus('Las contraseñas no coinciden.', true);
    }
    const { error } = await client.auth.updateUser({ password: data.get('password') });
    if (error) return setStatus(errorMessage(error), true);
    setStatus('Contraseña actualizada correctamente.');
    passwordForm.reset();
    document.querySelector('[data-password-panel]')?.setAttribute('hidden', '');
  });
})();
