/**
 * Backend configuration
 * -----------------------------------------------------------------------------
 * Browser-safe public config only. Never put a service-role key in this file.
 */

(() => {
  const origin = window.location.origin;
  const isUsableOrigin =
    typeof origin === 'string' &&
    origin &&
    origin !== 'null' &&
    !origin.startsWith('file:');

  window.DJ_BACKEND_CONFIG = {
    enabled: true,
    provider: 'supabase',
    supabaseUrl: 'https://YOUR_PROJECT.supabase.co',
    supabasePublishableKey: 'YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY',
    supabaseAnonKey: 'YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY',
    productsTable: 'products',
    storageBucket: 'product-images',
    imageFolder: 'products',
    siteUrl: isUsableOrigin ? origin : 'http://localhost:5500'
  };
})();
