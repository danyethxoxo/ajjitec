(() => {
  const basePath = window.location.pathname.endsWith('/')
    ? window.location.pathname
    : window.location.pathname.slice(0, window.location.pathname.lastIndexOf('/') + 1);

  window.ajjitecSupabase = window.supabase.createClient(
    'https://wtactxmqpldgilwscbci.supabase.co',
    'sb_publishable_jyYQOjIQhSVOQxTRPZqrwA_QWoGJTZO'
  );
  window.ajjitecAuthBase = `${window.location.origin}${basePath}`;
})();
