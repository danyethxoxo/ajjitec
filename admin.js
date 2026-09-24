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
  const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);
  const imageBucket = client.storage.from('product-images');
  const clientStatuses = [
    { value: 'lead', label: 'Prospecto' },
    { value: 'active', label: 'Activo' },
    { value: 'inactive', label: 'Inactivo' }
  ];
  const quoteStatuses = [
    { value: 'draft', label: 'Borrador' },
    { value: 'sent', label: 'Enviada' },
    { value: 'approved', label: 'Aprobada' },
    { value: 'rejected', label: 'Rechazada' },
    { value: 'expired', label: 'Vencida' },
    { value: 'cancelled', label: 'Cancelada' }
  ];

  const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  })[character]);
  const slugify = (value = '') => String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const money = (value, currency = 'MXN') => value === null || value === '' || value === undefined
    ? '—'
    : new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: String(currency || 'MXN').trim() || 'MXN'
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
    if (error?.code === '23503') return 'La categoría seleccionada ya no está disponible.';
    if (error?.code === '23505') return 'Ya existe un registro con esos datos.';
    if (error?.code === '22003' || error?.code === '22P02') return 'Revisa los números capturados.';
    return 'No pudimos guardar los datos. Inténtalo de nuevo.';
  };
  const storageMessage = (error) => {
    const message = String(error?.message || '').toLowerCase();
    if (message.includes('mime') || message.includes('type')) return 'El formato de imagen no está permitido.';
    if (message.includes('size') || message.includes('large')) return 'La imagen supera el límite de 5 MB.';
    if (error?.statusCode === 413) return 'La imagen supera el límite de 5 MB.';
    if (error?.statusCode === 403 || error?.statusCode === 401) return 'Tu rol no tiene permiso para cargar imágenes.';
    return 'No pudimos cargar la imagen. Inténtalo de nuevo.';
  };
  const categoryName = (product) => {
    const relation = product?.product_categories;
    return relation?.name || relation?.[0]?.name || 'Sin categoría';
  };
  const publicImageUrl = (storagePath) => {
    if (!storagePath) return '';
    return imageBucket.getPublicUrl(storagePath).data?.publicUrl || '';
  };
  const productImages = (product) => Array.isArray(product?.product_images)
    ? product.product_images
    : [];
  const formatDate = (value, empty = 'Sin fecha') => {
    if (!value) return empty;
    const raw = String(value);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(raw)
      ? new Date(raw + 'T12:00:00')
      : new Date(raw);
    return Number.isNaN(date.getTime())
      ? empty
      : new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' }).format(date);
  };

  const setupPage = ({ profile, user }) => {
    if (!profile || !['admin', 'sales', 'inventory', 'viewer'].includes(profile.role)) return;

    const permissions = {
      inventory: ['admin', 'inventory', 'viewer'].includes(profile.role),
      inventoryWrite: ['admin', 'inventory'].includes(profile.role),
      clients: ['admin', 'sales', 'viewer'].includes(profile.role),
      clientsWrite: ['admin', 'sales'].includes(profile.role),
      users: profile.role === 'admin',
      quotes: ['admin', 'sales', 'viewer'].includes(profile.role),
      quotesWrite: ['admin', 'sales'].includes(profile.role)
    };
    const quoteProductMap = new Map();

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
    const quoteForm = document.querySelector('#quote-form');
    if (inventoryForm && !permissions.inventoryWrite) {
      inventoryForm.hidden = true;
      setMessage('[data-inventory-status]', 'Vista de solo consulta para este rol.');
    }
    if (clientsForm && !permissions.clientsWrite) {
      clientsForm.hidden = true;
      setMessage('[data-clients-status]', 'Vista de solo consulta para este rol.');
    }
    if (quoteForm && !permissions.quotesWrite) {
      quoteForm.hidden = true;
      setMessage('[data-quotes-status]', 'Vista de solo consulta para este rol.');
    }

    const renderInventory = (items = []) => {
      const body = document.querySelector('[data-inventory-body]');
      const empty = document.querySelector('[data-inventory-empty]');
      if (!body || !empty) return;
      body.innerHTML = items.map((item) => {
        const images = productImages(item).sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
        const primaryImage = images.find((image) => image.is_primary) || images[0];
        const imageUrl = publicImageUrl(primaryImage?.storage_path);
        const imageCell = imageUrl
          ? '<img class="admin-product-thumb" src="' + escapeHtml(imageUrl) + '" alt="" loading="lazy" />'
          : '<span class="admin-product-thumb admin-product-thumb-empty">—</span>';
        const status = item.active
          ? '<span class="admin-status-pill is-active">Visible</span>'
          : '<span class="admin-status-pill">Borrador</span>';
        const featured = item.featured ? '<small class="admin-product-featured">Destacado</small>' : '';
        const deleteButton = permissions.inventoryWrite
          ? '<button class="admin-delete" type="button" data-delete-product="' + item.id + '" aria-label="Eliminar ' + escapeHtml(item.name) + '">Eliminar</button>'
          : '';
        return '<tr><td><code class="admin-code">' + escapeHtml(item.sku) + '</code></td><td><div class="admin-product-cell">' + imageCell + '<div><strong>' + escapeHtml(item.name) + '</strong><small>' + escapeHtml(item.short_description || item.slug || 'Sin descripción corta') + '</small></div></div></td><td>' + escapeHtml(categoryName(item)) + '</td><td>' + Number(item.stock || 0) + '</td><td>' + money(item.price, item.currency) + '</td><td>' + status + featured + '</td><td><span class="admin-photo-count">' + images.length + ' ' + (images.length === 1 ? 'foto' : 'fotos') + '</span></td><td>' + deleteButton + '</td></tr>';
      }).join('');
      empty.hidden = items.length > 0;
      document.querySelector('[data-inventory-count]')?.replaceChildren(items.length + ' ' + (items.length === 1 ? 'producto' : 'productos'));
    };

    const renderClients = (items = []) => {
      const body = document.querySelector('[data-clients-body]');
      const empty = document.querySelector('[data-clients-empty]');
      if (!body || !empty) return;
      body.innerHTML = items.map((item) => {
        const options = clientStatuses.map((status) => '<option value="' + status.value + '"' + (item.status === status.value ? ' selected' : '') + '>' + status.label + '</option>').join('');
        const statusClass = item.status === 'active' ? ' is-active' : '';
        const statusDisabled = permissions.clientsWrite ? '' : ' disabled';
        const deleteButton = permissions.clientsWrite
          ? '<button class="admin-delete" type="button" data-delete-client="' + item.id + '" aria-label="Eliminar ' + escapeHtml(item.company) + '">Eliminar</button>'
          : '';
        const saveButton = permissions.clientsWrite
          ? '<button class="admin-user-save" type="button" data-save-client="' + item.id + '">Guardar</button>'
          : '';
        return '<tr data-client-row="' + item.id + '"><td><strong>' + escapeHtml(item.company) + '</strong><small class="admin-user-meta">' + escapeHtml(item.industry || 'Industria no indicada') + '</small></td><td><strong>' + escapeHtml(item.contact_name) + '</strong><small class="admin-user-meta">' + escapeHtml(item.email || item.phone || 'Sin contacto directo') + '</small></td><td><select class="admin-user-control' + statusClass + '" data-client-status aria-label="Estado de ' + escapeHtml(item.company) + '"' + statusDisabled + '>' + options + '</select></td><td>' + escapeHtml(formatDate(item.last_contact_at)) + '</td><td>' + escapeHtml(item.email || '—') + '<br />' + escapeHtml(item.phone || '—') + '</td><td>' + saveButton + deleteButton + '</td></tr>';
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

    const renderQuotes = (items = []) => {
      const body = document.querySelector('[data-quotes-body]');
      const empty = document.querySelector('[data-quotes-empty]');
      if (!body || !empty) return;
      body.innerHTML = items.map((item) => {
        const clientRelation = item.clients;
        const company = clientRelation?.company || clientRelation?.[0]?.company || 'Cliente sin asignar';
        const itemCount = Array.isArray(item.quote_items) ? item.quote_items.length : 0;
        const options = quoteStatuses.map((status) => '<option value="' + status.value + '"' + (item.status === status.value ? ' selected' : '') + '>' + status.label + '</option>').join('');
        const disabled = permissions.quotesWrite ? '' : ' disabled';
        const saveButton = permissions.quotesWrite
          ? '<button class="admin-user-save" type="button" data-save-quote="' + item.id + '">Guardar</button>'
          : '';
        const deleteButton = permissions.quotesWrite && item.status === 'draft'
          ? '<button class="admin-delete" type="button" data-delete-quote="' + item.id + '" aria-label="Eliminar cotización">Eliminar</button>'
          : '';
        return '<tr data-quote-row="' + item.id + '"><td><code class="admin-code">COT-' + String(item.quote_number).padStart(6, '0') + '</code><small class="admin-user-meta">' + itemCount + ' ' + (itemCount === 1 ? 'partida' : 'partidas') + '</small></td><td><strong>' + escapeHtml(company) + '</strong></td><td><select class="admin-user-control" data-quote-status aria-label="Estado de cotización"' + disabled + '>' + options + '</select></td><td>' + escapeHtml(formatDate(item.valid_until, 'Sin límite')) + '</td><td><strong>' + money(item.total, item.currency) + '</strong></td><td>' + escapeHtml(formatDate(item.created_at)) + '</td><td>' + saveButton + deleteButton + '</td></tr>';
      }).join('');
      empty.hidden = items.length > 0;
      document.querySelector('[data-quotes-count]')?.replaceChildren(items.length + ' ' + (items.length === 1 ? 'cotización' : 'cotizaciones'));
    };

    const loadCategories = async () => {
      if (!permissions.inventory) return;
      const selector = document.querySelector('[data-product-category]');
      if (!selector) return;
      const { data, error } = await client.from('product_categories')
        .select('id,name')
        .order('name', { ascending: true });
      if (error) {
        setMessage('[data-inventory-status]', databaseMessage(error), true);
        return;
      }
      selector.innerHTML = '<option value="">Sin categoría</option>' + (data || [])
        .map((category) => '<option value="' + category.id + '">' + escapeHtml(category.name) + '</option>')
        .join('');
    };

    const loadInventory = async () => {
      if (!permissions.inventory) return;
      const { data, error } = await client.from('products')
        .select('id,sku,name,slug,short_description,description,price,currency,stock,active,featured,created_at,product_categories(name),product_images(id,storage_path,is_primary,sort_order)')
        .order('created_at', { ascending: false });
      if (error) return setMessage('[data-inventory-status]', databaseMessage(error), true);
      renderInventory(data || []);
    };

    const loadClients = async () => {
      if (!permissions.clients) return;
      const { data, error } = await client.from('clients')
        .select('id,company,contact_name,email,phone,industry,website,address,notes,status,last_contact_at,updated_at,created_at')
        .order('updated_at', { ascending: false });
      if (error) return setMessage('[data-clients-status]', databaseMessage(error), true);
      renderClients(data || []);
    };

    const loadUsers = async () => {
      if (!permissions.users) return;
      const { data, error } = await client.from('profiles')
        .select('id,email,name,company,role,active,created_at')
        .order('created_at', { ascending: false });
      if (error) return setMessage('[data-users-status]', databaseMessage(error), true);
      renderUsers(data || []);
    };

    const loadQuoteProducts = async () => {
      if (!permissions.quotes) return;
      const { data, error } = await client.from('products')
        .select('id,sku,name,short_description,price,currency')
        .eq('active', true)
        .order('name', { ascending: true });
      if (error) return setMessage('[data-quotes-status]', databaseMessage(error), true);
      quoteProductMap.clear();
      (data || []).forEach((product) => quoteProductMap.set(product.id, product));
      document.querySelectorAll('[data-quote-product]').forEach((selector) => {
        selector.innerHTML = '<option value="">Producto o servicio</option>' + (data || [])
          .map((product) => '<option value="' + product.id + '">' + escapeHtml(product.sku + ' · ' + product.name) + '</option>')
          .join('');
      });
    };

    const loadQuoteClients = async () => {
      if (!permissions.quotes) return;
      const selector = document.querySelector('[data-quote-client]');
      if (!selector) return;
      const { data, error } = await client.from('clients')
        .select('id,company,contact_name,status')
        .order('company', { ascending: true });
      if (error) return setMessage('[data-quotes-status]', databaseMessage(error), true);
      selector.innerHTML = '<option value="">Selecciona un cliente</option>' + (data || [])
        .map((item) => '<option value="' + item.id + '">' + escapeHtml(item.company + ' · ' + item.contact_name) + '</option>')
        .join('');
    };

    const loadQuotes = async () => {
      if (!permissions.quotes) return;
      const { data, error } = await client.from('quotes')
        .select('id,quote_number,status,currency,valid_until,subtotal,tax,total,created_at,updated_at,clients(company,contact_name),quote_items(id)')
        .order('created_at', { ascending: false });
      if (error) return setMessage('[data-quotes-status]', databaseMessage(error), true);
      renderQuotes(data || []);
    };

    const removeUploadedFiles = async (paths) => {
      if (!paths.length) return null;
      const { error } = await imageBucket.remove(paths);
      return error;
    };

    const updateQuoteSummary = () => {
      if (!quoteForm) return;
      const subtotal = [...quoteForm.querySelectorAll('[data-quote-item]')].reduce((sum, row) => {
        const quantity = Number(row.querySelector('[data-quote-quantity]')?.value || 0);
        const unitPrice = Number(row.querySelector('[data-quote-price]')?.value || 0);
        const discount = Number(row.querySelector('[data-quote-discount]')?.value || 0);
        return sum + (quantity * unitPrice * (1 - discount / 100));
      }, 0);
      const taxRate = Number(quoteForm.querySelector('[name="tax_rate"]')?.value || 0);
      const tax = subtotal * taxRate / 100;
      document.querySelector('[data-quote-subtotal]')?.replaceChildren(money(subtotal));
      document.querySelector('[data-quote-tax]')?.replaceChildren(money(tax));
      document.querySelector('[data-quote-total]')?.replaceChildren(money(subtotal + tax));
    };

    const resetQuoteBuilder = () => {
      if (!quoteForm) return;
      const rows = [...quoteForm.querySelectorAll('[data-quote-item]')];
      rows.slice(1).forEach((row) => row.remove());
      quoteForm.reset();
      updateQuoteSummary();
    };

    quoteForm?.addEventListener('input', updateQuoteSummary);
    quoteForm?.addEventListener('change', (event) => {
      const productControl = event.target.closest?.('[data-quote-product]');
      if (productControl) {
        const row = productControl.closest('[data-quote-item]');
        const product = quoteProductMap.get(productControl.value);
        if (product && row) {
          const description = row.querySelector('[data-quote-description]');
          const price = row.querySelector('[data-quote-price]');
          if (description && !description.value.trim()) description.value = product.name;
          if (price) price.value = Number(product.price || 0).toFixed(2);
        }
      }
      updateQuoteSummary();
    });

    quoteForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!permissions.quotesWrite) return;
      const form = event.currentTarget;
      const submit = form.querySelector('button[type="submit"]');
      const values = new FormData(form);
      const rows = [...form.querySelectorAll('[data-quote-item]')];
      const items = rows.map((row, index) => {
        const productId = row.querySelector('[data-quote-product]')?.value || null;
        const product = productId ? quoteProductMap.get(productId) : null;
        return {
          product_id: productId,
          sku: product?.sku || null,
          description: String(row.querySelector('[data-quote-description]')?.value || '').trim(),
          quantity: Number(row.querySelector('[data-quote-quantity]')?.value || 0),
          unit_price: Number(row.querySelector('[data-quote-price]')?.value || 0),
          discount_percent: Number(row.querySelector('[data-quote-discount]')?.value || 0),
          sort_order: index
        };
      });
      if (!values.get('client_id')) return setMessage('[data-quotes-status]', 'Selecciona un cliente para la cotización.', true);
      if (!items.length || items.some((item) => !item.description || item.quantity <= 0 || item.unit_price < 0 || item.discount_percent < 0 || item.discount_percent > 100)) {
        return setMessage('[data-quotes-status]', 'Completa al menos una partida con cantidad, descripción y precio válidos.', true);
      }

      submit.disabled = true;
      setMessage('[data-quotes-status]', 'Guardando cotización…');
      try {
        const { data: quote, error } = await client.from('quotes').insert({
          client_id: values.get('client_id'),
          status: 'draft',
          currency: 'MXN',
          valid_until: values.get('valid_until') || null,
          notes: String(values.get('notes') || '').trim() || null,
          tax_rate: Number(values.get('tax_rate') || 0)
        }).select('id,quote_number').single();
        if (error) return setMessage('[data-quotes-status]', databaseMessage(error), true);

        const { error: itemsError } = await client.from('quote_items').insert(items.map((item) => ({
          ...item,
          quote_id: quote.id
        })));
        if (itemsError) {
          await client.from('quotes').delete().eq('id', quote.id);
          return setMessage('[data-quotes-status]', databaseMessage(itemsError), true);
        }

        resetQuoteBuilder();
        setMessage('[data-quotes-status]', 'Cotización COT-' + String(quote.quote_number).padStart(6, '0') + ' guardada correctamente.');
        await loadQuotes();
      } catch (error) {
        setMessage('[data-quotes-status]', databaseMessage(error), true);
      } finally {
        submit.disabled = false;
      }
    });

    inventoryForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!permissions.inventoryWrite) return;
      const form = event.currentTarget;
      const submit = form.querySelector('button[type="submit"]');
      const values = new FormData(form);
      const name = String(values.get('name') || '').trim();
      const slug = slugify(values.get('slug') || name);
      const images = values.getAll('images').filter((file) => file && file.size > 0);
      const invalidImage = images.find((file) => !imageTypes.has(file.type) || file.size > 5242880);
      if (!slug) return setMessage('[data-inventory-status]', 'Agrega un nombre válido para generar el identificador web.', true);
      if (invalidImage) return setMessage('[data-inventory-status]', 'Cada imagen debe ser JPG, PNG, WEBP o AVIF y pesar máximo 5 MB.', true);

      submit.disabled = true;
      setMessage('[data-inventory-status]', 'Guardando producto…');
      try {
        const { data: product, error } = await client.from('products').insert({
          category_id: values.get('category_id') || null,
          sku: String(values.get('sku') || '').trim(),
          name,
          slug,
          short_description: String(values.get('short_description') || '').trim() || null,
          description: String(values.get('description') || '').trim() || null,
          price: Number(values.get('price') || 0),
          currency: 'MXN',
          stock: Number(values.get('stock') || 0),
          active: values.get('active') === 'true',
          featured: values.get('featured') === 'true'
        }).select('id').single();
        if (error) return setMessage('[data-inventory-status]', databaseMessage(error), true);

        const uploadedPaths = [];
        for (const [index, file] of images.entries()) {
          const originalName = file.name.replace(/\.[^.]+$/, '');
          const safeName = slugify(originalName) || 'imagen';
          const extension = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
          const storagePath = product.id + '/' + Date.now() + '-' + index + '-' + safeName + '.' + extension;
          const { error: uploadError } = await imageBucket.upload(storagePath, file, {
            cacheControl: '3600',
            contentType: file.type,
            upsert: false
          });
          if (uploadError) {
            await removeUploadedFiles(uploadedPaths);
            form.reset();
            await loadInventory();
            return setMessage('[data-inventory-status]', 'Producto guardado, pero ' + storageMessage(uploadError), true);
          }
          uploadedPaths.push(storagePath);
        }

        if (uploadedPaths.length) {
          const { error: imageError } = await client.from('product_images').insert(uploadedPaths.map((storagePath, index) => ({
            product_id: product.id,
            storage_path: storagePath,
            alt_text: name,
            sort_order: index,
            is_primary: index === 0
          })));
          if (imageError) {
            await removeUploadedFiles(uploadedPaths);
            form.reset();
            await loadInventory();
            return setMessage('[data-inventory-status]', 'Producto guardado, pero no pudimos registrar sus fotografías.', true);
          }
        }

        form.reset();
        setMessage('[data-inventory-status]', 'Producto agregado correctamente.' + (uploadedPaths.length ? ' Fotografías cargadas.' : ''));
        await loadInventory();
      } catch (error) {
        setMessage('[data-inventory-status]', databaseMessage(error), true);
      } finally {
        submit.disabled = false;
      }
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
        status: values.get('status') || 'lead',
        industry: values.get('industry') || null,
        email: values.get('email') || null,
        phone: values.get('phone') || null,
        website: values.get('website') || null,
        last_contact_at: values.get('last_contact_at') || null,
        address: values.get('address') || null,
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
          .update({ role: roleControl.value, active: activeControl.checked })
          .eq('id', saveUser.dataset.saveUser);
        saveUser.disabled = false;
        if (error) return setMessage('[data-users-status]', databaseMessage(error), true);
        setMessage('[data-users-status]', 'Acceso actualizado correctamente.');
        loadUsers();
        return;
      }

      const saveClient = event.target.closest?.('[data-save-client]');
      if (saveClient && permissions.clientsWrite) {
        const row = saveClient.closest('[data-client-row]');
        const statusControl = row?.querySelector('[data-client-status]');
        if (!row || !statusControl) return;
        saveClient.disabled = true;
        setMessage('[data-clients-status]', 'Guardando estado…');
        const { error } = await client
          .from('clients')
          .update({ status: statusControl.value })
          .eq('id', saveClient.dataset.saveClient);
        saveClient.disabled = false;
        if (error) return setMessage('[data-clients-status]', databaseMessage(error), true);
        setMessage('[data-clients-status]', 'Estado del cliente actualizado.');
        loadClients();
        return;
      }

      const addQuoteItem = event.target.closest?.('[data-add-quote-item]');
      if (addQuoteItem && permissions.quotesWrite && quoteForm) {
        const firstRow = quoteForm.querySelector('[data-quote-item]');
        const itemsContainer = quoteForm.querySelector('[data-quote-items]');
        if (!firstRow || !itemsContainer) return;
        const newRow = firstRow.cloneNode(true);
        newRow.querySelector('[data-quote-product]').value = '';
        newRow.querySelector('[data-quote-description]').value = '';
        newRow.querySelector('[data-quote-quantity]').value = '1';
        newRow.querySelector('[data-quote-price]').value = '0';
        newRow.querySelector('[data-quote-discount]').value = '0';
        itemsContainer.append(newRow);
        updateQuoteSummary();
        newRow.querySelector('[data-quote-description]')?.focus();
        return;
      }

      const removeQuoteItem = event.target.closest?.('[data-remove-quote-item]');
      if (removeQuoteItem && permissions.quotesWrite && quoteForm) {
        const rows = [...quoteForm.querySelectorAll('[data-quote-item]')];
        const row = removeQuoteItem.closest('[data-quote-item]');
        if (rows.length > 1) row?.remove();
        else {
          if (row) {
            row.querySelector('[data-quote-product]').value = '';
            row.querySelector('[data-quote-description]').value = '';
            row.querySelector('[data-quote-quantity]').value = '1';
            row.querySelector('[data-quote-price]').value = '0';
            row.querySelector('[data-quote-discount]').value = '0';
          }
        }
        updateQuoteSummary();
        return;
      }

      const saveQuote = event.target.closest?.('[data-save-quote]');
      if (saveQuote && permissions.quotesWrite) {
        const row = saveQuote.closest('[data-quote-row]');
        const statusControl = row?.querySelector('[data-quote-status]');
        if (!row || !statusControl) return;
        saveQuote.disabled = true;
        setMessage('[data-quotes-status]', 'Guardando estado…');
        const { error } = await client.from('quotes')
          .update({ status: statusControl.value })
          .eq('id', saveQuote.dataset.saveQuote);
        saveQuote.disabled = false;
        if (error) return setMessage('[data-quotes-status]', databaseMessage(error), true);
        setMessage('[data-quotes-status]', 'Estado de la cotización actualizado.');
        loadQuotes();
        return;
      }

      const deleteQuote = event.target.closest?.('[data-delete-quote]');
      if (deleteQuote && permissions.quotesWrite) {
        if (!window.confirm('¿Eliminar esta cotización?')) return;
        deleteQuote.disabled = true;
        const { error } = await client.from('quotes').delete().eq('id', deleteQuote.dataset.deleteQuote);
        deleteQuote.disabled = false;
        if (error) return setMessage('[data-quotes-status]', databaseMessage(error), true);
        setMessage('[data-quotes-status]', 'Cotización eliminada correctamente.');
        loadQuotes();
        return;
      }

      const deleteProduct = event.target.closest?.('[data-delete-product]');
      if (deleteProduct && permissions.inventoryWrite) {
        const productId = deleteProduct.dataset.deleteProduct;
        if (!window.confirm('¿Eliminar este producto y sus fotografías?')) return;
        deleteProduct.disabled = true;
        setMessage('[data-inventory-status]', 'Eliminando producto…');
        const { data: images, error: imageQueryError } = await client.from('product_images')
          .select('storage_path')
          .eq('product_id', productId);
        if (imageQueryError) {
          deleteProduct.disabled = false;
          return setMessage('[data-inventory-status]', databaseMessage(imageQueryError), true);
        }
        const { error: productError } = await client.from('products').delete().eq('id', productId);
        if (productError) {
          deleteProduct.disabled = false;
          return setMessage('[data-inventory-status]', databaseMessage(productError), true);
        }
        const paths = (images || []).map((image) => image.storage_path).filter(Boolean);
        const storageError = await removeUploadedFiles(paths);
        await loadInventory();
        deleteProduct.disabled = false;
        if (storageError) return setMessage('[data-inventory-status]', 'Producto eliminado. Algunas fotografías deberán limpiarse desde Storage.', true);
        setMessage('[data-inventory-status]', 'Producto eliminado correctamente.');
        return;
      }

      const deleteClient = event.target.closest?.('[data-delete-client]');
      if (deleteClient && permissions.clientsWrite) {
        const clientId = deleteClient.dataset.deleteClient;
        if (!window.confirm('¿Eliminar este cliente?')) return;
        const { error } = await client.from('clients').delete().eq('id', clientId);
        if (error) return setMessage('[data-clients-status]', databaseMessage(error), true);
        loadClients();
      }
    });

    const validUntil = quoteForm?.querySelector('[name="valid_until"]');
    if (validUntil && !validUntil.value) {
      const defaultDate = new Date();
      defaultDate.setDate(defaultDate.getDate() + 30);
      validUntil.value = defaultDate.toISOString().slice(0, 10);
    }
    updateQuoteSummary();
    Promise.all([loadCategories(), loadInventory(), loadClients(), loadUsers(), loadQuoteProducts(), loadQuoteClients(), loadQuotes()]);
  };

  if (window.ajjitecAuthReady) window.ajjitecAuthReady.then(setupPage);
})();
