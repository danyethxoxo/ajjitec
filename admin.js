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
  const dateInputValue = (value) => value ? String(value).slice(0, 10) : '';
  const csvCell = (value) => '"' + String(value ?? '').replace(/"/g, '""') + '"';
  const downloadCsv = (filename, columns, rows) => {
    const header = columns.map((column) => csvCell(column.label)).join(',');
    const body = rows.map((row) => columns.map((column) => csvCell(row[column.key])).join(',')).join('\r\n');
    const blob = new Blob(['\uFEFF' + header + (body ? '\r\n' + body : '')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const setupPage = ({ profile, user }) => {
    if (!profile || !['admin', 'sales', 'inventory', 'viewer'].includes(profile.role)) return;

    const permissions = {
      dashboard: ['admin', 'sales', 'inventory', 'viewer'].includes(profile.role),
      inventory: ['admin', 'inventory', 'viewer'].includes(profile.role),
      inventoryWrite: ['admin', 'inventory'].includes(profile.role),
      clients: ['admin', 'sales', 'viewer'].includes(profile.role),
      clientsWrite: ['admin', 'sales'].includes(profile.role),
      users: profile.role === 'admin',
      quotes: ['admin', 'sales', 'viewer'].includes(profile.role),
      quotesWrite: ['admin', 'sales'].includes(profile.role)
    };
    const quoteProductMap = new Map();
    const inventoryProductMap = new Map();
    const clientMap = new Map();
    const quoteMap = new Map();

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
    let editingProductId = null;
    const productSubmit = inventoryForm?.querySelector('button[type="submit"]');
    let cancelProductEdit = inventoryForm?.querySelector('[data-cancel-product-edit]');
    if (inventoryForm && productSubmit && !cancelProductEdit) {
      cancelProductEdit = document.createElement('button');
      cancelProductEdit.type = 'button';
      cancelProductEdit.className = 'admin-user-save admin-form-wide product-cancel-edit';
      cancelProductEdit.dataset.cancelProductEdit = '';
      cancelProductEdit.textContent = 'Cancelar edición';
      cancelProductEdit.hidden = true;
      inventoryForm.insertBefore(cancelProductEdit, productSubmit);
    }
    const setProductFormMode = () => {
      if (!productSubmit) return;
      productSubmit.innerHTML = editingProductId
        ? 'Guardar cambios <span>↗</span>'
        : 'Agregar producto <span>↗</span>';
      if (cancelProductEdit) cancelProductEdit.hidden = !editingProductId;
    };
    const resetProductForm = () => {
      editingProductId = null;
      inventoryForm?.reset();
      setProductFormMode();
    };
    let editingClientId = null;
    const clientSubmit = clientsForm?.querySelector('button[type="submit"]');
    let cancelClientEdit = clientsForm?.querySelector('[data-cancel-client-edit]');
    if (clientsForm && clientSubmit && !cancelClientEdit) {
      cancelClientEdit = document.createElement('button');
      cancelClientEdit.type = 'button';
      cancelClientEdit.className = 'admin-user-save admin-form-wide client-cancel-edit';
      cancelClientEdit.dataset.cancelClientEdit = '';
      cancelClientEdit.textContent = 'Cancelar edición';
      cancelClientEdit.hidden = true;
      clientsForm.insertBefore(cancelClientEdit, clientSubmit);
    }
    const setClientFormMode = () => {
      if (!clientSubmit) return;
      clientSubmit.innerHTML = editingClientId
        ? 'Guardar cambios <span>↗</span>'
        : 'Agregar cliente <span>↗</span>';
      if (cancelClientEdit) cancelClientEdit.hidden = !editingClientId;
    };
    const resetClientForm = () => {
      editingClientId = null;
      clientsForm?.reset();
      setClientFormMode();
    };
    let editingQuoteId = null;
    const quoteSubmit = quoteForm?.querySelector('button[type="submit"]');
    let cancelQuoteEdit = quoteForm?.querySelector('[data-cancel-quote-edit]');
    if (quoteForm && quoteSubmit && !cancelQuoteEdit) {
      cancelQuoteEdit = document.createElement('button');
      cancelQuoteEdit.type = 'button';
      cancelQuoteEdit.className = 'admin-user-save admin-form-wide quote-cancel-edit';
      cancelQuoteEdit.dataset.cancelQuoteEdit = '';
      cancelQuoteEdit.textContent = 'Cancelar edición';
      cancelQuoteEdit.hidden = true;
      quoteForm.insertBefore(cancelQuoteEdit, quoteSubmit);
    }
    const setQuoteFormMode = () => {
      if (!quoteSubmit) return;
      quoteSubmit.innerHTML = editingQuoteId
        ? 'Guardar cambios <span>↗</span>'
        : 'Guardar cotización <span>↗</span>';
      if (cancelQuoteEdit) cancelQuoteEdit.hidden = !editingQuoteId;
    };
    [
      { report: 'inventory', permission: permissions.inventory, status: '[data-inventory-status]', label: 'Exportar inventario CSV' },
      { report: 'clients', permission: permissions.clients, status: '[data-clients-status]', label: 'Exportar clientes CSV' },
      { report: 'quotes', permission: permissions.quotes, status: '[data-quotes-status]', label: 'Exportar cotizaciones CSV' }
    ].forEach((definition) => {
      if (!definition.permission) return;
      const status = document.querySelector(definition.status);
      if (!status) return;
      const wrapper = document.createElement('div');
      wrapper.className = 'admin-export-actions';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'admin-export-button';
      button.dataset.exportReport = definition.report;
      button.textContent = definition.label + ' ↗';
      wrapper.append(button);
      status.after(wrapper);
    });
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
      inventoryProductMap.clear();
      items.forEach((item) => inventoryProductMap.set(item.id, item));
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
        const productActions = permissions.inventoryWrite
          ? '<button class="admin-user-save" type="button" data-edit-product="' + item.id + '">Editar</button><button class="admin-delete" type="button" data-delete-product="' + item.id + '" aria-label="Eliminar ' + escapeHtml(item.name) + '">Eliminar</button>'
          : '';
        return '<tr><td><code class="admin-code">' + escapeHtml(item.sku) + '</code></td><td><div class="admin-product-cell">' + imageCell + '<div><strong>' + escapeHtml(item.name) + '</strong><small>' + escapeHtml(item.short_description || item.slug || 'Sin descripción corta') + '</small></div></div></td><td>' + escapeHtml(categoryName(item)) + '</td><td>' + Number(item.stock || 0) + '</td><td>' + money(item.price, item.currency) + '</td><td>' + status + featured + '</td><td><span class="admin-photo-count">' + images.length + ' ' + (images.length === 1 ? 'foto' : 'fotos') + '</span></td><td>' + productActions + '</td></tr>';
      }).join('');
      empty.hidden = items.length > 0;
      document.querySelector('[data-inventory-count]')?.replaceChildren(items.length + ' ' + (items.length === 1 ? 'producto' : 'productos'));
    };

    const renderClients = (items = []) => {
      const body = document.querySelector('[data-clients-body]');
      const empty = document.querySelector('[data-clients-empty]');
      if (!body || !empty) return;
      clientMap.clear();
      items.forEach((item) => clientMap.set(item.id, item));
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
        const editButton = permissions.clientsWrite
          ? '<button class="admin-user-save" type="button" data-edit-client="' + item.id + '">Editar</button>'
          : '';
        return '<tr data-client-row="' + item.id + '"><td><strong>' + escapeHtml(item.company) + '</strong><small class="admin-user-meta">' + escapeHtml(item.industry || 'Industria no indicada') + '</small></td><td><strong>' + escapeHtml(item.contact_name) + '</strong><small class="admin-user-meta">' + escapeHtml(item.email || item.phone || 'Sin contacto directo') + '</small></td><td><select class="admin-user-control' + statusClass + '" data-client-status aria-label="Estado de ' + escapeHtml(item.company) + '"' + statusDisabled + '>' + options + '</select></td><td>' + escapeHtml(formatDate(item.last_contact_at)) + '</td><td>' + escapeHtml(item.email || '—') + '<br />' + escapeHtml(item.phone || '—') + '</td><td>' + editButton + saveButton + deleteButton + '</td></tr>';
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
      quoteMap.clear();
      items.forEach((item) => quoteMap.set(item.id, item));
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
        const editButton = permissions.quotesWrite && item.status === 'draft'
          ? '<button class="admin-user-save" type="button" data-edit-quote="' + item.id + '">Editar</button>'
          : '';
        const viewButton = editButton + '<a class="admin-user-save quote-link" href="cotizacion.html?id=' + encodeURIComponent(item.id) + '" target="_blank" rel="noreferrer">Ver</a>';
        return '<tr data-quote-row="' + item.id + '"><td><code class="admin-code">COT-' + String(item.quote_number).padStart(6, '0') + '</code><small class="admin-user-meta">' + itemCount + ' ' + (itemCount === 1 ? 'partida' : 'partidas') + '</small></td><td><strong>' + escapeHtml(company) + '</strong></td><td><select class="admin-user-control" data-quote-status aria-label="Estado de cotización"' + disabled + '>' + options + '</select></td><td>' + escapeHtml(formatDate(item.valid_until, 'Sin límite')) + '</td><td><strong>' + money(item.total, item.currency) + '</strong></td><td>' + escapeHtml(formatDate(item.created_at)) + '</td><td>' + viewButton + saveButton + deleteButton + '</td></tr>';
      }).join('');
      empty.hidden = items.length > 0;
      document.querySelector('[data-quotes-count]')?.replaceChildren(items.length + ' ' + (items.length === 1 ? 'cotización' : 'cotizaciones'));
    };

    const exportReport = (report) => {
      const reportData = {
        inventory: {
          filename: 'ajjitec-inventario',
          status: '[data-inventory-status]',
          columns: [
            { key: 'sku', label: 'SKU' },
            { key: 'name', label: 'Producto' },
            { key: 'category', label: 'Categoría' },
            { key: 'slug', label: 'Identificador web' },
            { key: 'price', label: 'Precio' },
            { key: 'currency', label: 'Moneda' },
            { key: 'stock', label: 'Existencias' },
            { key: 'active', label: 'Visible' },
            { key: 'featured', label: 'Destacado' },
            { key: 'photos', label: 'Fotografías' }
          ],
          rows: [...inventoryProductMap.values()].map((item) => ({
            sku: item.sku,
            name: item.name,
            category: categoryName(item),
            slug: item.slug,
            price: item.price,
            currency: item.currency,
            stock: item.stock,
            active: item.active ? 'Sí' : 'No',
            featured: item.featured ? 'Sí' : 'No',
            photos: productImages(item).length
          }))
        },
        clients: {
          filename: 'ajjitec-clientes',
          status: '[data-clients-status]',
          columns: [
            { key: 'company', label: 'Empresa' },
            { key: 'contact_name', label: 'Contacto' },
            { key: 'status', label: 'Estado' },
            { key: 'industry', label: 'Industria' },
            { key: 'email', label: 'Correo' },
            { key: 'phone', label: 'Teléfono' },
            { key: 'website', label: 'Sitio web' },
            { key: 'last_contact_at', label: 'Último contacto' },
            { key: 'address', label: 'Dirección' },
            { key: 'notes', label: 'Notas' }
          ],
          rows: [...clientMap.values()].map((item) => ({
            ...item,
            last_contact_at: dateInputValue(item.last_contact_at)
          }))
        },
        quotes: {
          filename: 'ajjitec-cotizaciones',
          status: '[data-quotes-status]',
          columns: [
            { key: 'folio', label: 'Folio' },
            { key: 'company', label: 'Cliente' },
            { key: 'status', label: 'Estado' },
            { key: 'valid_until', label: 'Vigencia' },
            { key: 'subtotal', label: 'Subtotal' },
            { key: 'tax', label: 'IVA' },
            { key: 'total', label: 'Total' },
            { key: 'currency', label: 'Moneda' },
            { key: 'items', label: 'Partidas' },
            { key: 'created_at', label: 'Creada' }
          ],
          rows: [...quoteMap.values()].map((item) => {
            const relation = item.clients;
            const status = quoteStatuses.find((option) => option.value === item.status);
            return {
              folio: 'COT-' + String(item.quote_number).padStart(6, '0'),
              company: relation?.company || relation?.[0]?.company || 'Cliente sin asignar',
              status: status?.label || item.status,
              valid_until: item.valid_until || '',
              subtotal: item.subtotal,
              tax: item.tax,
              total: item.total,
              currency: item.currency,
              items: Array.isArray(item.quote_items) ? item.quote_items.length : 0,
              created_at: item.created_at
            };
          })
        }
      }[report];
      if (!reportData) return;
      const stamp = new Date().toISOString().slice(0, 10);
      downloadCsv(reportData.filename + '-' + stamp + '.csv', reportData.columns, reportData.rows);
      setMessage(reportData.status, reportData.rows.length + ' ' + (report === 'inventory' ? 'productos' : report === 'clients' ? 'clientes' : 'cotizaciones') + ' exportados en CSV.');
    };

    const renderDashboard = ({ metrics, quoteStatuses: statuses, lowStock }) => {
      const metricValues = {
        products_active: Number(metrics?.products_active || 0),
        inventory_units: Number(metrics?.inventory_units || 0),
        clients_total: Number(metrics?.clients_total || 0),
        clients_leads: Number(metrics?.clients_leads || 0),
        quotes_total: Number(metrics?.quotes_total || 0),
        quotes_approved: Number(metrics?.quotes_approved || 0),
        pipeline_total: money(metrics?.pipeline_total || 0),
        approved_total: money(metrics?.approved_total || 0)
      };
      Object.entries(metricValues).forEach(([key, value]) => {
        document.querySelector('[data-metric="' + key + '"]')?.replaceChildren(String(value));
      });

      const statusList = document.querySelector('[data-dashboard-status-list]');
      const statusEmpty = document.querySelector('[data-dashboard-status-empty]');
      const statusMap = new Map((statuses || []).map((item) => [item.status, item]));
      const maxCount = Math.max(...(statuses || []).map((item) => Number(item.total_count || 0)), 1);
      if (statusList) {
        statusList.innerHTML = quoteStatuses.map((status) => {
          const item = statusMap.get(status.value) || { total_count: 0, total_amount: 0 };
          const countValue = Number(item.total_count || 0);
          const width = Math.min(100, Math.round((countValue / maxCount) * 100));
          return '<div class="dashboard-status-row"><div><span>' + status.label + '</span><strong>' + countValue + '</strong></div><div class="dashboard-bar"><i style="width:' + width + '%"></i></div><small>' + money(item.total_amount || 0) + '</small></div>';
        }).join('');
      }
      if (statusEmpty) statusEmpty.hidden = Boolean(statuses?.length);

      const stockList = document.querySelector('[data-dashboard-stock-list]');
      const stockEmpty = document.querySelector('[data-dashboard-stock-empty]');
      if (stockList) {
        stockList.innerHTML = (lowStock || []).map((item) => '<div class="dashboard-stock-row"><div><strong>' + escapeHtml(item.name) + '</strong><small>' + escapeHtml(item.sku) + '</small></div><b>' + Number(item.stock || 0) + '</b></div>').join('');
      }
      if (stockEmpty) stockEmpty.hidden = Boolean(lowStock?.length);
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
        .select('id,category_id,sku,name,slug,short_description,description,price,currency,stock,active,featured,created_at,product_categories(name),product_images(id,storage_path,is_primary,sort_order)')
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
        .select('id,quote_number,client_id,status,currency,valid_until,notes,tax_rate,subtotal,tax,total,created_at,updated_at,clients(company,contact_name),quote_items(id,product_id,sku,description,quantity,unit_price,discount_percent,sort_order)')
        .order('created_at', { ascending: false });
      if (error) return setMessage('[data-quotes-status]', databaseMessage(error), true);
      renderQuotes(data || []);
    };

    const loadDashboard = async () => {
      if (!permissions.dashboard) return;
      const [metricsResult, statusResult, stockResult] = await Promise.all([
        client.from('dashboard_metrics').select('*').single(),
        client.from('dashboard_quote_status').select('status,total_count,total_amount').order('total_amount', { ascending: false }),
        client.from('dashboard_low_stock').select('id,sku,name,stock,active').limit(6)
      ]);
      const firstError = metricsResult.error || statusResult.error || stockResult.error;
      if (firstError) return setMessage('[data-dashboard-status]', databaseMessage(firstError), true);
      renderDashboard({
        metrics: metricsResult.data,
        quoteStatuses: statusResult.data || [],
        lowStock: stockResult.data || []
      });
    };

    let realtimeChannel = null;
    let realtimeRetry = null;
    let pageActive = true;
    const setRealtimeStatus = (message, error = false) => {
      let element = document.querySelector('[data-realtime-status]');
      if (!element) {
        element = document.createElement('p');
        element.className = 'realtime-status';
        element.dataset.realtimeStatus = '';
        element.setAttribute('aria-live', 'polite');
        document.querySelector('[data-dashboard-status]')?.after(element);
      }
      element.textContent = message;
      element.dataset.state = error ? 'error' : 'success';
    };
    const refreshFromRealtime = (table) => {
      const tasks = [loadDashboard()];
      if (['products', 'product_images', 'product_categories'].includes(table)) {
        tasks.push(loadInventory(), loadQuoteProducts(), loadCategories());
      }
      if (table === 'clients') tasks.push(loadClients(), loadQuoteClients());
      if (['quotes', 'quote_items'].includes(table)) tasks.push(loadQuotes());
      if (table === 'profiles') tasks.push(loadUsers());
      Promise.all(tasks);
    };
    const connectRealtime = () => {
      if (!pageActive) return;
      if (realtimeChannel) client.removeChannel(realtimeChannel);
      const tables = ['profiles', 'product_categories', 'products', 'product_images', 'clients', 'quotes', 'quote_items'];
      const channel = client.channel('ajjitec-admin-updates');
      tables.forEach((table) => {
        channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => refreshFromRealtime(table));
      });
      realtimeChannel = channel;
      channel.subscribe((status, error) => {
        if (status === 'SUBSCRIBED') {
          if (realtimeRetry) {
            clearTimeout(realtimeRetry);
            realtimeRetry = null;
          }
          setRealtimeStatus('● Sincronizado en tiempo real.');
          return;
        }
        if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) {
          setRealtimeStatus('Sin conexión en tiempo real. Reintentando…' + (error?.message ? ' ' + error.message : ''), true);
          if (!realtimeRetry && pageActive) realtimeRetry = setTimeout(() => {
            realtimeRetry = null;
            connectRealtime();
          }, 5000);
        }
      });
    };
    window.addEventListener('beforeunload', () => {
      pageActive = false;
      if (realtimeRetry) clearTimeout(realtimeRetry);
      if (realtimeChannel) client.removeChannel(realtimeChannel);
    }, { once: true });

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
      rows.forEach((row) => {
        delete row.dataset.quoteItemId;
        delete row.dataset.quoteSku;
      });
      editingQuoteId = null;
      quoteForm.reset();
      setQuoteFormMode();
      updateQuoteSummary();
    };

    const fillQuoteItemRow = (row, item) => {
      if (!row || !item) return;
      delete row.dataset.quoteItemId;
      delete row.dataset.quoteSku;
      const productControl = row.querySelector('[data-quote-product]');
      const productId = item.product_id || '';
      if (productControl && productId && ![...productControl.options].some((option) => option.value === productId)) {
        const option = document.createElement('option');
        option.value = productId;
        option.textContent = [item.sku, item.description].filter(Boolean).join(' · ') || 'Producto guardado';
        productControl.append(option);
      }
      if (productControl) productControl.value = productId;
      row.querySelector('[data-quote-description]').value = item.description || '';
      row.querySelector('[data-quote-quantity]').value = item.quantity ?? 1;
      row.querySelector('[data-quote-price]').value = item.unit_price ?? 0;
      row.querySelector('[data-quote-discount]').value = item.discount_percent ?? 0;
      if (item.id) row.dataset.quoteItemId = item.id;
      if (item.sku) row.dataset.quoteSku = item.sku;
    };

    quoteForm?.addEventListener('input', updateQuoteSummary);
    quoteForm?.addEventListener('change', (event) => {
      const productControl = event.target.closest?.('[data-quote-product]');
      if (productControl) {
        const row = productControl.closest('[data-quote-item]');
        const product = quoteProductMap.get(productControl.value);
        if (row) row.dataset.quoteSku = product?.sku || '';
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
          sku: product?.sku || row.dataset.quoteSku || null,
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

      const wasEditing = Boolean(editingQuoteId);
      const existingQuote = wasEditing ? quoteMap.get(editingQuoteId) : null;
      const existingItems = Array.isArray(existingQuote?.quote_items) ? existingQuote.quote_items : [];
      submit.disabled = true;
      setMessage('[data-quotes-status]', 'Guardando cotización…');
      try {
        const quotePayload = {
          client_id: values.get('client_id'),
          status: 'draft',
          currency: 'MXN',
          valid_until: values.get('valid_until') || null,
          notes: String(values.get('notes') || '').trim() || null,
          tax_rate: Number(values.get('tax_rate') || 0)
        };
        let quote;
        let error;
        if (wasEditing) {
          const result = await client.from('quotes').update(quotePayload).eq('id', editingQuoteId).select('id,quote_number').single();
          quote = result.data;
          error = result.error;
        } else {
          const result = await client.from('quotes').insert(quotePayload).select('id,quote_number').single();
          quote = result.data;
          error = result.error;
        }
        if (error) return setMessage('[data-quotes-status]', databaseMessage(error), true);

        if (wasEditing) {
          const { error: clearItemsError } = await client.from('quote_items').delete().eq('quote_id', quote.id);
          if (clearItemsError) return setMessage('[data-quotes-status]', databaseMessage(clearItemsError), true);
        }
        const { error: itemsError } = await client.from('quote_items').insert(items.map((item) => ({
          ...item,
          quote_id: quote.id
        })));
        if (itemsError) {
          if (!wasEditing) {
            await client.from('quotes').delete().eq('id', quote.id);
          } else if (existingItems.length) {
            await client.from('quote_items').insert(existingItems.map(({ product_id, sku, description, quantity, unit_price, discount_percent, sort_order }) => ({
              quote_id: quote.id,
              product_id,
              sku,
              description,
              quantity,
              unit_price,
              discount_percent,
              sort_order
            })));
          }
          return setMessage('[data-quotes-status]', databaseMessage(itemsError), true);
        }

        resetQuoteBuilder();
        setMessage('[data-quotes-status]', 'Cotización COT-' + String(quote.quote_number).padStart(6, '0') + ' guardada correctamente.');
        await loadQuotes();
        await loadDashboard();
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

      const productPayload = {
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
      };
      const wasEditing = Boolean(editingProductId);
      const existingProduct = wasEditing ? inventoryProductMap.get(editingProductId) : null;
      const existingImages = productImages(existingProduct);
      submit.disabled = true;
      setMessage('[data-inventory-status]', wasEditing ? 'Guardando cambios…' : 'Guardando producto…');
      try {
        let product;
        let error;
        if (wasEditing) {
          const result = await client.from('products').update(productPayload).eq('id', editingProductId).select('id').single();
          product = result.data;
          error = result.error;
        } else {
          const result = await client.from('products').insert(productPayload).select('id').single();
          product = result.data;
          error = result.error;
        }
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
            resetProductForm();
            await loadInventory();
            await loadDashboard();
            return setMessage('[data-inventory-status]', (wasEditing ? 'Producto actualizado, pero ' : 'Producto guardado, pero ') + storageMessage(uploadError), true);
          }
          uploadedPaths.push(storagePath);
        }

        if (uploadedPaths.length) {
          const { error: imageError } = await client.from('product_images').insert(uploadedPaths.map((storagePath, index) => ({
            product_id: product.id,
            storage_path: storagePath,
            alt_text: name,
            sort_order: existingImages.length + index,
            is_primary: existingImages.length === 0 && index === 0
          })));
          if (imageError) {
            await removeUploadedFiles(uploadedPaths);
            resetProductForm();
            await loadInventory();
            await loadDashboard();
            return setMessage('[data-inventory-status]', (wasEditing ? 'Producto actualizado, pero ' : 'Producto guardado, pero ') + 'no pudimos registrar sus fotografías.', true);
          }
        }

        resetProductForm();
        setMessage('[data-inventory-status]', (wasEditing ? 'Producto actualizado correctamente.' : 'Producto agregado correctamente.') + (uploadedPaths.length ? ' Fotografías cargadas.' : ''));
        await loadInventory();
        await loadDashboard();
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
      const clientPayload = {
        company: String(values.get('company') || '').trim(),
        contact_name: String(values.get('contact_name') || '').trim(),
        status: values.get('status') || 'lead',
        industry: String(values.get('industry') || '').trim() || null,
        email: String(values.get('email') || '').trim() || null,
        phone: String(values.get('phone') || '').trim() || null,
        website: String(values.get('website') || '').trim() || null,
        last_contact_at: values.get('last_contact_at') || null,
        address: String(values.get('address') || '').trim() || null,
        notes: String(values.get('notes') || '').trim() || null
      };
      const wasEditing = Boolean(editingClientId);
      const submit = form.querySelector('button[type="submit"]');
      submit.disabled = true;
      setMessage('[data-clients-status]', wasEditing ? 'Guardando cambios…' : 'Guardando cliente…');
      try {
        let error;
        if (wasEditing) {
          const result = await client.from('clients').update(clientPayload).eq('id', editingClientId).select('id').single();
          error = result.error;
        } else {
          const result = await client.from('clients').insert(clientPayload);
          error = result.error;
        }
        if (error) return setMessage('[data-clients-status]', databaseMessage(error), true);
        resetClientForm();
        setMessage('[data-clients-status]', wasEditing ? 'Cliente actualizado correctamente.' : 'Cliente agregado correctamente.');
        await loadClients();
        await loadQuoteClients();
        await loadDashboard();
      } catch (error) {
        setMessage('[data-clients-status]', databaseMessage(error), true);
      } finally {
        submit.disabled = false;
      }
    });

    page.addEventListener('click', async (event) => {
      const exportButton = event.target.closest?.('[data-export-report]');
      if (exportButton) {
        exportReport(exportButton.dataset.exportReport);
        return;
      }

      const cancelQuote = event.target.closest?.('[data-cancel-quote-edit]');
      if (cancelQuote && permissions.quotesWrite) {
        resetQuoteBuilder();
        setMessage('[data-quotes-status]', 'Edición cancelada.');
        return;
      }

      const editQuote = event.target.closest?.('[data-edit-quote]');
      if (editQuote && permissions.quotesWrite && quoteForm) {
        const item = quoteMap.get(editQuote.dataset.editQuote);
        if (!item || item.status !== 'draft') return;
        const lineItems = (Array.isArray(item.quote_items) ? item.quote_items : [])
          .slice()
          .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
        resetQuoteBuilder();
        const field = (name) => quoteForm.querySelector('[name="' + name + '"]');
        field('client_id').value = item.client_id || '';
        field('valid_until').value = item.valid_until || '';
        field('tax_rate').value = item.tax_rate ?? 16;
        field('notes').value = item.notes || '';
        const itemsContainer = quoteForm.querySelector('[data-quote-items]');
        const firstRow = quoteForm.querySelector('[data-quote-item]');
        lineItems.forEach((lineItem, index) => {
          const row = index === 0 ? firstRow : firstRow.cloneNode(true);
          if (index > 0) itemsContainer.append(row);
          fillQuoteItemRow(row, lineItem);
        });
        editingQuoteId = item.id;
        setQuoteFormMode();
        updateQuoteSummary();
        setMessage('[data-quotes-status]', 'Editando COT-' + String(item.quote_number).padStart(6, '0') + '.');
        quoteForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
        field('client_id').focus();
        return;
      }

      const cancelClient = event.target.closest?.('[data-cancel-client-edit]');
      if (cancelClient && permissions.clientsWrite) {
        resetClientForm();
        setMessage('[data-clients-status]', 'Edición cancelada.');
        return;
      }

      const editClient = event.target.closest?.('[data-edit-client]');
      if (editClient && permissions.clientsWrite && clientsForm) {
        const item = clientMap.get(editClient.dataset.editClient);
        if (!item) return;
        const field = (name) => clientsForm.querySelector('[name="' + name + '"]');
        field('company').value = item.company || '';
        field('contact_name').value = item.contact_name || '';
        field('status').value = item.status || 'lead';
        field('industry').value = item.industry || '';
        field('email').value = item.email || '';
        field('phone').value = item.phone || '';
        field('website').value = item.website || '';
        field('last_contact_at').value = dateInputValue(item.last_contact_at);
        field('address').value = item.address || '';
        field('notes').value = item.notes || '';
        editingClientId = item.id;
        setClientFormMode();
        setMessage('[data-clients-status]', 'Editando ' + item.company + '.');
        clientsForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
        field('company').focus();
        return;
      }

      const cancelProduct = event.target.closest?.('[data-cancel-product-edit]');
      if (cancelProduct && permissions.inventoryWrite) {
        resetProductForm();
        setMessage('[data-inventory-status]', 'Edición cancelada.');
        return;
      }

      const editProduct = event.target.closest?.('[data-edit-product]');
      if (editProduct && permissions.inventoryWrite && inventoryForm) {
        const item = inventoryProductMap.get(editProduct.dataset.editProduct);
        if (!item) return;
        const field = (name) => inventoryForm.querySelector('[name="' + name + '"]');
        field('sku').value = item.sku || '';
        field('name').value = item.name || '';
        field('category_id').value = item.category_id || '';
        field('slug').value = item.slug || '';
        field('stock').value = item.stock ?? 0;
        field('price').value = item.price ?? 0;
        field('short_description').value = item.short_description || '';
        field('description').value = item.description || '';
        field('active').checked = Boolean(item.active);
        field('featured').checked = Boolean(item.featured);
        field('images').value = '';
        editingProductId = item.id;
        setProductFormMode();
        setMessage('[data-inventory-status]', 'Editando ' + item.name + '. Puedes agregar fotografías nuevas.');
        inventoryForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
        field('name').focus();
        return;
      }

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
        await loadClients();
        await loadDashboard();
        return;
      }

      const addQuoteItem = event.target.closest?.('[data-add-quote-item]');
      if (addQuoteItem && permissions.quotesWrite && quoteForm) {
        const firstRow = quoteForm.querySelector('[data-quote-item]');
        const itemsContainer = quoteForm.querySelector('[data-quote-items]');
        if (!firstRow || !itemsContainer) return;
        const newRow = firstRow.cloneNode(true);
        delete newRow.dataset.quoteItemId;
        delete newRow.dataset.quoteSku;
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
        await loadQuotes();
        await loadDashboard();
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
        await loadQuotes();
        await loadDashboard();
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
        await loadDashboard();
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
        await loadClients();
        await loadDashboard();
      }
    });

    const validUntil = quoteForm?.querySelector('[name="valid_until"]');
    if (validUntil && !validUntil.value) {
      const defaultDate = new Date();
      defaultDate.setDate(defaultDate.getDate() + 30);
      validUntil.value = defaultDate.toISOString().slice(0, 10);
    }
    updateQuoteSummary();
    Promise.all([loadDashboard(), loadCategories(), loadInventory(), loadClients(), loadUsers(), loadQuoteProducts(), loadQuoteClients(), loadQuotes()]);
    connectRealtime();
  };

  if (window.ajjitecAuthReady) window.ajjitecAuthReady.then(setupPage);
})();
