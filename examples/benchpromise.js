const ratelimit = require('..');

function recv() {
  var msg = {};
  msg['body'] = 'A simple message';
  msg['headers'] = {};
  msg['headers']['Retry-After'] = Math.floor(Math.random() * (4 - 1) + 1);
  return msg;
}

rateLimiter = new ratelimit.RateLimiter(ratelimit.MODE.PROMISE, -1);

var start = Date.now();
var nMessages = 0;
function requestLoop() {
  nMessages++;
  if (nMessages === 10000) {
    let total = Date.now() - start;
    console.log('Total time: ' + total + 'ms');
    return;
  }
  rateLimiter.dispatch('test-request', function(resolve, reject, updateHeaders) {
      var msg = recv();
      updateHeaders(msg['headers']);
      resolve(msg['body']);
  });
  setTimeout(requestLoop, 1);
}

requestLoop();

