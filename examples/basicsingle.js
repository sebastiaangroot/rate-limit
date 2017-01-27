const ratelimit = require('..');

function recv() {
  var msg = {};
  msg['body'] = 'A simple message';
  msg['headers'] = {};
  msg['headers']['Retry-After'] = Math.floor(Math.random() * (4 - 1) + 1);
  return msg;
}

/* A simple rate-limiter that, when need be, delays any action we pass to it */
/* Note that because the speed at which we send new messages (each send in parallel) is faster than
 * the requested timeout, multiple messages may be send in "batches". */
rateLimiter = new ratelimit.RateLimiter(ratelimit.MODE.SINGLE, 2000);

var attempts = 5;
function requestLoop() {
  try {
    rateLimiter.dispatch('test-request', function(updateHeaders) {
      var msg = recv();
      console.log(msg['body']);
      updateHeaders(msg['headers']);
    });
  } catch (err) {
    console.log('Error in rateLimiter.dispatch: ' + err);
    attempts--;
    if (attempts <= 0) {
      console.log('Giving up...');
      return;
    }
  }
  setTimeout(requestLoop, 500);
}

requestLoop();

