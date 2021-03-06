import axiosRequest from './helpers/axiosRequest'

/**
 * @fn new
 * @memberof JsonRpcClient
 *
 * @param options An object stating the backends:
 *                ajaxUrl    A url (relative or absolute) to a http(s) backend.
 *                socketUrl  A url (relative of absolute) to a ws(s) backend.
 *                onmessage  A socket message handler for other messages (non-responses).
 *                getSocket  A function returning a WebSocket or null.
 *                           It must take an onmessage_cb and bind it to the onmessage event
 *                           (or chain it before/after some other onmessage handler).
 *                           Or, it could return null if no socket is available.
 *                           The returned instance must have readyState <= 1, and if less than 1,
 *                           react to onopen binding.
 */
/**
 * @fn new
 * @memberof JsonRpcClient
 *
 * @param options An object stating the backends:
 *                ajaxUrl    A url (relative or absolute) to a http(s) backend.
 *                socketUrl  A url (relative of absolute) to a ws(s) backend.
 *                onmessage  A socket message handler for other messages (non-responses).
 *                getSocket  A function returning a WebSocket or null.
 *                           It must take an onmessage_cb and bind it to the onmessage event
 *                           (or chain it before/after some other onmessage handler).
 *                           Or, it could return null if no socket is available.
 *                           The returned instance must have readyState <= 1, and if less than 1,
 *                           react to onopen binding.
 */
