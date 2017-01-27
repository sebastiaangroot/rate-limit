const ratelimit = require('..');

function recv() {
  var msg = {};
  msg['body'] = 'A simple message';
  msg['headers'] = {};
  msg['headers']['Retry-After'] = Math.floor(Math.random() * (4 - 1) + 1);
  return msg;
}

rateLimiter = new ratelimit.RateLimiter(ratelimit.MODE.SINGLE, -1);

var start = Date.now();
var attempts = 5;
var nMessages = 0;
function requestLoop() {
  nMessages++;
  if (nMessages === 10000) {
    let total = Date.now() - start;
    console.log('Total time: ' + total + 'ms');
    return;
  }
  rateLimiter.dispatch('test-request', function(updateHeaders) {
    var msg = recv();
    updateHeaders(msg['headers']);
  });
  setTimeout(requestLoop, 1);
}

requestLoop();

