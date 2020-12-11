import 'webrtc-adapter';
import { FSRTC } from './FSRTC'
import { JsonRpcClient } from './jsonrpcclient'
import Dialog from './dialog'
import { v4 } from 'uuid'
import { DIRECTION, MESSAGE, STATE } from './enums'

class Verto {
  constructor(options, callbacks) {
    let verto = this;

    Verto.saved.push(verto);

    verto.options = Object.assign({
      login: null,
      passwd: null,
      socketUrl: null,
      wsFallbackURL: [],
      tag: null,
      localTag: null,
      videoParams: {},
      audioParams: {},
      loginParams: {},
      deviceParams: { onResCheck: null },
      userVariables: {},
      iceServers: false,
      ringSleep: 6000,
      sessid: null,
      useStream: null
    }, options);

    if (verto.options.deviceParams.useCamera) {
      FSRTC.getValidRes(
        verto.options.deviceParams.useCamera,
        verto.options.deviceParams.onResCheck
      );
    }

    if (!verto.options.deviceParams.useMic) {
      verto.options.deviceParams.useMic = "any";
    }

    if (!verto.options.deviceParams.useSpeak) {
      verto.options.deviceParams.useSpeak = "any";
    }

    if (verto.options.sessid) {
      Verto.sessid = verto.options.sessid;
    } else {
      verto.sessid =
        localStorage.getItem("verto_session_uuid") || v4();
      localStorage.setItem("verto_session_uuid", verto.sessid);
    }

    verto.dialogs = {};
    verto.callbacks = callbacks || {};
    verto.eventSUBS = {};

    verto.rpcClient = new JsonRpcClient({
      login: verto.options.login,
      passwd: verto.options.passwd,
      socketUrl: verto.options.socketUrl,
      wsFallbackURL: verto.options.wsFallbackURL,
      turnServer: verto.options.turnServer,
      loginParams: verto.options.loginParams,
      userVariables: verto.options.userVariables,
      sessid: verto.sessid,
      onmessage: function (e) {
        return verto.handleMessage(e.eventData);
      },
      onWSConnect: function (o) {
        o.call("login", {});
      },
      onWSLogin: function (success) {
        if (verto.callbacks.onWSLogin) {
          verto.callbacks.onWSLogin(verto, success);
        }
      },
      onWSClose: function (success) {
        if (verto.callbacks.onWSClose) {
          verto.callbacks.onWSClose(verto, success);
        }
        verto.purge();
      },
      onWSClose: function (success) {
        if (verto.callbacks.onWSClose) {
          verto.callbacks.onWSClose(verto, success);
        }
        verto.purge();
      },
      onWSException: function (e) {
        if (verto.callbacks.onWSException) {
          verto.callbacks.onWSException(e);
        }
      }
    });

    var tag = verto.options.tag;
    if (typeof tag === "function") {
      tag = tag();
    }

    if (verto.options.ringFile && verto.options.tag) {
      verto.ringer = document.getElementById(tag);
    }

    verto.rpcClient.call("login", {});
  }
  static deviceParams(obj) {
    var vertoRef = this;

    for (var i in obj) {
      vertoRef.options.deviceParams[i] = obj[i];
    }

    if (obj.useCamera) {
      FSRTC.getValidRes(
        vertoRef.options.deviceParams.useCamera,
        obj ? obj.onResCheck : undefined
      );
    }
  }
  static videoParams(obj) {
    var vertoRef = this;

    for (var i in obj) {
      vertoRef.options.videoParams[i] = obj[i];
    }
  }
  static iceServers(obj) {
    var vertoRef = this;
    vertoRef.options.iceServers = obj;
  }
  static loginData(params) {
    var vertoRef = this;
    vertoRef.options.login = params.login;
    vertoRef.options.passwd = params.passwd;
    vertoRef.rpcClient.loginData(params);
  }

  logout(msg) {
    var vertoRef = this;
    vertoRef.rpcClient.closeSocket();
    if (vertoRef.callbacks.onWSClose) {
      vertoRef.callbacks.onWSClose(vertoRef, false);
    }
    vertoRef.purge();
  }
  login(msg) {
    var vertoRef = this;
    vertoRef.logout();
    vertoRef.rpcClient.call("login", {});
  }

  static message(msg) {
    var vertoRef = this;
    var err = 0;

    if (!msg.to) {
      console.error("Missing To");
      err++;
    }

    if (!msg.body) {
      console.error("Missing Body");
      err++;
    }

    if (err) {
      return false;
    }

    vertoRef.sendMethod("verto.info", {
      msg: msg
    });

    return true;
  }
  static processReply(method, success, e) {
    var vertoRef = this;
    var i;

    //console.log("Response: " + method, success, e);
    switch (method) {
      case "verto.subscribe":
        for (i in e.unauthorizedChannels) {
          drop_bad(vertoRef, e.unauthorizedChannels[i]);
        }
        for (i in e.subscribedChannels) {
          mark_ready(vertoRef, e.subscribedChannels[i]);
        }

        break;
      case "verto.unsubscribe":
        //console.error(e);
        break;
    }
  }

