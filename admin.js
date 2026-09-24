(() => {
  const client = window.ajjitecSupabase;
  const page = document.querySelector('[data-account-page]');
  if (!client || !page) return;

  const roleOptions = [
    { value: 'pending', label: 'Pendiente' },
    { value: 'admin', label: 'Administrador' },
    { value: 'sales', label: 'Ventas' },
    { value: 'inventory', label: 'Inventario' },
    { value: 'viewer', label: 'Consulta' }
  ];

  const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  })[character]);
  const money = (value) => value === null || value === '' ? '—' : new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN'
  }).format(value);
  const setMessage = (selector, message, error = false) => {
    const element = document.querySelector(selector);
    if (!element) return;
    element.textContent = message;
    element.dataset.state = error ? 'error' : 'success';
  };
  const databaseMessage = (error) => {
    const message = error?.message || '';
    if (error?.code === '42P01') return 'Falta crear las tablas en Supabase.';
    if (error?.code === '42501' || message === 'not_authorized') return 'Tu rol no tiene permisos para esta operación.';
    if (message === 'invalid_profile_access') return 'El rol o estado seleccionado no es válido.';
    if (message === 'profile_not_found') return 'No encontramos ese perfil.';
    if (message === 'cannot_remove_current_admin') return 'No puedes quitarte tu propio acceso de administrador.';
    if (message === 'cannot_remove_last_admin') return 'Debe quedar al menos un administrador activo.';
    if (error?.code === '23505') return 'Ya existe un registro con esos datos.';
    return 'No pudimos guardar los datos. Inténtalo de nuevo.';
  };

  const setupPage = ({ profile, user }) => {
    if (!profile || !['admin', 'sales', 'inventory', 'viewer'].includes(profile.role)) return;

    const permissions = {
      inventory: ['admin', 'inventory', 'viewer'].includes(profile.role),
      inventoryWrite: ['admin', 'inventory'].includes(profile.role),
      clients: ['admin', 'sales', 'viewer'].includes(profile.role),
      clientsWrite: ['admin', 'sales'].includes(profile.role),
      users: profile.role === 'admin'
    };

    document.querySelector('[data-show-password]')?.addEventListener('click', () => {
      const panel = document.querySelector('[data-password-panel]');
      panel?.removeAttribute('hidden');
      panel?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    document.querySelectorAll('[data-admin-target]').forEach((button) => button.addEventListener('click', () => {
      document.querySelector('#' + button.dataset.adminTarget)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));

    const inventoryForm = document.querySelector('#inventory-form');
    const clientsForm = document.querySelector('#clients-form');
    if (inventoryForm && !permissions.inventoryWrite) {
      inventoryForm.hidden = true;
      setMessage('[data-inventory-status]', 'Vista de solo consulta para este rol.');
    }
    if (clientsForm && !permissions.clientsWrite) {
      clientsForm.hidden = true;
      setMessage('[data-clients-status]', 'Vista de solo consulta para este rol.');
    }

    const renderInventory = (items = []) => {
      const body = document.querySelector('[data-inventory-body]');
      const empty = document.querySelector('[data-inventory-empty]');
      if (!body || !empty) return;
      body.innerHTML = items.map((item) => {
        const deleteButton = permissions.inventoryWrite
          ? '<button class="admin-delete" type="button" data-delete-inventory="' + item.id + '" aria-label="Eliminar ' + escapeHtml(item.name) + '">Eliminar</button>'
          : '';
        return '<tr><td>' + escapeHtml(item.sku) + '</td><td><strong>' + escapeHtml(item.name) + '</strong></td><td>' + escapeHtml(item.category || '—') + '</td><td>' + Number(item.stock || 0) + '</td><td>' + money(item.price) + '</td><td>' + deleteButton + '</td></tr>';
      }).join('');
      empty.hidden = items.length > 0;
      document.querySelector('[data-inventory-count]')?.replaceChildren(items.length + ' ' + (items.length === 1 ? 'registro' : 'registros'));
    };

    const renderClients = (items = []) => {
      const body = document.querySelector('[data-clients-body]');
      const empty = document.querySelector('[data-clients-empty]');
      if (!body || !empty) return;
      body.innerHTML = items.map((item) => {
        const deleteButton = permissions.clientsWrite
          ? '<button class="admin-delete" type="button" data-delete-client="' + item.id + '" aria-label="Eliminar ' + escapeHtml(item.company) + '">Eliminar</button>'
          : '';
        return '<tr><td><strong>' + escapeHtml(item.company) + '</strong></td><td>' + escapeHtml(item.contact_name) + '</td><td>' + escapeHtml(item.email || '—') + '</td><td>' + escapeHtml(item.phone || '—') + '</td><td>' + deleteButton + '</td></tr>';
      }).join('');
      empty.hidden = items.length > 0;
      document.querySelector('[data-clients-count]')?.replaceChildren(items.length + ' ' + (items.length === 1 ? 'registro' : 'registros'));
    };

    const renderUsers = (items = []) => {
      const body = document.querySelector('[data-users-body]');
      const empty = document.querySelector('[data-users-empty]');
      if (!body || !empty) return;
      body.innerHTML = items.map((item) => {
        const options = roleOptions.map((option) => '<option value="' + option.value + '"' + (item.role === option.value ? ' selected' : '') + '>' + option.label + '</option>').join('');
        const active = item.active ? ' checked' : '';
        const current = user?.id === item.id ? ' · Tú' : '';
        return '<tr data-user-row="' + item.id + '"><td><strong>' + escapeHtml(item.name || 'Sin nombre') + '</strong><small class="admin-user-meta">' + escapeHtml(item.email || 'Sin correo') + current + '</small></td><td>' + escapeHtml(item.company || '—') + '</td><td><select class="admin-user-control" data-user-role-control aria-label="Rol de ' + escapeHtml(item.email || item.id) + '">' + options + '</select></td><td><label class="admin-user-active"><input type="checkbox" data-user-active' + active + ' /><span>' + (item.active ? 'Activo' : 'Inactivo') + '</span></label></td><td><button class="admin-user-save" type="button" data-save-user="' + item.id + '">Guardar</button></td></tr>';
      }).join('');
      empty.hidden = items.length > 0;
      document.querySelector('[data-users-count]')?.replaceChildren(items.length + ' ' + (items.length === 1 ? 'usuario' : 'usuarios'));
    };

    const loadInventory = async () => {
      if (!permissions.inventory) return;
      const { data, error } = await client.from('inventory_items')
        .select('id,sku,name,category,stock,price,notes,created_at')
        .order('created_at', { ascending: false });
      if (error) return setMessage('[data-inventory-status]', databaseMessage(error), true);
      renderInventory(data);
    };

    const loadClients = async () => {
      if (!permissions.clients) return;
      const { data, error } = await client.from('clients')
        .select('id,company,contact_name,email,phone,notes,created_at')
        .order('created_at', { ascending: false });
      if (error) return setMessage('[data-clients-status]', databaseMessage(error), true);
      renderClients(data);
    };

    const loadUsers = async () => {
      if (!permissions.users) return;
      const { data, error } = await client.from('profiles')
        .select('id,email,name,company,role,active,created_at')
        .order('created_at', { ascending: false });
      if (error) return setMessage('[data-users-status]', databaseMessage(error), true);
      renderUsers(data);
    };

    inventoryForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!permissions.inventoryWrite) return;
      const form = event.currentTarget;
      const values = new FormData(form);
      setMessage('[data-inventory-status]', 'Guardando producto…');
      const { error } = await client.from('inventory_items').insert({
        sku: values.get('sku'),
        name: values.get('name'),
        category: values.get('category') || null,
        stock: Number(values.get('stock') || 0),
        price: values.get('price') ? Number(values.get('price')) : null,
        notes: values.get('notes') || null
      });
      if (error) return setMessage('[data-inventory-status]', databaseMessage(error), true);
      form.reset();
      setMessage('[data-inventory-status]', 'Producto agregado correctamente.');
      loadInventory();
    });

    clientsForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!permissions.clientsWrite) return;
      const form = event.currentTarget;
      const values = new FormData(form);
      setMessage('[data-clients-status]', 'Guardando cliente…');
      const { error } = await client.from('clients').insert({
        company: values.get('company'),
        contact_name: values.get('contact_name'),
        email: values.get('email') || null,
        phone: values.get('phone') || null,
        notes: values.get('notes') || null
      });
      if (error) return setMessage('[data-clients-status]', databaseMessage(error), true);
      form.reset();
      setMessage('[data-clients-status]', 'Cliente agregado correctamente.');
      loadClients();
    });

    page.addEventListener('click', async (event) => {
      const saveUser = event.target.closest?.('[data-save-user]');
      if (saveUser && permissions.users) {
        const row = saveUser.closest('[data-user-row]');
        const roleControl = row?.querySelector('[data-user-role-control]');
        const activeControl = row?.querySelector('[data-user-active]');
        if (!row || !roleControl || !activeControl) return;
        saveUser.disabled = true;
        setMessage('[data-users-status]', 'Guardando acceso…');
        const { error } = await client
          .from('profiles')
          .update({
            role: roleControl.value,
            active: activeControl.checked
          })
          .eq('id', saveUser.dataset.saveUser);
        saveUser.disabled = false;
        if (error) return setMessage('[data-users-status]', databaseMessage(error), true);
        setMessage('[data-users-status]', 'Acceso actualizado correctamente.');
        loadUsers();
        return;
      }

      const target = event.target.closest?.('[data-delete-inventory], [data-delete-client]');
      if (!target) return;
      const inventoryId = target.dataset.deleteInventory;
      const clientId = target.dataset.deleteClient;
      if (inventoryId && permissions.inventoryWrite) {
        const { error } = await client.from('inventory_items').delete().eq('id', inventoryId);
        if (error) return setMessage('[data-inventory-status]', databaseMessage(error), true);
        loadInventory();
      }
      if (clientId && permissions.clientsWrite) {
        const { error } = await client.from('clients').delete().eq('id', clientId);
        if (error) return setMessage('[data-clients-status]', databaseMessage(error), true);
        loadClients();
      }
    });

    Promise.all([loadInventory(), loadClients(), loadUsers()]);
  };

  if (window.ajjitecAuthReady) window.ajjitecAuthReady.then(setupPage);
})();
