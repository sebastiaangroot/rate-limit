const ratelimit = require('..');

function recv() {
  var msg = {};
  msg['body'] = 'A simple message';
  msg['headers'] = {};
  msg['headers']['Retry-After'] = Math.floor(Math.random() * 4);
  return msg;
}

/* A simple rate-limiter that, when need be, delays any action we pass to it */
rateLimiter = new ratelimit.RateLimiter(ratelimit.MODE.PROMISE, 2000);

var attempts = 5;
function requestLoop() {
  rateLimiter.dispatch('test-request', function(resolve, reject, updateHeaders) {
    var msg = recv();
    console.log(msg['body']);
    updateHeaders(msg['headers']);
    resolve(msg['body']);
  })
  .then(function(body) {
    console.log(body);
    requestLoop();
  })
  .catch(function(err) {
    console.log('Error in rateLimiter.dispatch: ' + err);
    attempts--;
    if (attempts <= 0) {
      console.log('Giving up...');
      return;
    }
    requestLoop();
  });
}

requestLoop();

