(() => {
  const client = window.ajjitecSupabase;
  if (!client) return;

  const form = (id) => document.querySelector(`#${id}`);
  const status = document.querySelector('#auth-status');
  const profileForm = form('profile-form');
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
  const normalizeRole = (value) => ({
    administrador: 'admin',
    ventas: 'sales',
    inventario: 'inventory',
    consulta: 'viewer'
  })[String(value || 'pending').trim().toLowerCase()] || String(value || 'pending').trim().toLowerCase();

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

  const profileInitials = (profile, user) => {
    const source = String(profile?.name || user?.email || 'AJJITEC').trim();
    const initials = source.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('');
    return (initials || 'AJ').toUpperCase();
  };
  const updateIdentity = (profile, user) => {
    const metadata = user?.user_metadata || {};
    const name = profile?.name || metadata.name || 'Usuario AJJITEC';
    const company = profile?.company || metadata.company || 'Empresa no indicada';
    const phone = profile?.phone || metadata.phone || 'Teléfono no indicado';
    document.querySelectorAll('[data-user-email]').forEach((element) => element.replaceChildren(user?.email || ''));
    document.querySelectorAll('[data-user-name]').forEach((element) => element.replaceChildren(name));
    document.querySelectorAll('[data-user-company]').forEach((element) => element.replaceChildren(company));
    document.querySelectorAll('[data-user-phone]').forEach((element) => element.replaceChildren(phone));
    document.querySelectorAll('[data-user-initials]').forEach((element) => element.replaceChildren(profileInitials(profile, user)));
  };
  const populateProfileForm = (profile, user) => {
    if (!profileForm) return;
    const metadata = user?.user_metadata || {};
    const field = (name) => profileForm.querySelector(`[name="${name}"]`);
    field('name').value = profile?.name || metadata.name || '';
    field('email').value = user?.email || profile?.email || '';
    field('company').value = profile?.company || metadata.company || '';
    field('phone').value = profile?.phone || metadata.phone || '';
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

  const syncProfileEmail = async (user, profile) => {
    if (!user?.email || profile?.email === user.email) return profile;
    const { data, error } = await client.from('profiles')
      .update({ email: user.email })
      .eq('id', user.id)
      .select(profileColumns)
      .single();
    return error ? profile : data;
  };

  const profileErrorMessage = (error) => error?.code === '42P01'
    ? 'La base de usuarios aun no esta configurada en Supabase.'
    : 'No pudimos preparar tu perfil de acceso.';

  const applyAccess = (profile) => {
    if (!accountPage) return;
    const role = normalizeRole(profile?.role);
    accountPage.dataset.accountRole = role;

    const hasAdminAccess = staffRoles.includes(role);
    accountPage.dataset.accessState = hasAdminAccess ? 'authorized' : 'pending';

    document.querySelectorAll('[data-user-role]').forEach((element) => {
      element.textContent = roleLabels[role] || role;
    });

    document.querySelectorAll('[data-admin-content]').forEach((element) => {
      if (hasAdminAccess) element.removeAttribute('hidden');
      else element.setAttribute('hidden', '');
    });

    const pendingNotice = document.querySelector('[data-access-pending]');
    if (pendingNotice) {
      if (hasAdminAccess) pendingNotice.setAttribute('hidden', '');
      else pendingNotice.removeAttribute('hidden');
    }

    const moduleRoles = {
      dashboard: ['admin', 'sales', 'inventory', 'viewer'],
      inventory: ['admin', 'inventory', 'viewer'],
      clients: ['admin', 'sales', 'viewer'],
      users: ['admin'],
      quotes: ['admin', 'sales', 'viewer'],
      invoices: ['admin', 'sales', 'viewer'],
      profile: ['admin', 'sales', 'inventory', 'viewer']
    };
    Object.entries(moduleRoles).forEach(([module, roles]) => {
      const visible = roles.includes(role);
      document.querySelectorAll(`[data-admin-module="${module}"]`).forEach((element) => {
        if (visible) element.removeAttribute('hidden');
        else element.setAttribute('hidden', '');
      });
      document.querySelectorAll(`[data-admin-shortcut="${module}"]`).forEach((element) => {
        if (visible) element.removeAttribute('hidden');
        else element.setAttribute('hidden', '');
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

    let profile = result.profile;
    if (!profile.active) {
      await client.auth.signOut();
      return window.location.replace(`${authBase}login.html?disabled=1`);
    }

    profile = { ...await syncProfileEmail(user, profile), role: normalizeRole(profile.role) };
    updateIdentity(profile, user);
    populateProfileForm(profile, user);
    applyAccess(profile);

    const accountParams = new URLSearchParams(window.location.search);
    if (accountParams.get('reset') === '1' || accountParams.get('focus') === 'password') {
      document.querySelector('[data-password-panel]')?.removeAttribute('hidden');
      document.querySelector('#profile-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    window.location.replace(`${authBase}resumen.html`);
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
      return window.location.replace(`${authBase}resumen.html`);
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

  const invitePasswordForm = form('invite-password-form');
  invitePasswordForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(invitePasswordForm);
    if (data.get('password') !== data.get('password_confirmation')) {
      return setStatus('Las contraseñas no coinciden.', true);
    }

    setStatus('Activando acceso...');
    const { data: sessionResult, error: sessionError } = await client.auth.getSession();
    if (sessionError || !sessionResult.session) {
      return setStatus('Este enlace ya no es válido. Solicita una nueva invitación.', true);
    }

    const { error } = await client.auth.updateUser({ password: data.get('password') });
    if (error) return setStatus(errorMessage(error), true);
    setStatus('Acceso activado. Abriendo el portal...');
    window.setTimeout(() => window.location.replace(`${authBase}resumen.html`), 350);
  });

  if (loginForm) {
    const disabled = new URLSearchParams(window.location.search).get('disabled');
    if (disabled === '1') setStatus('Tu acceso esta desactivado. Contacta al administrador.', true);
    client.auth.getSession().then(({ data }) => {
      if (data.session) window.location.replace(`${authBase}resumen.html`);
    });
  }

  document.querySelectorAll('#logout-button, [data-logout-button]').forEach((button) => button.addEventListener('click', async () => {
    button.disabled = true;
    await client.auth.signOut();
    window.location.replace(`${authBase}login.html`);
  }));

  profileForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(profileForm);
    const requestedEmail = String(data.get('email') || '').trim().toLowerCase();
    const requestedName = String(data.get('name') || '').trim();
    if (!requestedName || !requestedEmail) return setStatus('Completa tu nombre y correo de acceso.', true);
    setStatus('Guardando perfil...');
    const { data: userResult, error: userError } = await client.auth.getUser();
    if (userError || !userResult.user) return setStatus('Tu sesión ya no está disponible. Inicia sesión de nuevo.', true);

    const currentUser = userResult.user;
    const emailChanged = requestedEmail !== String(currentUser.email || '').toLowerCase();
    let authUser = currentUser;
    let emailConfirmationPending = false;
    if (emailChanged) {
      const { data: authResult, error } = await client.auth.updateUser({ email: requestedEmail });
      if (error) return setStatus(errorMessage(error), true);
      authUser = authResult.user || currentUser;
      emailConfirmationPending = String(authUser.email || '').toLowerCase() !== requestedEmail;
    }

    const profilePayload = {
      name: requestedName,
      company: String(data.get('company') || '').trim() || null,
      phone: String(data.get('phone') || '').trim() || null
    };
    if (!emailConfirmationPending) profilePayload.email = requestedEmail;
    const { data: updatedProfile, error: profileError } = await client.from('profiles')
      .update(profilePayload)
      .eq('id', currentUser.id)
      .select(profileColumns)
      .single();
    if (profileError) return setStatus(errorMessage(profileError), true);

    updateIdentity(updatedProfile, authUser);
    populateProfileForm(updatedProfile, authUser);
    if (emailConfirmationPending) profileForm.querySelector('[name="email"]').value = requestedEmail;
    setStatus(emailConfirmationPending
      ? 'Perfil guardado. Confirma el correo nuevo desde tu bandeja de entrada.'
      : 'Perfil actualizado correctamente.');
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
  });
})();