export class JsonRpcClient {
  constructor(options) {
    var self = this;

    this.options = Object.assign({
      ajaxUrl: null,
      socketUrl: null,
      wsFallbackURL: [],
      onmessage: null,
      login: null,
      passwd: null,
      sessid: null,
      loginParams: null,
      userVariables: null,
      getSocket: function (onmessage_cb) {
        return self._getSocket(onmessage_cb);
      }
    }, options)

    self.ws_cnt = 0;
    self.ws_cnt_fallback = 0;
    self._ws_socket = null;
    self._current_id = 1;
    self._ws_callbacks = {};
    self.q = [];

    // Declare an instance version of the onmessage callback to wrap 'this'.
    this.wsOnMessage = function (event) {
      self._wsOnMessage(event);
    };
  }
  static speedTest(bytes, cb) {
    var socket = this.options.getSocket(this.wsOnMessage);
    if (socket !== null) {
      this.speedCB = cb;
      this.speedBytes = bytes;
      socket.send("#SPU " + bytes);

      var loops = bytes / 1024;
      var rem = bytes % 1024;
      var i;
      var data = new Array(1024).join(".");
      for (i = 0; i < loops; i++) {
        socket.send("#SPB " + data);
      }

      if (rem) {
        socket.send("#SPB " + data);
      }

      socket.send("#SPE");
    }
  }
  /**
   * @fn call
   * @memberof JsonRpcClient
   *
   * @param method     The method to run on JSON-RPC server.
   * @param params     The params; an array or object.
   * @param success_cb A callback for successful request.
   * @param error_cb   A callback for error.
   */
   call(method,
    params,
    success_cb,
    error_cb) {
    // Construct the JSON-RPC 2.0 request.
    if (!params) {
      params = {};
    }

    if (this.options.sessid) {
      params.sessid = this.options.sessid;
    }

    var request = {
      jsonrpc: "2.0",
      method: method,
      params: params,
      id: this._current_id++ // Increase the id counter to match request/response
    };

    if (!success_cb) {
      success_cb = function (e) {
        console.log("Success: ", e);
      };
    }

    if (!error_cb) {
      error_cb = function (e) {
        console.log("Error: ", e);
      };
    }

    // Try making a WebSocket call.
    var socket = this.options.getSocket(this.wsOnMessage);
    if (socket !== null) {
      this._wsCall(socket, request, success_cb, error_cb);
      return;
    }

    // No WebSocket, and no HTTP backend?  This won't work.
    if (this.options.ajaxUrl === null) {
      throw "JsonRpcClient.call used with no websocket and no http endpoint.";
    }


    axiosRequest.post(this.options.ajaxUrl, JSON.stringify(request))
      .then(data => {
        if ("error" in data)
          error_cb(data.error, this);
        success_cb(data.result, this);

      }).catch(err => {
        try {
          var response = JSON.parse(err.responseText);

          if ("console" in window)
            console.log(response);

          error_cb(response.error, this);
        } catch (err) {
          // Perhaps the responseText wasn't really a jsonrpc-error.
          error_cb({ error: err.responseText }, this);
        }
      });
  }
  /**
   * Notify sends a command to the server that won't need a response.  In http, there is probably
   * an empty response - that will be dropped, but in ws there should be no response at all.
   *
   * This is very similar to call, but has no id and no handling of callbacks.
   *
   * @fn notify
   * @memberof JsonRpcClient
   *
   * @param method     The method to run on JSON-RPC server.
   * @param params     The params; an array or object.
   */
  static notify(method, params) {
    // Construct the JSON-RPC 2.0 request.
    if (this.options.sessid) {
      params.sessid = this.options.sessid;
    }

    var request = {
      jsonrpc: "2.0",
      method: method,
      params: params
    };

    // Try making a WebSocket call.
    var socket = this.options.getSocket(this.wsOnMessage);
    if (socket !== null) {
      this._wsCall(socket, request);
      return;
    }

    // No WebSocket, and no HTTP backend?  This won't work.
    if (this.options.ajaxUrl === null) {
      throw "JsonRpcClient.notify used with no websocket and no http endpoint.";
    }

    axiosRequest.post(this.options.ajaxUrl, JSON.stringify(request));
  }
  /**
   * Make a batch-call by using a callback.
   *
   * The callback will get an object "batch" as only argument.  On batch, you can call the methods
   * "call" and "notify" just as if it was a normal JsonRpcClient object, and all calls will be
   * sent as a batch call then the callback is done.
   *
   * @fn batch
   * @memberof JsonRpcClient
   *
   * @param callback    The main function which will get a batch handler to run call and notify on.
   * @param all_done_cb A callback function to call after all results have been handled.
   * @param error_cb    A callback function to call if there is an error from the server.
   *                    Note, that batch calls should always get an overall success, and the
   *                    only error
   */
  static batch(callback, all_done_cb, error_cb) {
    var batch = new JsonRpcClient._batchObject(this, all_done_cb, error_cb);
    callback(batch);
    batch._execute();
  }
  /**
   * The default getSocket handler.
   *
   * @param onmessage_cb The callback to be bound to onmessage events on the socket.
   *
   * @fn _getSocket
   * @memberof JsonRpcClient
   */
   socketReady() {
    if (this._ws_socket === null ||this._ws_socket === undefined|| this._ws_socket.readyState > 1) {
      return false;
    }

    return true;
  }
  
  closeSocket() {
    var self = this;
    if (self.socketReady()) {
      self._ws_socket.onclose = function (w) {
        console.log("Closing Socket");
      };
      self._ws_socket.close();
    }
  }
  
  loginData(params) {
    var self = this;
    self.options.login = params.login;
    self.options.passwd = params.passwd;
    self.options.loginParams = params.loginParams;
    self.options.userVariables = params.userVariables;
  }
  
