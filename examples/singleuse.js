const ratelimit = require('..');

function recv() {
  var msg = {};
  msg['body'] = 'A simple message';
  msg['headers'] = {};
  msg['headers']['Retry-After'] = Math.floor(Math.random() * 4);
  return msg;
}

function request(updateHeaders) {
  var msg = recv();
  console.log(msg['body']);
  updateHeaders(msg['headers']);
}

/* A simple rate-limiter that, when need be, delays any action we pass to it */
rateLimiter = new ratelimit.RateLimiter(ratelimit.MODE.SINGLE, 2000);

var attempts = 5;
function requestLoop() {
  try {
    rateLimiter.dispatch('test-request', request);
  } catch (err) {
    console.log('Error in rateLimiter.dispatch: ' + err);
    attempts--;
    if (attempts <= 0) {
      console.log('Giving up...');
      return;
    }
  }
  setTimeout(requestLoop, 50);
}

requestLoop();