  sendMethod(method, params) {
    var vertoRef = this;

    Verto.rpcClient.call(
      method,
      params,

      function (e) {
        /* Success */
        vertoRef.processReply(method, true, e);
      },

      function (e) {
        /* Error */
        vertoRef.processReply(method, false, e);
      }
    );
  }
  static subscribe(channel, sparams) {
    let vertoRef = this;
    var r = [];
    var subChannels = [];
    var params = sparams || {};

    if (typeof channel === "string") {
      r.push(do_subscribe(vertoRef, channel, subChannels, params));
    } else {
      for (var i in channel) {
        r.push(do_subscribe(vertoRef, channel, subChannels, params));
      }
    }

    if (subChannels.length) {
      Verto.sendMethod("verto.subscribe", {
        eventChannel: subChannels.length == 1 ? subChannels[0] : subChannels,
        subParams: params.subParams
      });
    }

    return r;
  }
  static unsubscribe(handle) {
    var vertoRef = this;
    var i;

    if (!handle) {
      for (i in vertoRef.eventSUBS) {
        if (vertoRef.eventSUBS[i]) {
          vertoRef.unsubscribe(vertoRef.eventSUBS[i]);
        }
      }
    } else {
      var unsubChannels = {};
      var sendChannels = [];
      var channel;

      if (typeof handle == "string") {
        delete vertoRef.eventSUBS[handle];
        unsubChannels[handle]++;
      } else {
        for (i in handle) {
          if (typeof handle[i] == "string") {
            channel = handle[i];
            delete vertoRef.eventSUBS[channel];
            unsubChannels[channel]++;
          } else {
            var repl = [];
            channel = handle[i].eventChannel;

            for (var j in vertoRef.eventSUBS[channel]) {
              if (vertoRef.eventSUBS[channel][j].serno == handle[i].serno) {
              } else {
                repl.push(vertoRef.eventSUBS[channel][j]);
              }
            }

            vertoRef.eventSUBS[channel] = repl;

            if (vertoRef.eventSUBS[channel].length === 0) {
              delete vertoRef.eventSUBS[channel];
              unsubChannels[channel]++;
            }
          }
        }
      }

      for (var u in unsubChannels) {
        console.log("Sending Unsubscribe for: ", u);
        sendChannels.push(u);
      }

      if (sendChannels.length) {
        vertoRef.sendMethod("verto.unsubscribe", {
          eventChannel: sendChannels.length == 1 ? sendChannels[0] : sendChannels
        });
      }
    }
  }
  static broadcast(channel, params) {
    var vertoRef = this;
    var msg = {
      eventChannel: channel,
      data: {}
    };
    for (var i in params) {
      msg.data[i] = params[i];
    }
    vertoRef.sendMethod("verto.broadcast", msg);
  }
  purge(callID) {
    var vertoRef = this;
    var x = 0;
    var i;

    for (i in vertoRef.dialogs) {
      if (!x) {
        console.log("purging dialogs");
      }
      x++;
      vertoRef.dialogs[i].setState(STATE.purge);
    }

    for (i in vertoRef.eventSUBS) {
      if (vertoRef.eventSUBS[i]) {
        console.log("purging subscription: " + i);
        delete vertoRef.eventSUBS[i];
      }
    }
  }
  static hangup(callID) {
    var vertoRef = this;
    if (callID) {
      var dialog = vertoRef.dialogs[callID];

      if (dialog) {
        dialog.hangup();
      }
    } else {
      for (var i in vertoRef.dialogs) {
        vertoRef.dialogs[i].hangup();
      }
    }
  }
  newCall(args, callbacks) {
    var vertoRef = this;

    if (!vertoRef.rpcClient.socketReady()) {
      console.error("Not Connected...");
      return;
    }

    if (args["useCamera"]) {
      vertoRef.options.deviceParams["useCamera"] = args["useCamera"];
      vertoRef.options.deviceParams["useCameraLabel"] = args["useCameraLabel"];
    }

    var dialog = new Dialog(
      DIRECTION.outbound,
      vertoRef,
      args
    );

    if (callbacks) {
      dialog.callbacks = callbacks;
    }

    dialog.invite();

    return dialog;
  }