   connectSocket(onmessage_cb) {
    var self = this;

    if (self.to) {
      clearTimeout(self.to);
    }

    if (!self.socketReady()) {
      self.authing = false;

      if (self._ws_socket) {
        delete self._ws_socket;
      }

      // No socket, or dying socket, let's get a new one.
      self._ws_socket = new WebSocket(self.options.socketUrl);

      if (self._ws_socket) {


        console.warn(self._ws_socket);
        // Set up onmessage handler.
        self._ws_socket.onmessage = onmessage_cb;
        self._ws_socket.onclose = function (w) {
          if (!self.ws_sleep) {
            self.ws_sleep = 1000;
          }

          if (self.options.onWSException) {
            self.options.onWSException(w.code);
          }

          if (self.options.onWSClose) {
            self.options.onWSClose(self);
          }

          if (self.ws_cnt > (self.ws_cnt_fallback + 1) * 10 &&
            self.options.wsFallbackURL.length > 0) {
            self.options.socketUrl =
              self.options.wsFallbackURL[self.ws_cnt_fallback];
            self.ws_cnt_fallback++;
          }

         

          console.error(
            "Websocket Lost " +
            self.ws_cnt +
            " sleep: " +
            self.ws_sleep +
            "msec"
          );

          self.to = setTimeout(function () {
            console.log("Attempting Reconnection....");
            self.connectSocket(onmessage_cb);
          }, self.ws_sleep);

          self.ws_cnt++;

          if (self.ws_sleep < 3000 && self.ws_cnt % 10 === 0) {
            self.ws_sleep += 1000;
          }
        };

        // Set up sending of message for when the socket is open.
        self._ws_socket.onopen = function () {
          if (self.to) {
            clearTimeout(self.to);
          }

          self.ws_sleep = 1000;
          self.ws_cnt = 0;
          self.ws_cnt_fallback = 0;

          if (self.options.onWSConnect) {
            self.options.onWSConnect(self);
          }

          var req;
          // Send the requests.
          while ((req = self.q.pop())) {
            self._ws_socket.send(req);
          }
        };
      }
    }

    return self._ws_socket ? true : false;
  }
  static stopRetrying() {
    if (self.to)
      clearTimeout(self.to);
  }
  _getSocket(onmessage_cb) {
    // If there is no ws url set, we don't have a socket.
    // Likewise, if there is no window.WebSocket.
    if (this.options.socketUrl === null || !("WebSocket" in window))
      return null;

    this.connectSocket(onmessage_cb);

    return this._ws_socket;
  }
  /**
   * Internal handler to dispatch a JRON-RPC request through a websocket.
   *
   * @fn _wsCall
   * @memberof JsonRpcClient
   */
   _wsCall(socket,
    request,
    success_cb,
    error_cb) {
    var request_json = JSON.stringify(request);

    if (socket.readyState < 1) {
      // The websocket is not open yet; we have to set sending of the message in onopen.
      self = this; // In closure below, this is set to the WebSocket.  Use self instead.
      self.q.push(request_json);
    } else {
      // We have a socket and it should be ready to send on.
      socket.send(request_json);
    }

    // Setup callbacks.  If there is an id, this is a call and not a notify.
    if ("id" in request && typeof success_cb !== "undefined") {

      this._ws_callbacks[request.id] = {
        request: request_json,
        request_obj: request,
        success_cb: success_cb,
        error_cb: error_cb
      };
    }
  }
  /**
   * Internal handler for the websocket messages.  It determines if the message is a JSON-RPC
   * response, and if so, tries to couple it with a given callback.  Otherwise, it falls back to
   * given external onmessage-handler, if any.
   *
   * @param event The websocket onmessage-event.
   */
   _wsOnMessage(event) {
    // Check if this could be a JSON RPC message.
    var response;

    // Special sub proto
    if (event.data[0] == "#" && event.data[1] == "S" && event.data[2] == "P") {
      if (event.data[3] == "U") {
        this.up_dur = parseInt(event.data.substring(4));
      } else if (this.speedCB && event.data[3] == "D") {
        this.down_dur = parseInt(event.data.substring(4));

        var up_kps = (
          (this.speedBytes * 8) /
          (this.up_dur / 1000) /
          1024
        ).toFixed(0);
        var down_kps = (
          (this.speedBytes * 8) /
          (this.down_dur / 1000) /
          1024
        ).toFixed(0);

        console.info("Speed Test: Up: " + up_kps + " Down: " + down_kps);
        var cb = this.speedCB;
        this.speedCB = null;
        cb(event, {
          upDur: this.up_dur,
          downDur: this.down_dur,
          upKPS: up_kps,
          downKPS: down_kps
        });
      }

      return;
    }

    try {
      response = JSON.parse(event.data);

      /// @todo Make using the jsonrcp 2.0 check optional, to use this on JSON-RPC 1 backends.
      if (typeof response === "object" &&
        "jsonrpc" in response &&
        response.jsonrpc === "2.0") {
        /// @todo Handle bad response (without id).
        // If this is an object with result, it is a response.
        if ("result" in response && this._ws_callbacks[response.id]) {
          // Get the success callback.
          var success_cb = this._ws_callbacks[response.id].success_cb;

          /*
                    // set the sessid if present
                    if ('sessid' in response.result && !this.options.sessid || (this.options.sessid != response.result.sessid)) {
                        this.options.sessid = response.result.sessid;
                        if (this.options.sessid) {
                            console.log("setting session UUID to: " + this.options.sessid);
                        }
                    }
    */
          // Delete the callback from the storage.
          delete this._ws_callbacks[response.id];

          // Run callback with result as parameter.
          success_cb(response.result, this);
          return;
        } else if ("error" in response && this._ws_callbacks[response.id]) {
          // If this is an object with error, it is an error response.
          // Get the error callback.
          var error_cb = this._ws_callbacks[response.id].error_cb;
          var orig_req = this._ws_callbacks[response.id].request;

          // if this is an auth request, send the credentials and resend the failed request
          if (!self.authing &&
            response.error.code == -32000 &&
            self.options.login &&
            self.options.passwd) {
            self.authing = true;

            this.call(
              "login",
              {
                login: self.options.login,
                passwd: self.options.passwd,
                loginParams: self.options.loginParams,
                userVariables: self.options.userVariables
              },
              this._ws_callbacks[response.id].request_obj.method == "login"
                ? function (e) {
                  self.authing = false;
                  console.log("logged in");
                  delete self._ws_callbacks[response.id];

                  if (self.options.onWSLogin) {
                    self.options.onWSLogin(true, self);
                  }
                }
                : function (e) {
                  self.authing = false;
                  console.log(
                    "logged in, resending request id: " + response.id
                  );
                  var socket = self.options.getSocket(self.wsOnMessage);
                  if (socket !== null) {
                    socket.send(orig_req);
                  }
                  if (self.options.onWSLogin) {
                    self.options.onWSLogin(true, self);
                  }
                },

              function (e) {
                console.log("error logging in, request id:", response.id);
                delete self._ws_callbacks[response.id];
                error_cb(response.error, this);
                if (self.options.onWSLogin) {
                  self.options.onWSLogin(false, self);
                }
              }
            );
            return;
          }

          // Delete the callback from the storage.
          delete this._ws_callbacks[response.id];

          // Run callback with the error object as parameter.
          error_cb(response.error, this);
          return;
        }
      }
    } catch (err) {
      // Probably an error while parsing a non json-string as json.  All real JSON-RPC cases are
      // handled above, and the fallback method is called below.
      console.log("ERROR: " + err);
      return;
    }

    // This is not a JSON-RPC response.  Call the fallback message handler, if given.
    if (typeof this.options.onmessage === "function") {
      event.eventData = response;
      if (!event.eventData) {
        event.eventData = {};
      }

      var reply = this.options.onmessage(event);

      if (reply && typeof reply === "object" && event.eventData.id) {
        var msg = {
          jsonrpc: "2.0",
          id: event.eventData.id,
          result: reply
        };

        var socket = self.options.getSocket(self.wsOnMessage);
        if (socket !== null) {
          socket.send(JSON.stringify(msg));
        }
      }
    }
  }
  /************************************************************************************************
   * Batch object with methods
   ************************************************************************************************/
  /**
   * Handling object for batch calls.
   */
  static _batchObject(jsonrpcclient,
    all_done_cb,
    error_cb) {
    // Array of objects to hold the call and notify requests.  Each objects will have the request
    // object, and unless it is a notify, success_cb and error_cb.
    this._requests = [];

    this.jsonrpcclient = jsonrpcclient;
    this.all_done_cb = all_done_cb;
    this.error_cb = typeof error_cb === "function" ? error_cb : function () { };
  }
}

