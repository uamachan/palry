export default {
  async fetch(request, env) {
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    return new Response('Pairly assets binding is not configured.', { status: 500 });
  },
};
