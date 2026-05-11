config.resolve = config.resolve || {};
config.resolve.fallback = {
  ...(config.resolve.fallback || {}),
  crypto: false,
  fs: false,
  path: false,
};