  handleMessage(data) {
    var vertoRef = this;

    if (!(data && data.method)) {
      console.error("Invalid Data", data);
      return;
    }

    if (data.params.callID) {
      var dialog = vertoRef.dialogs[data.params.callID];

      if (data.method === "verto.attach" && dialog) {
        delete dialog.verto.dialogs[dialog.callID];
        dialog.rtc.stop();
        dialog = null;
      }

      if (dialog) {
        switch (data.method) {
          case "verto.bye":
            dialog.hangup(data.params);
            break;
          case "verto.answer":
            dialog.handleAnswer(data.params);
            break;
          case "verto.media":
            dialog.handleMedia(data.params);
            break;
          case "verto.display":
            dialog.handleDisplay(data.params);
            break;
          case "verto.info":
            dialog.handleInfo(data.params);
            break;
          default:
            console.debug(
              "INVALID METHOD OR NON-EXISTANT CALL REFERENCE IGNORED",
              dialog,
              data.method
            );
            break;
        }
      } else {
        switch (data.method) {
          case "verto.attach":
            data.params.attach = true;

            if (data.params.sdp && data.params.sdp.indexOf("m=video") > 0) {
              data.params.useVideo = true;
            }

            if (data.params.sdp && data.params.sdp.indexOf("stereo=1") > 0) {
              data.params.useStereo = true;
            }

            dialog = new Dialog(
              DIRECTION.inbound,
              vertoRef,
              data.params
            );
            dialog.setState(STATE.recovering);

            break;
          case "verto.invite":
            if (data.params.sdp && data.params.sdp.indexOf("m=video") > 0) {
              data.params.wantVideo = true;
            }

            if (data.params.sdp && data.params.sdp.indexOf("stereo=1") > 0) {
              data.params.useStereo = true;
            }

            dialog = new Dialog(
              DIRECTION.inbound,
              vertoRef,
              data.params
            );
            break;
          default:
            console.debug(
              "INVALID METHOD OR NON-EXISTANT CALL REFERENCE IGNORED"
            );
            break;
        }
      }

      return {
        method: data.method
      };
    } else {
      switch (data.method) {
        case "verto.punt":
          vertoRef.purge();
          vertoRef.logout();
          break;
        case "verto.event":
          var list = null;
          var key = null;

          if (data.params) {
            key = data.params.eventChannel;
          }

          if (key) {
            list = vertoRef.eventSUBS[key];

            if (!list) {
              list = vertoRef.eventSUBS[key.split(".")[0]];
            }
          }

          if (!list && key && key === vertoRef.sessid) {
            if (vertoRef.callbacks.onMessage) {
              vertoRef.callbacks.onMessage(
                vertoRef,
                null,
                MESSAGE.pvtEvent,
                data.params
              );
            }
          } else if (!list && key && vertoRef.dialogs[key]) {
            vertoRef.dialogs[key].sendMessage(
              MESSAGE.pvtEvent,
              data.params
            );
          } else if (!list) {
            if (!key) {
              key = "UNDEFINED";
            }
            console.error("UNSUBBED or invalid EVENT " + key + " IGNORED");
          } else {
            for (var i in list) {
              var sub = list[i];

              if (!sub || !sub.ready) {
                console.error("invalid EVENT for " + key + " IGNORED");
              } else if (sub.handler) {
                sub.handler(vertoRef, data.params, sub.userData);
              } else if (vertoRef.callbacks.onEvent) {
                vertoRef.callbacks.onEvent(vertoRef, data.params, sub.userData);
              } else {
                console.log("EVENT:", data.params);
              }
            }
          }

          break;

        case "verto.info":
          if (vertoRef.callbacks.onMessage) {
            vertoRef.callbacks.onMessage(
              vertoRef,
              null,
              MESSAGE.info,
              data.params.msg
            );
          }
          //console.error(data);
          console.debug(
            "MESSAGE from: " + data.params.msg.from,
            data.params.msg.body
          );

          break;

        case "verto.clientReady":
          if (vertoRef.callbacks.onMessage) {
            vertoRef.callbacks.onMessage(
              vertoRef,
              null,
              MESSAGE.clientReady,
              data.params
            );
          }
          console.debug("CLIENT READY", data.params);
          break;

        default:
          console.error(
            "INVALID METHOD OR NON-EXISTANT CALL REFERENCE IGNORED",
            data.method
          );
          break;
      }
    }
  }
  static liveArray(verto, context, name, config) {
    var la = this;
    var lastSerno = 0;
    var binding = null;
    var user_obj = config.userObj;

    // Inherit methods of hashArray
    hashArray.call(la);

    // Save the hashArray add, del, reorder, clear methods so we can make our own.
    la._add = la.add;
    la._del = la.del;
    la._reorder = la.reorder;
    la._clear = la.clear;

    la.context = context;
    la.name = name;
    la.user_obj = user_obj;

    la.verto = verto;
    la.broadcast = function (channel, obj) {
      verto.broadcast(channel, obj);
    };
    la.errs = 0;

    la.clear = function () {
      la._clear();
      lastSerno = 0;

      if (la.onChange) {
        la.onChange(la, {
          action: "clear"
        });
      }
    };

    la.checkSerno = function (serno) {
      if (serno < 0) {
        return true;
      }

      if (lastSerno > 0 && serno != lastSerno + 1) {
        if (la.onErr) {
          la.onErr(la, {
            lastSerno: lastSerno,
            serno: serno
          });
        }
        la.errs++;
        console.debug(la.errs);
        if (la.errs < 3) {
          la.bootstrap(la.user_obj);
        }
        return false;
      } else {
        lastSerno = serno;
        return true;
      }
    };

    la.reorder = function (serno, a) {
      if (la.checkSerno(serno)) {
        la._reorder(a);
        if (la.onChange) {
          la.onChange(la, {
            serno: serno,
            action: "reorder"
          });
        }
      }
    };

    la.init = function (serno, val, key, index) {
      if (key === null || key === undefined) {
        key = serno;
      }
      if (la.checkSerno(serno)) {
        if (la.onChange) {
          la.onChange(la, {
            serno: serno,
            action: "init",
            index: index,
            key: key,
            data: val
          });
        }
      }
    };

    la.bootObj = function (serno, val) {
      if (la.checkSerno(serno)) {
        //la.clear();
        for (var i in val) {
          la._add(val[i][0], val[i][1]);
        }

        if (la.onChange) {
          la.onChange(la, {
            serno: serno,
            action: "bootObj",
            data: val,
            redraw: true
          });
        }
      }
    };

    // @param serno  La is the serial number for la particular request.
    // @param key    If looking at it as a hash table, la represents the key in the hashArray object where you want to store the val object.
    // @param index  If looking at it as an array, la represents the position in the array where you want to store the val object.
    // @param val    La is the object you want to store at the key or index location in the hash table / array.
    la.add = function (serno, val, key, index) {
      if (key === null || key === undefined) {
        key = serno;
      }
      if (la.checkSerno(serno)) {
        var redraw = la._add(key, val, index);
        if (la.onChange) {
          la.onChange(la, {
            serno: serno,
            action: "add",
            index: index,
            key: key,
            data: val,
            redraw: redraw
          });
        }
      }
    };

    la.modify = function (serno, val, key, index) {
      if (key === null || key === undefined) {
        key = serno;
      }
      if (la.checkSerno(serno)) {
        la._add(key, val, index);
        if (la.onChange) {
          la.onChange(la, {
            serno: serno,
            action: "modify",
            key: key,
            data: val,
            index: index
          });
        }
      }
    };

    la.del = function (serno, key, index) {
      if (key === null || key === undefined) {
        key = serno;
      }
      if (la.checkSerno(serno)) {
        if (index === null || index < 0 || index === undefined) {
          index = la.indexOf(key);
        }
        var ok = la._del(key);

        if (ok && la.onChange) {
          la.onChange(la, {
            serno: serno,
            action: "del",
            key: key,
            index: index
          });
        }
      }
    };

    var eventHandler = function (v, e, la) {
      var packet = e.data;

      //console.error("READ:", packet);
      if (packet.name != la.name) {
        return;
      }

      switch (packet.action) {
        case "init":
          la.init(
            packet.wireSerno,
            packet.data,
            packet.hashKey,
            packet.arrIndex
          );
          break;

        case "bootObj":
          la.bootObj(packet.wireSerno, packet.data);
          break;
        case "add":
          la.add(
            packet.wireSerno,
            packet.data,
            packet.hashKey,
            packet.arrIndex
          );
          break;

        case "modify":
          if (!(packet.arrIndex || packet.hashKey)) {
            console.error("Invalid Packet", packet);
          } else {
            la.modify(
              packet.wireSerno,
              packet.data,
              packet.hashKey,
              packet.arrIndex
            );
          }
          break;
        case "del":
          if (!(packet.arrIndex || packet.hashKey)) {
            console.error("Invalid Packet", packet);
          } else {
            la.del(packet.wireSerno, packet.hashKey, packet.arrIndex);
          }
          break;

        case "clear":
          la.clear();
          break;

        case "reorder":
          la.reorder(packet.wireSerno, packet.order);
          break;

        default:
          if (la.checkSerno(packet.wireSerno)) {
            if (la.onChange) {
              la.onChange(la, {
                serno: packet.wireSerno,
                action: packet.action,
                data: packet.data
              });
            }
          }
          break;
      }
    };

    if (la.context) {
      binding = la.verto.subscribe(la.context, {
        handler: eventHandler,
        userData: la,
        subParams: config.subParams
      });
    }

    la.destroy = function () {
      la._clear();
      la.verto.unsubscribe(binding);
    };

    la.sendCommand = function (cmd, obj) {
      var self = la;
      self.broadcast(self.context, {
        liveArray: {
          command: cmd,
          context: self.context,
          name: self.name,
          obj: obj
        }
      });
    };

    la.bootstrap = function (obj) {
      var self = la;
      la.sendCommand("bootstrap", obj);
      //self.heartbeat();
    };

    la.changepage = function (obj) {
      var self = la;
      self.clear();
      self.broadcast(self.context, {
        liveArray: {
          command: "changepage",
          context: la.context,
          name: la.name,
          obj: obj
        }
      });
    };

    la.heartbeat = function (obj) {
      var self = la;

      var callback = function () {
        self.heartbeat.call(self, obj);
      };
      self.broadcast(self.context, {
        liveArray: {
          command: "heartbeat",
          context: self.context,
          name: self.name,
          obj: obj
        }
      });
      self.hb_pid = setTimeout(callback, 30000);
    };

    la.bootstrap(la.user_obj);
  }
  static liveTable(vertoRef, context, name, jq, config) {
    var dt;
    var la = new Verto.liveArray(vertoRef, context, name, {
      subParams: config.subParams
    });
    var lt = this;

    lt.liveArray = la;
    lt.dataTable = dt;
    lt.verto = vertoRef;

    lt.destroy = function () {
      if (dt) {
        dt.fnDestroy();
      }
      if (la) {
        la.destroy();
      }

      dt = null;
      la = null;
    };

    la.onErr = function (obj, args) {
      console.error("Error: ", obj, args);
    };

    /* back compat so jsonstatus can always be enabled */
    function genRow(data) {
      if (typeof data[4] === "string" && data[4].indexOf("{") > -1) {
        var tmp = JSON.parse(data[4]);
        data[4] = tmp.oldStatus;
        data[5] = null;
      }
      return data;
    }

    function genArray(obj) {
      var data = obj.asArray();

      for (var i in data) {
        data[i] = genRow(data[i]);
      }

      return data;
    }

    la.onChange = function (obj, args) {
      var index = 0;
      var iserr = 0;

      if (!dt) {
        if (!config.aoColumns) {
          if (args.action != "init") {
            return;
          }

          config.aoColumns = [];

          for (var i in args.data) {
            config.aoColumns.push({
              sTitle: args.data[i]
            });
          }
        }

        dt = jq.dataTable(config);
      }

      if (dt && (args.action == "del" || args.action == "modify")) {
        index = args.index;

        if (index === undefined && args.key) {
          index = la.indexOf(args.key);
        }

        if (index === undefined) {
          console.error("INVALID PACKET Missing INDEX\n", args);
          return;
        }
      }

      if (config.onChange) {
        config.onChange(obj, args);
      }

      try {
        switch (args.action) {
          case "bootObj":
            if (!args.data) {
              console.error("missing data");
              return;
            }
            dt.fnClearTable();
            dt.fnAddData(genArray(obj));
            dt.fnAdjustColumnSizing();
            break;
          case "add":
            if (!args.data) {
              console.error("missing data");
              return;
            }
            if (args.redraw > -1) {
              // specific position, more costly
              dt.fnClearTable();
              dt.fnAddData(genArray(obj));
            } else {
              dt.fnAddData(genRow(args.data));
            }
            dt.fnAdjustColumnSizing();
            break;
          case "modify":
            if (!args.data) {
              return;
            }
            //console.debug(args, index);
            dt.fnUpdate(genRow(args.data), index);
            dt.fnAdjustColumnSizing();
            break;
          case "del":
            dt.fnDeleteRow(index);
            dt.fnAdjustColumnSizing();
            break;
          case "clear":
            dt.fnClearTable();
            break;
          case "reorder":
            // specific position, more costly
            dt.fnClearTable();
            dt.fnAddData(genArray(obj));
            break;
          case "hide":
            jq.hide();
            break;

          case "show":
            jq.show();
            break;
        }
      } catch (err) {
        console.error("ERROR: " + err);
        iserr++;
      }

      if (iserr) {
        obj.errs++;
        if (obj.errs < 3) {
          obj.bootstrap(obj.user_obj);
        }
      } else {
        obj.errs = 0;
      }
    };

    la.onChange(la, {
      action: "init"
    });
  }
  /*
          Conference Manager without jQuery table.
       */
  static conf(verto, params) {
    var conf = this;

    conf.params = Object.assign({
      dialog: null,
      hasVid: false,
      laData: null,
      onBroadcast: null,
      onLaChange: null,
      onLaRow: null
    }, params);


    conf.verto = verto;
    conf.serno = CONFMAN_SERNO++;

    createMainModeratorMethods();

    verto.subscribe(conf.params.laData.modChannel, {
      handler: function (v, e) {
        if (conf.params.onBroadcast) {
          conf.params.onBroadcast(verto, conf, e.data);
        }
      }
    });

    verto.subscribe(conf.params.laData.infoChannel, {
      handler: function (v, e) {
        if (typeof conf.params.infoCallback === "function") {
          conf.params.infoCallback(v, e);
        }
      }
    });

    verto.subscribe(conf.params.laData.chatChannel, {
      handler: function (v, e) {
        if (typeof conf.params.chatCallback === "function") {
          conf.params.chatCallback(v, e);
        }
      }
    });
  }
  static confMan(vertoRef, params) {
    var confMan = this;

    confMan.params = Object.assign({
      tableID: null,
      statusID: null,
      mainModID: null,
      dialog: null,
      hasVid: false,
      laData: null,
      onBroadcast: null,
      onLaChange: null,
      onLaRow: null
    }, params);

    confMan.verto = vertoRef;
    confMan.serno = CONFMAN_SERNO++;
    confMan.canvasCount = confMan.params.laData.canvasCount;

    function genMainMod(jq) {
      var play_id = "play_" + confMan.serno;
      var stop_id = "stop_" + confMan.serno;
      var recording_id = "recording_" + confMan.serno;
      var snapshot_id = "snapshot_" + confMan.serno;
      var rec_stop_id = "recording_stop" + confMan.serno;
      var div_id = "confman_" + confMan.serno;

      var html = "<div id='" +
        div_id +
        "'><br>" +
        "<button class='ctlbtn' id='" +
        play_id +
        "'>Play</button>" +
        "<button class='ctlbtn' id='" +
        stop_id +
        "'>Stop</button>" +
        "<button class='ctlbtn' id='" +
        recording_id +
        "'>Record</button>" +
        "<button class='ctlbtn' id='" +
        rec_stop_id +
        "'>Record Stop</button>" +
        (confMan.params.hasVid
          ? "<button class='ctlbtn' id='" +
          snapshot_id +
          "'>PNG Snapshot</button>"
          : "") +
        "<br><br></div>";

      jq.html(html);

      vertoRef.modfuncs.change_video_layout = function (id, canvas_id) {
        var val = document.querySelector("#" + id + " option:selected").textContent;
        if (val !== "none") {
          confMan.modCommand("vid-layout", null, [val, canvas_id]);
        }
      };

      if (confMan.params.hasVid) {
        for (var j = 0; j < confMan.canvasCount; j++) {
          var vlayout_id = "confman_vid_layout_" + j + "_" + confMan.serno;
          var vlselect_id = "confman_vl_select_" + j + "_" + confMan.serno;

          var vlhtml = "<div id='" +
            vlayout_id +
            "'><br>" +
            "<b>Video Layout Canvas " +
            (j + 1) +
            "</b> <select onChange='verto.modfuncs.change_video_layout(\"" +
            vlayout_id +
            '", "' +
            (j + 1) +
            "\")' id='" +
            vlselect_id +
            "'></select> " +
            "<br><br></div>";
          jq.append(vlhtml);
        }

        document.getElementById(snapshot_id).addEventListener("click", () => {
          var file = prompt("Please enter file name", "");
          if (file) {
            confMan.modCommand("vid-write-png", null, file);
          }
        });
      }

      document.getElementById(play_id).addEventListener("click", () => {
        var file = prompt("Please enter file name", "");
        if (file) {
          confMan.modCommand("play", null, file);
        }
      });

      document.getElementById(stop_id).addEventListener("click", () => {
        confMan.modCommand("stop", null, "all");
      });

      document.getElementById(recording_id).addEventListener("click", () => {
        var file = prompt("Please enter file name", "");
        if (file) {
          confMan.modCommand("recording", null, ["start", file]);
        }
      });

      document.getElementById(rec_stop_id).addEventListener("click", () => {
        confMan.modCommand("recording", null, ["stop", "all"]);
      });
    }

    function genControls(jq, rowid) {
      var x = parseInt(rowid);
      var kick_id = "kick_" + x;
      var canvas_in_next_id = "canvas_in_next_" + x;
      var canvas_in_prev_id = "canvas_in_prev_" + x;
      var canvas_out_next_id = "canvas_out_next_" + x;
      var canvas_out_prev_id = "canvas_out_prev_" + x;

      var canvas_in_set_id = "canvas_in_set_" + x;
      var canvas_out_set_id = "canvas_out_set_" + x;

      var layer_set_id = "layer_set_" + x;
      var layer_next_id = "layer_next_" + x;
      var layer_prev_id = "layer_prev_" + x;

      var tmute_id = "tmute_" + x;
      var tvmute_id = "tvmute_" + x;
      var vbanner_id = "vbanner_" + x;
      var tvpresenter_id = "tvpresenter_" + x;
      var tvfloor_id = "tvfloor_" + x;
      var box_id = "box_" + x;
      var gainup_id = "gain_in_up" + x;
      var gaindn_id = "gain_in_dn" + x;
      var volup_id = "vol_in_up" + x;
      var voldn_id = "vol_in_dn" + x;
      var transfer_id = "transfer" + x;

      var html = "<div id='" + box_id + "'>";

      html += "<b>General Controls</b><hr noshade>";

      html +=
        "<button class='ctlbtn' id='" +
        kick_id +
        "'>Kick</button>" +
        "<button class='ctlbtn' id='" +
        tmute_id +
        "'>Mute</button>" +
        "<button class='ctlbtn' id='" +
        gainup_id +
        "'>Gain -</button>" +
        "<button class='ctlbtn' id='" +
        gaindn_id +
        "'>Gain +</button>" +
        "<button class='ctlbtn' id='" +
        voldn_id +
        "'>Vol -</button>" +
        "<button class='ctlbtn' id='" +
        volup_id +
        "'>Vol +</button>" +
        "<button class='ctlbtn' id='" +
        transfer_id +
        "'>Transfer</button>";

      if (confMan.params.hasVid) {
        html += "<br><br><b>Video Controls</b><hr noshade>";

        html +=
          "<button class='ctlbtn' id='" +
          tvmute_id +
          "'>VMute</button>" +
          "<button class='ctlbtn' id='" +
          tvpresenter_id +
          "'>Presenter</button>" +
          "<button class='ctlbtn' id='" +
          tvfloor_id +
          "'>Vid Floor</button>" +
          "<button class='ctlbtn' id='" +
          vbanner_id +
          "'>Banner</button>";

        if (confMan.canvasCount > 1) {
          html +=
            "<br><br><b>Canvas Controls</b><hr noshade>" +
            "<button class='ctlbtn' id='" +
            canvas_in_set_id +
            "'>Set Input Canvas</button>" +
            "<button class='ctlbtn' id='" +
            canvas_in_prev_id +
            "'>Prev Input Canvas</button>" +
            "<button class='ctlbtn' id='" +
            canvas_in_next_id +
            "'>Next Input Canvas</button>" +
            "<br>" +
            "<button class='ctlbtn' id='" +
            canvas_out_set_id +
            "'>Set Watching Canvas</button>" +
            "<button class='ctlbtn' id='" +
            canvas_out_prev_id +
            "'>Prev Watching Canvas</button>" +
            "<button class='ctlbtn' id='" +
            canvas_out_next_id +
            "'>Next Watching Canvas</button>";
        }

        html +=
          "<br>" +
          "<button class='ctlbtn' id='" +
          layer_set_id +
          "'>Set Layer</button>" +
          "<button class='ctlbtn' id='" +
          layer_prev_id +
          "'>Prev Layer</button>" +
          "<button class='ctlbtn' id='" +
          layer_next_id +
          "'>Next Layer</button>" +
          "</div>";
      }

      jq.html(html);

      if (!jq.data("mouse")) {
        document.getElementById(box_id).style.display = 'none';
      }

      jq.mouseover(function (e) {
        jq.data({ mouse: true });
        document.getElementById(box_id).style.display = 'block';
      });

      jq.mouseout(function (e) {
        jq.data({ mouse: false });
        document.getElementById(box_id).style.display = 'none';
      });


      document.getElementById(transfer_id).addEventListener("click", () => {
        var xten = prompt("Enter Extension");
        if (xten) {
          confMan.modCommand("transfer", x, xten);
        }
      });

      document.getElementById(kick_id).addEventListener("click", () => {
        confMan.modCommand("kick", x);
      });

      document.getElementById(layer_set_id).addEventListener("click", () => {
        var cid = prompt("Please enter layer ID", "");
        if (cid) {
          confMan.modCommand("vid-layer", x, cid);
        }
      });

      document.getElementById(layer_next_id).addEventListener("click", () => {
        confMan.modCommand("vid-layer", x, "next");
      });

      document.getElementById(layer_prev_id).addEventListener("click", () => {
        confMan.modCommand("vid-layer", x, "prev");
      });

      document.getElementById(canvas_in_set_id).addEventListener("click", () => {
        var cid = prompt("Please enter canvas ID", "");
        if (cid) {
          confMan.modCommand("vid-canvas", x, cid);
        }
      });

      document.getElementById(canvas_out_set_id).addEventListener("click", () => {
        var cid = prompt("Please enter canvas ID", "");
        if (cid) {
          confMan.modCommand("vid-watching-canvas", x, cid);
        }
      });

      document.getElementById(canvas_in_next_id).addEventListener("click", () => {
        confMan.modCommand("vid-canvas", x, "next");
      });

      document.getElementById(canvas_in_prev_id).addEventListener("click", () => {
        confMan.modCommand("vid-canvas", x, "prev");
      });

      document.getElementById(canvas_out_next_id).addEventListener("click", () => {
        confMan.modCommand("vid-watching-canvas", x, "next");
      });

      document.getElementById(canvas_out_prev_id).addEventListener("click", () => {
        confMan.modCommand("vid-watching-canvas", x, "prev");
      });

      document.getElementById(tmute_id).addEventListener("click", () => {
        confMan.modCommand("tmute", x);
      });

      if (confMan.params.hasVid) {
        document.getElementById(tvmute_id).addEventListener("click", () => {
          confMan.modCommand("tvmute", x);
        });

        document.getElementById(tvpresenter_id).addEventListener("click", () => {
          confMan.modCommand("vid-res-id", x, "presenter");
        });

        document.getElementById(tvfloor_id).addEventListener("click", () => {
          confMan.modCommand("vid-floor", x, "force");
        });

        document.getElementById(vbanner_id).addEventListener("click", () => {
          var text = prompt("Please enter text", "");
          if (text) {
            confMan.modCommand("vid-banner", x, escape(text));
          }
        });
      }

      document.getElementById(gainup_id).addEventListener("click", () => {
        confMan.modCommand("volume_in", x, "up");
      });

      document.getElementById(gaindn_id).addEventListener("click", () => {
        confMan.modCommand("volume_in", x, "down");
      });

      document.getElementById(volup_id).addEventListener("click", () => {
        confMan.modCommand("volume_out", x, "up");
      });

      document.getElementById(voldn_id).addEventListener("click", () => {
        confMan.modCommand("volume_out", x, "down");
      });

      return html;
    }

    var atitle = "";
    var awidth = 0;

    vertoRef.subscribe(confMan.params.laData.infoChannel, {
      handler: function (v, e) {
        if (typeof confMan.params.infoCallback === "function") {
          confMan.params.infoCallback(v, e);
        }
      }
    });

    vertoRef.subscribe(confMan.params.laData.chatChannel, {
      handler: function (v, e) {
        if (typeof confMan.params.chatCallback === "function") {
          confMan.params.chatCallback(v, e);
        }
      }
    });

    if (confMan.params.laData.role === "moderator") {
      atitle = "Action";
      awidth = 600;

      if (confMan.params.mainModID) {
        genMainMod(document.getElementById(confMan.params.mainModID));
        document.getElementById(confMan.params.displayID).innerHTML = "Moderator Controls Ready<br><br>";

      } else {
        document.getElementById(confMan.params.displayID).innerHTML = "";
      }

      vertoRef.subscribe(confMan.params.laData.modChannel, {
        handler: function (v, e) {
          //console.error("MODDATA:", e.data);
          if (confMan.params.onBroadcast) {
            confMan.params.onBroadcast(vertoRef, confMan, e.data);
          }

          if (e.data["conf-command"] === "list-videoLayouts") {
            for (var j = 0; j < confMan.canvasCount; j++) {
              var vlselect_id = "#confman_vl_select_" + j + "_" + confMan.serno;
              var vlayout_id = "#confman_vid_layout_" + j + "_" + confMan.serno;

              var x = 0;
              var options;

              // $(vlselect_id).selectmenu({});
              // $(vlselect_id).selectmenu("enable");
              // $(vlselect_id).empty();

              document.getElementById(vlselect_id).innerHTML += new Option("Choose a Layout", "none");

              if (e.data.responseData) {
                var rdata = [];

                for (var i in e.data.responseData) {
                  rdata.push(e.data.responseData[i].name);
                }

                options = rdata.sort(function (a, b) {
                  var ga = a.substring(0, 6) == "group:" ? true : false;
                  var gb = b.substring(0, 6) == "group:" ? true : false;

                  if ((ga || gb) && ga != gb) {
                    return ga ? -1 : 1;
                  }

                  return a == b ? 0 : a > b ? 1 : -1;
                });

                for (var i in options) {
                  document.getElementById(vlselect_id).innerHTML += new Option(options[i], options[i]);
                  x++;
                }
              }

              if (x) {
                // $(vlselect_id).selectmenu("refresh", true);
              } else {
                document.getElementById(vlayout_id).style.display = "none";
              }
            }
          } else {
            if (!confMan.destroyed && confMan.params.displayID) {
              document.getElementById(confMan.params.displayID).innerHTML = `${e.data.response}<br><br>`;
              if (confMan.lastTimeout) {
                clearTimeout(confMan.lastTimeout);
                confMan.lastTimeout = 0;
              }
              confMan.lastTimeout = setTimeout(function () {
                document.getElementById(confMan.params.displayID).innerHTML = confMan.destroyed ? "" : "Moderator Controls Ready<br><br>";
              }, 4000);
            }
          }
        }
      });

      if (confMan.params.hasVid) {
        confMan.modCommand("list-videoLayouts", null, null);
      }
    }

    var row_callback = null;

    if (confMan.params.laData.role === "moderator") {
      row_callback = function (nRow, aData, iDisplayIndex, iDisplayIndexFull) {
        if (!aData[5]) {
          var $row = document.querySelector("td:eq(5)", nRow);
          genControls($row, aData);

          if (confMan.params.onLaRow) {
            confMan.params.onLaRow(vertoRef, confMan, $row, aData);
          }
        }
      };
    }

    confMan.lt = new verto.liveTable(
      vertoRef,
      confMan.params.laData.laChannel,
      confMan.params.laData.laName,
      document.getElementById(confMan.params.tableID),
      {
        subParams: {
          callID: confMan.params.dialog ? confMan.params.dialog.callID : null
        },

        onChange: function (obj, args) {
          document.getElementById(confMan.params.statusID).innerText = `Conference Members ( ${obj.arrayLen()} Total )`;
          if (confMan.params.onLaChange) {
            confMan.params.onLaChange(
              vertoRef,
              confMan,
              Verto.enum.confEvent.laChange,
              obj,
              args
            );
          }
        },

        aaData: [],
        aoColumns: [
          {
            sTitle: "ID",
            sWidth: "50"
          },
          {
            sTitle: "Number",
            sWidth: "250"
          },
          {
            sTitle: "Name",
            sWidth: "250"
          },
          {
            sTitle: "Codec",
            sWidth: "100"
          },
          {
            sTitle: "Status",
            sWidth: confMan.params.hasVid ? "200px" : "150px"
          },
          {
            sTitle: atitle,
            sWidth: awidth
          }
        ],
        bAutoWidth: true,
        bDestroy: true,
        bSort: false,
        bInfo: false,
        bFilter: false,
        bLengthChange: false,
        bPaginate: false,
        iDisplayLength: 1400,

        oLanguage: {
          sEmptyTable: "The Conference is Empty....."
        },

        fnRowCallback: row_callback
      }
    );
  }

