(() => {
  const client = window.ajjitecSupabase;
  if (!client) return;

  const form = (id) => document.querySelector(`#${id}`);
  const status = document.querySelector('#auth-status');
  const accountPage = document.querySelector('[data-account-page]');
  const authBase = window.ajjitecAuthBase || `${window.location.origin}/`;
  const profileColumns = 'id,email,name,company,phone,role,active';
  const staffRoles = ['admin', 'sales', 'inventory', 'viewer'];
  const roleLabels = {
    pending: 'Acceso pendiente',
    admin: 'Administrador',
    sales: 'Ventas',
    inventory: 'Inventario',
    viewer: 'Consulta'
  };

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
      'Invalid login credentials': 'El correo o la contrasena no son correctos.',
      'Email not confirmed': 'Confirma tu correo electronico antes de iniciar sesion.',
      'User already registered': 'Este correo ya tiene una cuenta registrada.',
      'Password should be at least 6 characters.': 'La contrasena debe tener al menos 6 caracteres.',
      'Signup requires a valid password': 'La contrasena no cumple los requisitos.',
      'Email rate limit exceeded': 'Demasiados intentos. Espera unos minutos e intentalo de nuevo.'
    };
    return messages[error?.message] || 'No pudimos completar la solicitud. Intentalo de nuevo.';
  };

  const fetchProfile = async (user) => {
    const { data, error } = await client
      .from('profiles')
      .select(profileColumns)
      .eq('id', user.id)
      .maybeSingle();
    return { profile: data, error };
  };

  const ensureProfile = async (user) => {
    const existing = await fetchProfile(user);
    if (existing.error || existing.profile) return existing;

    const metadata = user.user_metadata || {};
    const { data, error } = await client
      .from('profiles')
      .insert({
        id: user.id,
        email: user.email || null,
        name: metadata.name || null,
        company: metadata.company || null,
        phone: metadata.phone || null,
        role: 'pending',
        active: true
      })
      .select(profileColumns)
      .single();

    if (!error) return { profile: data, error: null };
    if (error.code !== '23505') return { profile: null, error };
    return fetchProfile(user);
  };

  const profileErrorMessage = (error) => error?.code === '42P01'
    ? 'La base de usuarios aun no esta configurada en Supabase.'
    : 'No pudimos preparar tu perfil de acceso.';

  const applyAccess = (profile) => {
    if (!accountPage) return;
    const role = profile?.role || 'pending';
    accountPage.dataset.userRole = role;

    document.querySelectorAll('[data-user-role]').forEach((element) => {
      element.textContent = roleLabels[role] || role;
    });

    const hasAdminAccess = staffRoles.includes(role);
    document.querySelectorAll('[data-admin-content]').forEach((element) => {
      element.hidden = !hasAdminAccess;
    });

    const pendingNotice = document.querySelector('[data-access-pending]');
    if (pendingNotice) pendingNotice.hidden = hasAdminAccess;

    const moduleRoles = {
      inventory: ['admin', 'inventory', 'viewer'],
      clients: ['admin', 'sales', 'viewer'],
      users: ['admin'],
      quotes: ['admin', 'sales', 'viewer']
    };
    Object.entries(moduleRoles).forEach(([module, roles]) => {
      const visible = roles.includes(role);
      document.querySelectorAll(`[data-admin-module="${module}"]`).forEach((element) => {
        element.hidden = !visible;
      });
      document.querySelectorAll(`[data-admin-shortcut="${module}"]`).forEach((element) => {
        element.hidden = !visible;
      });
    });
  };

  const dispatchAuthReady = (detail) => {
    window.dispatchEvent(new CustomEvent('ajjitec-auth-ready', { detail }));
  };

  const loadAccount = async () => {
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) {
      dispatchAuthReady({ user: null, profile: null, error });
      return window.location.replace(`${authBase}login.html`);
    }

    const user = data.user;
    const result = await ensureProfile(user);
    if (result.error || !result.profile) {
      setStatus(profileErrorMessage(result.error), true);
      dispatchAuthReady({ user, profile: null, error: result.error });
      return;
    }

    const profile = result.profile;
    if (!profile.active) {
      await client.auth.signOut();
      return window.location.replace(`${authBase}login.html?disabled=1`);
    }

    const metadata = user.user_metadata || {};
    document.querySelector('[data-user-email]')?.replaceChildren(user.email || '');
    document.querySelector('[data-user-name]')?.replaceChildren(profile.name || metadata.name || 'Usuario AJJITEC');
    document.querySelector('[data-user-company]')?.replaceChildren(profile.company || metadata.company || 'Empresa no indicada');
    document.querySelector('[data-user-phone]')?.replaceChildren(profile.phone || metadata.phone || 'Telefono no indicado');
    applyAccess(profile);

    if (new URLSearchParams(window.location.search).get('reset') === '1') {
      document.querySelector('[data-password-panel]')?.removeAttribute('hidden');
    }

    dispatchAuthReady({ user, profile, error: null });
    return { user, profile };
  };

  window.ajjitecAuthReady = accountPage ? loadAccount() : Promise.resolve(null);

  const loginForm = form('login-form');
  loginForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(loginForm);
    setStatus('Verificando acceso...');
    const { data: result, error } = await client.auth.signInWithPassword({
      email: data.get('email'),
      password: data.get('password')
    });
    if (error) return setStatus(errorMessage(error), true);

    const profileResult = await ensureProfile(result.user);
    if (profileResult.error || !profileResult.profile) {
      await client.auth.signOut();
      return setStatus(profileErrorMessage(profileResult.error), true);
    }
    if (!profileResult.profile.active) {
      await client.auth.signOut();
      return setStatus('Tu acceso esta desactivado. Contacta al administrador.', true);
    }
    window.location.replace(`${authBase}cuenta.html`);
  });

  const registerForm = form('register-form');
  registerForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(registerForm);
    if (data.get('password') !== data.get('password_confirmation')) {
      return setStatus('Las contrasenas no coinciden.', true);
    }
    setStatus('Creando tu acceso...');
    const { data: result, error } = await client.auth.signUp({
      email: data.get('email'),
      password: data.get('password'),
      options: {
        emailRedirectTo: `${authBase}cuenta.html`,
        data: {
          name: data.get('name'),
          company: data.get('company'),
          phone: data.get('phone')
        }
      }
    });
    if (error) return setStatus(errorMessage(error), true);
    if (result.session && result.user) {
      const profileResult = await ensureProfile(result.user);
      if (profileResult.error || !profileResult.profile) {
        await client.auth.signOut();
        return setStatus(profileErrorMessage(profileResult.error), true);
      }
      return window.location.replace(`${authBase}cuenta.html`);
    }
    setStatus('Cuenta creada. Revisa tu correo para confirmar el acceso.');
    registerForm.reset();
  });

  const recoveryForm = form('recovery-form');
  recoveryForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(recoveryForm);
    setStatus('Enviando instrucciones...');
    const { error } = await client.auth.resetPasswordForEmail(data.get('email'), {
      redirectTo: `${authBase}cuenta.html?reset=1`
    });
    if (error) return setStatus(errorMessage(error), true);
    setStatus('Si el correo existe, recibiras instrucciones para crear una nueva contrasena.');
    recoveryForm.reset();
  });

  if (loginForm) {
    const disabled = new URLSearchParams(window.location.search).get('disabled');
    if (disabled === '1') setStatus('Tu acceso esta desactivado. Contacta al administrador.', true);
    client.auth.getSession().then(({ data }) => {
      if (data.session) window.location.replace(`${authBase}cuenta.html`);
    });
  }

  document.querySelector('#logout-button')?.addEventListener('click', async () => {
    await client.auth.signOut();
    window.location.replace(`${authBase}login.html`);
  });

  const passwordForm = form('password-form');
  passwordForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(passwordForm);
    if (data.get('password') !== data.get('password_confirmation')) {
      return setStatus('Las contrasenas no coinciden.', true);
    }
    const { error } = await client.auth.updateUser({ password: data.get('password') });
    if (error) return setStatus(errorMessage(error), true);
    setStatus('Contrasena actualizada correctamente.');
    passwordForm.reset();
    document.querySelector('[data-password-panel]')?.setAttribute('hidden', '');
  });
})();
