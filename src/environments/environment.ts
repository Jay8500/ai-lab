// Public client config. The anon key is safe to ship; RLS protects the data.
export const environment = {
  supabaseUrl: 'https://njxnlszjfghbbjpmzwhh.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5qeG5sc3pqZmdoYmJqcG16d2hoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIyNTU1MzUsImV4cCI6MjEwNzgzMTUzNX0.fwjAAxGlzQ7BAusZDBN5aRS8VSUOR0yyJL4edHl3kDI',
  /** Root domain whose subdomains map to lab slugs: srisai.spreadapps.in -> srisai */
  baseDomain: 'spreadapps.in',
  /** Where the super admin console lives. Switch to 'ailab.spreadapps.in' once that domain is on the Netlify site. */
  platformHost: 'ailab.spreadapps.in',
  /** Subdomains that belong to the platform, never to a lab */
  reservedSubdomains: ['www', 'app', 'admin', 'lab', 'labs', 'ailab', 'ai-lab', 'circles', 'api'],
  /** Lab used when ?lab= is not given on netlify.app / localhost previews (null = SpreadApps landing) */
  demoTenant: null as string | null,
  brand: {
    name: 'SpreadApps',
    product: 'AI-Lab',
    logo: '/brand/spreadapps-icon.png',
    supportEmail: 'support@spreadapps.in',
    website: 'https://spreadapps.in',
  },
};
