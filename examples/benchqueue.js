const ratelimit = require('..');

function recv() {
  var msg = {};
  msg['body'] = 'A simple message';
  msg['headers'] = {};
  msg['headers']['Retry-After'] = Math.floor(Math.random() * (4 - 1) + 1);
  return msg;
}

rateLimiter = new ratelimit.RateLimiter(ratelimit.MODE.QUEUE, -1);

var start = Date.now();
var nMessages = 0;
function requestLoop() {
  nMessages++;
  if (nMessages === 10000) {
    let total = Date.now() - start;
    console.log('Total time: ' + total + 'ms');
    console.log('note: by the queue worker thread mechanism, the handling will not end until +- 2.5sec * 10000msgs are handled');
    return;
  }
  rateLimiter.dispatch('test-request', function(updateHeaders) {
    var msg = recv();
    updateHeaders(msg['headers']);
  });
  setTimeout(requestLoop, 1);
}

requestLoop();