  static refreshDevices(runtime) {
    checkDevices(runtime);
  }
  static init(obj, runtime) {
    if (!obj) {
      obj = {};
    }

    if (!obj.skipPermCheck && !obj.skipDeviceCheck) {
      FSRTC.checkPerms(
        function (status) {
          checkDevices(runtime);
        },
        true,
        true
      );
    } else if (obj.skipPermCheck && !obj.skipDeviceCheck) {
      checkDevices(runtime);
    } else if (!obj.skipPermCheck && obj.skipDeviceCheck) {
      FSRTC.checkPerms(
        function (status) {
          runtime(status);
        },
        true,
        true
      );
    } else {
      runtime(null);
    }
  }
}

export default Verto

function drop_bad(verto, channel) {
  console.error("drop unauthorized channel: " + channel);
  delete verto.eventSUBS[channel];
}

function mark_ready(verto, channel) {
  for (var j in verto.eventSUBS[channel]) {
    verto.eventSUBS[channel][j].ready = true;
    console.log("subscribed to channel: " + channel);
    if (verto.eventSUBS[channel][j].readyHandler) {
      verto.eventSUBS[channel][j].readyHandler(verto, channel);
    }
  }
}

var SERNO = 1;

function do_subscribe(verto, channel, subChannels, sparams) {
  var params = sparams || {};

  var local = params.local;

  var obj = {
    eventChannel: channel,
    userData: params.userData,
    handler: params.handler,
    ready: false,
    readyHandler: params.readyHandler,
    serno: SERNO++
  };

  var isnew = false;

  if (!verto.eventSUBS[channel]) {
    verto.eventSUBS[channel] = [];
    subChannels.push(channel);
    isnew = true;
  }

  verto.eventSUBS[channel].push(obj);

  if (local) {
    obj.ready = true;
    obj.local = true;
  }

  if (!isnew && verto.eventSUBS[channel][0].ready) {
    obj.ready = true;
    if (obj.readyHandler) {
      obj.readyHandler(verto, channel);
    }
  }

  return {
    serno: obj.serno,
    eventChannel: channel
  };
}

