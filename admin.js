(() => {
  const client = window.ajjitecSupabase;
  const page = document.querySelector('[data-account-page]');
  if (!client || !page) return;

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
    if (error?.code === '42P01') return 'Falta crear las tablas en Supabase.';
    if (error?.code === '42501') return 'Tu rol no tiene permisos para esta operación.';
    if (error?.code === '23505') return 'Ya existe un registro con esos datos.';
    return 'No pudimos guardar los datos. Inténtalo de nuevo.';
  };

  const setupPage = ({ profile }) => {
    if (!profile || !['admin', 'sales', 'inventory', 'viewer'].includes(profile.role)) return;

    const permissions = {
      inventory: ['admin', 'inventory', 'viewer'].includes(profile.role),
      inventoryWrite: ['admin', 'inventory'].includes(profile.role),
      clients: ['admin', 'sales', 'viewer'].includes(profile.role),
      clientsWrite: ['admin', 'sales'].includes(profile.role)
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

    Promise.all([loadInventory(), loadClients()]);
  };

  if (window.ajjitecAuthReady) window.ajjitecAuthReady.then(setupPage);
})();
