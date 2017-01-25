/*
 * RateLimiter can be used in two modes of operation:
 *  1) Succeed calls within responsive timeout (e.g. timeouts < 1sec), called for every external call
 *  2) Request queue that RateLimiter automatically handles, with an optional callback when the queue is empty
*/

const MODE = {
  SINGLE : 'SINGLE',
  QUEUE  : 'QUEUE',
  PROMISE: 'PROMISE'
};

const HEADERS = {
  RETRY_AFTER : ['retry-after'],
  X_LIMIT : ['x-rate-limit-limit'],
  X_REMAINING : ['x-rate-limit-remaining'],
  X_RESET : ['x-rate-limit-reset']
};

const SECONDS_IN_MONTH = 2678400;

/* RateLimiter: stores timeout information and dispatches requests in a rate-limited fashion */
function RateLimiter(mode, timeoutLimit) {
  mode = (mode === undefined) ? MODE.SINGLE : mode;
  timeoutLimit = (timeoutLimit === undefined) ? -1 : timeoutLimit;
  this.mode = mode;
  this.timeoutLimit = timeoutLimit;
  this.calls = {};

  if (this.mode === MODE.QUEUE) {
    this.queue = {};
    this.queueWorkerActive = {};
  }
}

/* public methods */

/* dispatch: perform action, taking rate-limits for this call into account
 *   call:   [string]   identifying this call for the rate limiter
 *   action: [function] method that performs the external call
 *   cb:     [function] optional callback for when the action has finished
 * example: dispatch('Twitter:REST:GET friends/ids'), function() {...}, function() {...}  */
RateLimiter.prototype.dispatch = function(call, action, cb) {
  cb = (cb === undefined) ? function(){} : cb;

  if (!(call in this.calls)) {
    this.calls[call] = 0;
    if (this.mode === MODE.QUEUE) {
      this.queue[call] = [];
      this.queueWorkerActive[call] = false;
    }
  }
  
  if (this.mode === MODE.SINGLE) {
    this._dispatch_single(call, action, cb);
  } else if (this.mode === MODE.QUEUE) {
    this._dispatch_queue(call, action, cb);
  } else if (this.mode === MODE.PROMISE) {
    return this._dispatch_promise(call, action);
  }
};

/* updateTimeout: examines a HTTP header object for rate-limiter hints */
RateLimiter.prototype.updateTimeout = function(call, headers) {
  var timeoutMax = 0;
  // first look for 'Retry-After'-like headers
  for (let i = 0; i < HEADERS.RETRY_AFTER.length; i++) {
    let val = this._getValueFromKeyLowerCase(HEADERS.RETRY_AFTER[i], headers);
    if (val !== undefined) {
      // some servers give remaining time in seconds
      // others give a date. we try to make an educated guess
      if (val < SECONDS_IN_MONTH && val >= 0) {
        timeoutMax = Math.max(timeoutMax, Date.now() + (val * 1000));
        break;
      } else if (new Date(val) != 'Invalid Date') {
        timeoutMax = Math.max(timeoutMax, new Date(val).getTime());
        break;
      }
    }
  }
  // TODO: interpret other headers, such as the X-Rate-Limit headers
  this.calls[call] = Math.max(this.calls[call], timeoutMax);
};

/* private methods */
RateLimiter.prototype._getValueFromKeyLowerCase(key, dict) {
  for (k in dict) {
    if (key === k.toLowerCase()) {
      return dict[k];
    }
  }
  return undefined;
};

RateLimiter.prototype._getUpdateTimeoutWrapper = function(call) {
  var context = this;
  return function(headers) {
    return context.updateTimeout(call, headers);
  };
};

RateLimiter.prototype._dispatch_single = function(call, action, cb) {
  var context = this;
  let timeout = this.calls[call] - Date.now();
  if (timeout <= this.timeoutLimit || this.timeoutLimit === -1) { // Timeout is small enough or limit is not enabled
    setTimeout(function() {
      action(context._getUpdateTimeoutWrapper(call));
      cb();
    }, Math.max(timeout, 0)); // Not strictly necessary, but more explicit
  } else { // Timeout too long, fail the call
    throw "timeoutLimit exceeded";
  }
};

RateLimiter.prototype._dispatch_queue = function(call, action, cb) {
  this.queue[call].push({
    action: action,
    cb: cb
  });

  // Given Node.js's cooperative scheduling, if another thread is already
  // busy on this queue, leave it to handle our message
  if (this.queueWorkerActive[call]) {
    return;
  }

  this.queueWorkerActive[call] = true;
  let timeout = this.calls[call] - Date.now();
  setTimeout(this._queue_worker, Math.max(timeout, 0));
};

RateLimiter.prototype._queue_worker = function(call) {
  assert(this.queue[call].length !== 0, '_queue_worker called on empty queue!');
  
  let request = this.queue[call].shift();
  request.action(this._getUpdateTimeoutWrapper(call));
  
  if (this.queue[call].length === 0) {
    this.queueWorkerActive[call] = false;
    request.cb();
    return;
  }

  let timeout = this.calls[call] - Date.now();
  setTimeout(this._queue_worker, Math.max(timeout, 0));
};

RateLimiter.prototype._dispatch_promise = function(call, action) {
  var context = this;
  let timeout = this.calls[call] - Date.now();
  if (timeout <= this.timeoutLimit) { // Timeout is small enough
    return new Promise(function(resolve, reject) {
      setTimeout(function() {
        action(resolve, reject, context.getUpdateTimeoutWrapper(call));
      }, Math.max(timeout, 0));
    });
  } else {
    return new Promise(function(resolve, reject) {
      reject("timeoutLimit exceeded");
    });
  }
};

module.exports = {
  RateLimiter : RateLimiter,
  MODE : MODE
};
