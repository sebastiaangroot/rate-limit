const ratelimit = require('..');

function recv() {
  var msg = {};
  msg['body'] = 'A simple message';
  msg['headers'] = {};
  msg['headers']['Retry-After'] = Math.floor(Math.random() * (4 - 1) + 1);
  return msg;
}

/* Places requests of a single type in a queue (of max length 10 here) and imposes appropriate rate-limiting */
rateLimiter = new ratelimit.RateLimiter(ratelimit.MODE.QUEUE, 10);

var attempts = 5;
function requestLoop() {
  try {
    rateLimiter.dispatch('test-request',
      function(updateHeaders) {
        var msg = recv();
        console.log(msg['body']);
        updateHeaders(msg['headers']);
      },
      function() { /* callbacks in MODE.QUEUE are used when the entire queue is empty */
        console.log('The queue is empty!');
      }
    );
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

