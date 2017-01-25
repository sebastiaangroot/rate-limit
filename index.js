const rateLimit = require('./ratelimit.js');

module.exports = {
  RateLimiter : rateLimit.RateLimiter,
  MODE : rateLimit.MODE
};
