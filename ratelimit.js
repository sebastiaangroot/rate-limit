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

/* RateLimiter: stores timeout information and dispatches requests in a rate-limited fashion 
 *   mode:  [string]  one of the modes in the MODE object (SINGLE, QUEUE or PROMISE)
 *   limit: [integer] -1 to disable, otherwise, its effect depends on the chosen mode
 * [MODES]
 *   SINGLE:  any function given to dispatch is executed with a timeout based on the last avaiable
 *            rate-limiting hint. when receiving HTTP headers from a request, they can be used to update this
 *            timeout hint. the limit argument refers to the maximum timeout (in ms) before RateLimiter
 *            fails the request and throws an error. this can be useful to keep your calls responsive for end users
 *            (it might be preferable to say that a certain call is currently unavailable rather than to have to
 *            wait minutes before the request is executed).
 *   QUEUE:   any function given to dispatch is added to a queue specific for this call id, after which the dispatch
 *            function immediately returns. a seperate worker thread empties the queue, one action at a time,
 *            reevaluating the correct timeout after each call. as long as the given action makes no asynchronous
 *            calls, this ensures that rate-limiting hints in the previous message can be applied to the next
 *            request.
 *   PROMISE: any function given to dispatch is immediately returned as a promise. within the promise, a timeout
 *            is first set, after which the supplied function is responsible to either resolve or reject the promise
 *            (as per regular Promise semantics).
 */
function RateLimiter(mode, limit) {
  mode = (mode === undefined) ? MODE.SINGLE : mode;
  limit = (limit === undefined) ? -1 : limit;
  this.mode = mode;
  if (this.mode === MODE.SINGLE || this.mode === MODE.PROMISE) {
    this.timeoutLimit = limit;
    this.timeouts = [];
  } else if (this.mode === MODE.QUEUE) {
    this.queueLimit = limit;
  }
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
 * example: dispatch('Twitter:REST:GET friends/ids'),
 *                        function(handleHeaders) {...; handleHeaders(msg['headers']); ...},
 *                        function() {...});  
 * under SINGLE and QUEUE mode, action expected to accept one argument: action(handleHeaders);
 * here, handleHeaders is a RateLimiter function that you can supply received HTTP headers to.
 * the HTTP headers are expected to be accessible in the following way:
 *   headerObj['headerName'] // gives the string content of the header
 * under PROMISE mode, two additional functions are passed to action: action(resolve, reject, handleHeaders);
 * resolve and reject work according to normal Promise behavior and should be used by the function.
 */
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
RateLimiter.prototype._getValueFromKeyLowerCase = function(key, dict) {
  for (k in dict) {
    if (key === k.toLowerCase()) {
      return dict[k];
    }
  }
  return undefined;
};

RateLimiter.prototype._getUpdateTimeoutWrapper = function(call) {
  var func = function(headers) {
    return this.updateTimeout(call, headers);
  };
  return func.bind(this);
};

RateLimiter.prototype._dispatch_single = function(call, action, cb) {
  let timeout = this.calls[call] - Date.now();
  if (timeout <= this.timeoutLimit || this.timeoutLimit === -1) { // Timeout is small enough or limit is not enabled
    this.timeouts.push(
      setTimeout(function() {
        action(this._getUpdateTimeoutWrapper(call));
        cb();
      }.bind(this), Math.max(timeout, 0))
    );
  } else { // Timeout too long, fail the call
    for (let i = 0; i < this.timeouts.length; i++) {
      clearTimeout(this.timeouts[i]);
    }
    throw "timeoutLimit exceeded";
  }
};

RateLimiter.prototype._dispatch_queue = function(call, action, cb) {
  if (this.queue[call].length >= this.queueLimit && this.queueLimit !== -1) {
    throw "Queue is full!";
  }
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
  setTimeout(function() {
    this._queue_worker(call);
  }.bind(this), Math.max(timeout, 0));
};

RateLimiter.prototype._queue_worker = function(call) {
  if (this.queue[call].length === 0) {
    throw '_queue_worker called on empty queue!';
  }
  
  let request = this.queue[call].shift();
  request.action(this._getUpdateTimeoutWrapper(call));
  
  if (this.queue[call].length === 0) {
    this.queueWorkerActive[call] = false;
    request.cb();
    return;
  }

  let timeout = this.calls[call] - Date.now();
  setTimeout(function() {
    this._queue_worker(call);
  }.bind(this), Math.max(timeout, 0));
};

RateLimiter.prototype._dispatch_promise = function(call, action) {
  let timeout = this.calls[call] - Date.now();
  if (timeout <= this.timeoutLimit || this.timeoutLimit === -1) { // Timeout is small enough
    return new Promise(function(resolve, reject) {
      this.timeouts.push(
        setTimeout(function() {
          action(resolve, reject, this._getUpdateTimeoutWrapper(call).bind(this));
        }.bind(this), Math.max(timeout, 0))
    );
    }.bind(this));
  } else {
    for (let i = 0; i < this.timeouts.length; i++) {
      clearTimeout(this.timeouts[i]);
    }
    return new Promise(function(resolve, reject) {
      reject("timeoutLimit exceeded");
    });
  }
};

module.exports = {
  RateLimiter : RateLimiter,
  MODE : MODE
};
