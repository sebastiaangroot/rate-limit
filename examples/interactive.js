const readline = require('readline');
const ratelimit = require('..');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: '[user]: '

});

function apiCall(msg) {
  var ans = '';
  var headers = {};
  for (let i = 0; i < msg.length; i++) {
    if (msg[i] === msg[i].toUpperCase()) {
      ans += msg[i].toLowerCase();
    } else {
      ans += msg[i].toUpperCase();
    }
  }
  headers['Retry-After'] = Math.floor(Math.random() * (10 - 1) + 1);
  return {
    body: ans,
    headers: headers,
    code: 200
  };
}

function botHandleMessage(msg, ratelimiter, cmdline) {
  var ans;
  try {
    ratelimiter.dispatch('capAPI', function(handleHeaders) {
      ans = apiCall(msg);
      handleHeaders(ans.headers);
      if (ans.code === 200) {
        let timeout = Math.round((ratelimiter.calls['capAPI'] - Date.now()) / 1000);
        process.stdout.write('\r[cbot]: ' + ans.body + ' (' + timeout + ' sec. timeout)\n');
        cmdline.prompt();
      }

          });
  } catch (err) {
    process.stdout.write('\rYou are overloading the API, slow down!\n');
    cmdline.prompt();
  }
}

ratelimiter = new ratelimit.RateLimiter(ratelimit.MODE.QUEUE, 1);

console.log('[cbot]: Hello! I can swap capitalization on your input using the patented "CapAPI"!');

rl.prompt();

rl.on('line', (line) => {
  line = line.trim();
  botHandleMessage(line, ratelimiter, rl);
  rl.prompt();
});