/// Holding the WebSocket on default getsocket.
JsonRpcClient._ws_socket = null;

/// Object <id>: { success_cb: cb, error_cb: cb }
// JsonRpcClient._ws_callbacks = {};

/// The next JSON-RPC request id.
// JsonRpcClient._current_id = 1;

/**
 * Queue to save messages delivered when websocket is not ready
 */
// JsonRpcClient.q = [];
/**
 * @sa JsonRpcClient.prototype.call
 */
JsonRpcClient._batchObject.call = function (
  method,
  params,
  success_cb,
  error_cb
) {
  if (!params) {
    params = {};
  }

  if (this.options.sessid) {
    params.sessid = this.options.sessid;
  }

  if (!success_cb) {
    success_cb = function (e) {
      console.log("Success: ", e);
    };
  }

  if (!error_cb) {
    error_cb = function (e) {
      console.log("Error: ", e);
    };
  }

  this._requests.push({
    request: {
      jsonrpc: "2.0",
      method: method,
      params: params,
      id: this.jsonrpcclient._current_id++ // Use the client's id series.
    },
    success_cb: success_cb,
    error_cb: error_cb
  });
};

/**
 * @sa JsonRpcClient.prototype.notify
 */
JsonRpcClient._batchObject.notify = function (method, params) {
  if (this.options.sessid) {
    params.sessid = this.options.sessid;
  }

  this._requests.push({
    request: {
      jsonrpc: "2.0",
      method: method,
      params: params
    }
  });
};