var del_array = function (array, name) {
  var r = [];
  var len = array.length;

  for (var i = 0; i < len; i++) {
    if (array[i] != name) {
      r.push(array[i]);
    }
  }

  return r;
};

var hashArray = function () {
  var vha = this;

  var hash = {};
  var array = [];

  vha.reorder = function (a) {
    array = a;
    var h = hash;
    hash = {};

    var len = array.length;

    for (var i = 0; i < len; i++) {
      var key = array[i];
      if (h[key]) {
        hash[key] = h[key];
        delete h[key];
      }
    }
    h = undefined;
  };

  vha.clear = function () {
    hash = undefined;
    array = undefined;
    hash = {};
    array = [];
  };

  vha.add = function (name, val, insertAt) {
    var redraw = false;

    if (!hash[name]) {
      if (
        insertAt === undefined ||
        insertAt < 0 ||
        insertAt >= array.length
      ) {
        array.push(name);
      } else {
        var x = 0;
        var n = [];
        var len = array.length;

        for (var i = 0; i < len; i++) {
          if (x++ == insertAt) {
            n.push(name);
          }
          n.push(array[i]);
        }

        array = undefined;
        array = n;
        n = undefined;
        redraw = true;
      }
    }

    hash[name] = val;

    return redraw;
  };

  vha.del = function (name) {
    var r = false;

    if (hash[name]) {
      array = del_array(array, name);
      delete hash[name];
      r = true;
    } else {
      console.error("can't del nonexistant key " + name);
    }

    return r;
  };

  vha.get = function (name) {
    return hash[name];
  };

  vha.order = function () {
    return array;
  };

  vha.hash = function () {
    return hash;
  };

  vha.indexOf = function (name) {
    var len = array.length;

    for (var i = 0; i < len; i++) {
      if (array[i] == name) {
        return i;
      }
    }
  };

  vha.arrayLen = function () {
    return array.length;
  };

  vha.asArray = function () {
    var r = [];

    var len = array.length;

    for (var i = 0; i < len; i++) {
      var key = array[i];
      r.push(hash[key]);
    }

    return r;
  };

  vha.each = function (cb) {
    var len = array.length;

    for (var i = 0; i < len; i++) {
      cb(array[i], hash[array[i]]);
    }
  };

  vha.dump = function (html) {
    var str = "";

    vha.each(function (name, val) {
      str +=
        "name: " +
        name +
        " val: " +
        JSON.stringify(val) +
        (html ? "<br>" : "\n");
    });

    return str;
  };
};

