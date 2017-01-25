const ratelimit = require('..');

function recv() {
  var msg = {};
  msg['body'] = 'A simple message';
  msg['headers'] = {};
  msg['headers']['Retry-After'] = Math.floor(Math.random() * 2);
  return msg;
}

function request(updateHeaders) {
  var msg = recv();
  console.log(msg['body']);
  updateHeaders(msg['headers']);
}

/* Places requests of a single type in a queue (of max length 10 here) and imposes appropriate rate-limiting */
rateLimiter = new ratelimit.RateLimiter(ratelimit.MODE.QUEUE, 10);

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
  setTimeout(requestLoop, 200);
}

requestLoop();

