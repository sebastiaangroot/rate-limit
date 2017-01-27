const ratelimit = require('..');

function recv() {
  var msg = {};
  msg['body'] = 'A simple message';
  msg['headers'] = {};
  msg['headers']['Retry-After'] = Math.floor(Math.random() * (4 - 1) + 1);
  return msg;
}

/* A Promise-based rate-limiter that, when need be, delays any action we pass to it */
rateLimiter = new ratelimit.RateLimiter(ratelimit.MODE.PROMISE, 2000);

var attempts = 5;
function requestLoop() {
  /* callbacks (dispatch's optional 3rd argument) are ignored in MODE.PROMISE,
   * as the .then() method provides a more fine-grained way to do the same thing */
  rateLimiter.dispatch('test-request', function(resolve, reject, updateHeaders) {
      var msg = recv();
      console.log(msg['body']);
      updateHeaders(msg['headers']);
      resolve(msg['body']);
  })
  .then(function(body) {
    setTimeout(requestLoop, 500);
  })
  .catch(function(err) {
    console.log('Error in rateLimiter.dispatch: ' + err);
    attempts--;
    if (attempts <= 0) {
      console.log('Giving up...');
      return;
    }
    setTimeout(requestLoop, 500);
  });
}

requestLoop();