/**
 * Executes the batched up calls.
 */
JsonRpcClient._batchObject._execute = function () {
  var self = this;

  if (this._requests.length === 0) return; // All done :P

  // Collect all request data and sort handlers by request id.
  var batch_request = [];
  var handlers = {};
  var i = 0;
  var call;
  var success_cb;
  var error_cb;

  // If we have a WebSocket, just send the requests individually like normal calls.
  var socket = self.jsonrpcclient.options.getSocket(
    self.jsonrpcclient.wsOnMessage
  );
  if (socket !== null) {
    for (i = 0; i < this._requests.length; i++) {
      call = this._requests[i];
      success_cb = "success_cb" in call ? call.success_cb : undefined;
      error_cb = "error_cb" in call ? call.error_cb : undefined;
      self.jsonrpcclient._wsCall(socket, call.request, success_cb, error_cb);
    }

    if (typeof all_done_cb === "function") all_done_cb(result);
    return;
  }

  for (i = 0; i < this._requests.length; i++) {
    call = this._requests[i];
    batch_request.push(call.request);

    // If the request has an id, it should handle returns (otherwise it's a notify).
    if ("id" in call.request) {
      handlers[call.request.id] = {
        success_cb: call.success_cb,
        error_cb: call.error_cb
      };
    }
  }

  success_cb = function (data) {
    self._batchCb(data, handlers, self.all_done_cb);
  };

  // No WebSocket, and no HTTP backend?  This won't work.
  if (self.jsonrpcclient.options.ajaxUrl === null) {
    throw "JsonRpcClient.batch used with no websocket and no http endpoint.";
  }

  // Send request

  axiosRequest.post(self.jsonrpcclient.options.ajaxUrl, JSON.stringify(batch_request))
    .then(success_cb)
    .catch((jqXHR, textStatus, errorThrown) => self.error_cb(jqXHR, textStatus, errorThrown))
};

/**
 * Internal helper to match the result array from a batch call to their respective callbacks.
 *
 * @fn _batchCb
 * @memberof JsonRpcClient
 */
JsonRpcClient._batchObject._batchCb = function (
  result,
  handlers,
  all_done_cb
) {
  for (var i = 0; i < result.length; i++) {
    var response = result[i];

    // Handle error
    if ("error" in response) {
      if (response.id === null || !(response.id in handlers)) {
        // An error on a notify?  Just log it to the console.
        if ("console" in window) console.log(response);
      } else {
        handlers[response.id].error_cb(response.error, this);
      }
    } else {
      // Here we should always have a correct id and no error.
      if (!(response.id in handlers) && "console" in window) {
        console.log(response);
      } else {
        handlers[response.id].success_cb(response.result, this);
      }
    }
  }

  if (typeof all_done_cb === "function") all_done_cb(result);
};