var CONFMAN_SERNO = 1;

Verto.conf.modCommand = function (cmd, id, value) {
  var conf = this;

  conf.verto.rpcClient.call("verto.broadcast", {
    eventChannel: conf.params.laData.modChannel,
    data: {
      application: "conf-control",
      command: cmd,
      id: id,
      value: value
    }
  });
};

Verto.conf.destroy = function () {
  var conf = this;

  conf.destroyed = true;
  conf.params.onBroadcast(conf.verto, conf, "destroy");

  if (conf.params.laData.modChannel) {
    conf.verto.unsubscribe(conf.params.laData.modChannel);
  }

  if (conf.params.laData.chatChannel) {
    conf.verto.unsubscribe(conf.params.laData.chatChannel);
  }

  if (conf.params.laData.infoChannel) {
    conf.verto.unsubscribe(conf.params.laData.infoChannel);
  }
};


function createMainModeratorMethods() {
  Verto.conf.listVideoLayouts = function () {
    this.modCommand("list-videoLayouts", null, null);
  };

  Verto.conf.play = function (file) {
    this.modCommand("play", null, file);
  };

  Verto.conf.stop = function () {
    this.modCommand("stop", null, "all");
  };

  Verto.conf.deaf = function (memberID) {
    this.modCommand("deaf", parseInt(memberID));
  };

  Verto.conf.undeaf = function (memberID) {
    this.modCommand("undeaf", parseInt(memberID));
  };

  Verto.conf.record = function (file) {
    this.modCommand("recording", null, ["start", file]);
  };

  Verto.conf.stopRecord = function () {
    this.modCommand("recording", null, ["stop", "all"]);
  };

  Verto.conf.snapshot = function (file) {
    if (!this.params.hasVid) {
      throw "Conference has no video";
    }
    this.modCommand("vid-write-png", null, file);
  };

  Verto.conf.setVideoLayout = function (layout, canvasID) {
    if (!this.params.hasVid) {
      throw "Conference has no video";
    }
    if (canvasID) {
      this.modCommand("vid-layout", null, [layout, canvasID]);
    } else {
      this.modCommand("vid-layout", null, layout);
    }
  };

  Verto.conf.kick = function (memberID) {
    this.modCommand("kick", parseInt(memberID));
  };

  Verto.conf.muteMic = function (memberID) {
    this.modCommand("tmute", parseInt(memberID));
  };

  Verto.conf.muteVideo = function (memberID) {
    if (!this.params.hasVid) {
      throw "Conference has no video";
    }
    this.modCommand("tvmute", parseInt(memberID));
  };

  Verto.conf.presenter = function (memberID) {
    if (!this.params.hasVid) {
      throw "Conference has no video";
    }
    this.modCommand("vid-res-id", parseInt(memberID), "presenter");
  };

  Verto.conf.videoFloor = function (memberID) {
    if (!this.params.hasVid) {
      throw "Conference has no video";
    }
    this.modCommand("vid-floor", parseInt(memberID), "force");
  };

  Verto.conf.banner = function (memberID, text) {
    if (!this.params.hasVid) {
      throw "Conference has no video";
    }
    this.modCommand("vid-banner", parseInt(memberID), escape(text));
  };

  Verto.conf.volumeDown = function (memberID) {
    this.modCommand("volume_out", parseInt(memberID), "down");
  };

  Verto.conf.volumeUp = function (memberID) {
    this.modCommand("volume_out", parseInt(memberID), "up");
  };

  Verto.conf.gainDown = function (memberID) {
    this.modCommand("volume_in", parseInt(memberID), "down");
  };

  Verto.conf.gainUp = function (memberID) {
    this.modCommand("volume_in", parseInt(memberID), "up");
  };

  Verto.conf.transfer = function (memberID, exten) {
    this.modCommand("transfer", parseInt(memberID), exten);
  };

  Verto.conf.sendChat = function (message, type) {
    var conf = this;
    conf.verto.rpcClient.call("verto.broadcast", {
      eventChannel: conf.params.laData.chatChannel,
      data: {
        action: "send",
        message: message,
        type: type
      }
    });
  };
}

