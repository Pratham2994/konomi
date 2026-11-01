// Cloudflare Worker with a cron trigger: pings Konomi every 10 minutes so the free Render instance never sleeps.
// Setup: Cloudflare dashboard > Workers & Pages > Create > "Hello World" Worker, paste this file, Deploy,
// then Settings > Triggers > Cron Triggers > add  */10 * * * *
export default {
  async scheduled(_event, _env, ctx) {
    ctx.waitUntil(fetch('https://konomi.prathampanchal.dev/api/health', { headers: { 'user-agent': 'konomi-keepalive' } }))
  },
  async fetch() {
    const r = await fetch('https://konomi.prathampanchal.dev/api/health')
    return new Response(`konomi: ${r.status}`)
  },
}
