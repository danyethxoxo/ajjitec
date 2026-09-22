(() => {
  const client = window.ajjitecSupabase;
  const page = document.querySelector('[data-account-page]');
  if (!client || !page) return;

  const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
  const money = (value) => value === null || value === '' ? '—' : new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value);
  const setMessage = (selector, message, error = false) => {
    const element = document.querySelector(selector);
    if (!element) return;
    element.textContent = message;
    element.dataset.state = error ? 'error' : 'success';
  };
  const databaseMessage = (error) => error?.code === '42P01'
    ? 'Falta crear las tablas en Supabase. Ejecuta el archivo supabase-schema.sql en SQL Editor.'
    : 'No pudimos guardar los datos. Inténtalo de nuevo.';

  document.querySelector('[data-show-password]')?.addEventListener('click', () => {
    const panel = document.querySelector('[data-password-panel]');
    panel?.removeAttribute('hidden');
    panel?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  document.querySelectorAll('[data-admin-target]').forEach((button) => button.addEventListener('click', () => {
    document.querySelector(`#${button.dataset.adminTarget}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));

  const renderInventory = (items = []) => {
    const body = document.querySelector('[data-inventory-body]');
    const empty = document.querySelector('[data-inventory-empty]');
    body.innerHTML = items.map((item) => `<tr><td>${escapeHtml(item.sku)}</td><td><strong>${escapeHtml(item.name)}</strong></td><td>${escapeHtml(item.category || '—')}</td><td>${Number(item.stock || 0)}</td><td>${money(item.price)}</td><td><button class="admin-delete" type="button" data-delete-inventory="${item.id}" aria-label="Eliminar ${escapeHtml(item.name)}">Eliminar</button></td></tr>`).join('');
    empty.hidden = items.length > 0;
    document.querySelector('[data-inventory-count]').textContent = `${items.length} ${items.length === 1 ? 'registro' : 'registros'}`;
  };
  const renderClients = (items = []) => {
    const body = document.querySelector('[data-clients-body]');
    const empty = document.querySelector('[data-clients-empty]');
    body.innerHTML = items.map((item) => `<tr><td><strong>${escapeHtml(item.company)}</strong></td><td>${escapeHtml(item.contact_name)}</td><td>${escapeHtml(item.email || '—')}</td><td>${escapeHtml(item.phone || '—')}</td><td><button class="admin-delete" type="button" data-delete-client="${item.id}" aria-label="Eliminar ${escapeHtml(item.company)}">Eliminar</button></td></tr>`).join('');
    empty.hidden = items.length > 0;
    document.querySelector('[data-clients-count]').textContent = `${items.length} ${items.length === 1 ? 'registro' : 'registros'}`;
  };

  const loadInventory = async () => {
    const { data, error } = await client.from('inventory_items').select('id,sku,name,category,stock,price,notes,created_at').order('created_at', { ascending: false });
    if (error) return setMessage('[data-inventory-status]', databaseMessage(error), true);
    renderInventory(data);
  };
  const loadClients = async () => {
    const { data, error } = await client.from('clients').select('id,company,contact_name,email,phone,notes,created_at').order('created_at', { ascending: false });
    if (error) return setMessage('[data-clients-status]', databaseMessage(error), true);
    renderClients(data);
  };

  document.querySelector('#inventory-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setMessage('[data-inventory-status]', 'Guardando producto…');
    const { error } = await client.from('inventory_items').insert({ sku: values.get('sku'), name: values.get('name'), category: values.get('category') || null, stock: Number(values.get('stock') || 0), price: values.get('price') ? Number(values.get('price')) : null, notes: values.get('notes') || null });
    if (error) return setMessage('[data-inventory-status]', databaseMessage(error), true);
    form.reset();
    setMessage('[data-inventory-status]', 'Producto agregado correctamente.');
    loadInventory();
  });
  document.querySelector('#clients-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setMessage('[data-clients-status]', 'Guardando cliente…');
    const { error } = await client.from('clients').insert({ company: values.get('company'), contact_name: values.get('contact_name'), email: values.get('email') || null, phone: values.get('phone') || null, notes: values.get('notes') || null });
    if (error) return setMessage('[data-clients-status]', databaseMessage(error), true);
    form.reset();
    setMessage('[data-clients-status]', 'Cliente agregado correctamente.');
    loadClients();
  });

  page.addEventListener('click', async (event) => {
    const inventoryId = event.target.dataset.deleteInventory;
    const clientId = event.target.dataset.deleteClient;
    if (inventoryId) {
      const { error } = await client.from('inventory_items').delete().eq('id', inventoryId);
      if (error) return setMessage('[data-inventory-status]', databaseMessage(error), true);
      loadInventory();
    }
    if (clientId) {
      const { error } = await client.from('clients').delete().eq('id', clientId);
      if (error) return setMessage('[data-clients-status]', databaseMessage(error), true);
      loadClients();
    }
  });

  Promise.all([loadInventory(), loadClients()]);
})();