Verto.modfuncs = {};

Verto.confMan.modCommand = function (cmd, id, value) {
  var confMan = this;

  confMan.verto.rpcClient.call("verto.broadcast", {
    eventChannel: confMan.params.laData.modChannel,
    data: {
      application: "conf-control",
      command: cmd,
      id: id,
      value: value
    }
  });
};

Verto.confMan.sendChat = function (message, type) {
  var confMan = this;
  confMan.verto.rpcClient.call("verto.broadcast", {
    eventChannel: confMan.params.laData.chatChannel,
    data: {
      action: "send",
      message: message,
      type: type
    }
  });
};

Verto.confMan.destroy = function () {
  var confMan = this;

  confMan.destroyed = true;

  if (confMan.lt) {
    confMan.lt.destroy();
  }

  if (confMan.params.laData.chatChannel) {
    confMan.verto.unsubscribe(confMan.params.laData.chatChannel);
  }

  if (confMan.params.laData.modChannel) {
    confMan.verto.unsubscribe(confMan.params.laData.modChannel);
  }

  if (confMan.params.mainModID) {
    document.getElementById(confMan.params.mainModID).innerHTML = "";
  }
};


// Attach audio output device to video element using device/sink ID.
function find_name(id) {
  for (var i in Verto.audioOutDevices) {
    var source = Verto.audioOutDevices[i];
    if (source.id === id) {
      return source.label;
    }
  }

  return id;
}

