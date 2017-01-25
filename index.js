const rateLimit = require('./rate-limit.js');

module.exports = {
  RateLimiter : rateLimit.RateLimiter,
  MODE : rateLimit.MODE
};