Verto.saved = [];

Verto.unloadJobs = [];

var unloadEventName = "beforeunload";
// Hacks for Mobile Safari
var iOS = ["iPad", "iPhone", "iPod"].indexOf(navigator.platform) >= 0;
if (iOS) {
  unloadEventName = "pagehide";
}

window[unloadEventName] = () => {
  for (var f in verto.unloadJobs) {
    verto.unloadJobs[f]();
  }

  if (verto.haltClosure) return verto.haltClosure();

  for (var i in verto.saved) {
    var verto = verto.saved[i];
    if (verto) {
      verto.purge();
      verto.logout();
    }
  }

  return verto.warnOnUnload;
}

Verto.videoDevices = [];
Verto.audioInDevices = [];
Verto.audioOutDevices = [];

var checkDevices = function (runtime) {
  console.info("enumerating devices");
  var aud_in = [],
    aud_out = [],
    vid = [];
  var has_video = 0,
    has_audio = 0;
  var Xstream;

  function gotDevices(deviceInfos) {
    // Handles being called several times to update labels. Preserve values.
    for (var i = 0; i !== deviceInfos.length; ++i) {
      var deviceInfo = deviceInfos[i];
      var text = "";

      console.log(deviceInfo);
      console.log(
        deviceInfo.kind +
        ": " +
        deviceInfo.label +
        " id = " +
        deviceInfo.deviceId
      );

      if (deviceInfo.kind === "audioinput") {
        text = deviceInfo.label || "microphone " + (aud_in.length + 1);
        aud_in.push({
          id: deviceInfo.deviceId,
          kind: "audio_in",
          label: text
        });
      } else if (deviceInfo.kind === "audiooutput") {
        text = deviceInfo.label || "speaker " + (aud_out.length + 1);
        aud_out.push({
          id: deviceInfo.deviceId,
          kind: "audio_out",
          label: text
        });
      } else if (deviceInfo.kind === "videoinput") {
        text = deviceInfo.label || "camera " + (vid.length + 1);
        vid.push({ id: deviceInfo.deviceId, kind: "video", label: text });
      } else {
        console.log("Some other kind of source/device: ", deviceInfo);
      }
    }

    Verto.videoDevices = vid;
    Verto.audioInDevices = aud_in;
    Verto.audioOutDevices = aud_out;

    console.info("Audio IN Devices", Verto.audioInDevices);
    console.info("Audio Out Devices", Verto.audioOutDevices);
    console.info("Video Devices", Verto.videoDevices);

    if (Xstream) {
      Xstream.getTracks().forEach(function (track) {
        track.stop();
      });
    }

    if (runtime) {
      runtime(true);
    }
  }

  function handleError(error) {
    console.log("device enumeration error: ", error);
    if (runtime) runtime(false);
  }

  function checkTypes(devs) {
    for (var i = 0; i !== devs.length; ++i) {
      if (devs[i].kind === "audioinput") {
        has_audio++;
      } else if (devs[i].kind === "videoinput") {
        has_video++;
      }
    }
    navigator.mediaDevices
      .getUserMedia({
        audio: has_audio > 0 ? true : false,
        video: has_video > 0 ? true : false
      })
      .then(function (stream) {
        Xstream = stream;
        navigator.mediaDevices
          .enumerateDevices()
          .then(gotDevices)
          .catch(handleError);
      })
      .catch(function (err) {
        console.log("The following error occurred: " + err.name);
      });
  }

  navigator.mediaDevices
    .enumerateDevices()
    .then(checkTypes)
    .catch(handleError);
};