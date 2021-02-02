import { FSRTC } from './FSRTC'
import { v4 as generateUUID } from 'uuid'
import { DIRECTION, MESSAGE, STATE, STATES } from './enums'

class Dialog {
  constructor(direction, vertoRef, params, audioOutDevices) {

    var dialog = this;

    dialog.params = Object.assign({
      useVideo: vertoRef.options.useVideo,
      useStereo: vertoRef.options.useStereo,
      screenShare: false,
      useCamera: false,
      useMic: vertoRef.options.deviceParams.useMic,
      useMicLabel: vertoRef.options.deviceParams.useMicLabel,
      useSpeak: vertoRef.options.deviceParams.useSpeak,
      tag: vertoRef.options.tag,
      localTag: vertoRef.options.localTag,
      login: vertoRef.options.login,
      videoParams: vertoRef.options.videoParams,
      useStream: vertoRef.options.useStream
    }, params);


    if (!dialog.params.screenShare) {
      dialog.params.useCamera = vertoRef.options.deviceParams.useCamera;
      dialog.params.useCameraLabel = vertoRef.options.deviceParams.useCameraLabel;
    }

    dialog.audioOutDevices = audioOutDevices
    dialog.verto = vertoRef;
    dialog.direction = direction;
    dialog.lastState = null;
    dialog.state = dialog.lastState = STATE.new;
    dialog.callbacks = vertoRef.callbacks;
    dialog.answered = false;
    dialog.attach = params.attach || false;
    dialog.screenShare = params.screenShare || false;
    dialog.useCamera = dialog.params.useCamera;
    dialog.useCameraLabel = dialog.params.useCameraLabel;
    dialog.useMic = dialog.params.useMic;
    dialog.useMicLabel = dialog.params.useMicLabel;
    dialog.useSpeak = dialog.params.useSpeak;

    if (dialog.params.callID) {
      dialog.callID = dialog.params.callID;
    } else {
      dialog.callID = dialog.params.callID = generateUUID();
    }

    if (typeof dialog.params.tag === "function") {
      dialog.params.tag = dialog.params.tag();
    }

    if (dialog.params.tag) {
      dialog.audioStream = document.getElementById(dialog.params.tag);

      if (dialog.params.useVideo) {
        dialog.videoStream = dialog.audioStream;
      }
    } //else conjure one TBD

    if (dialog.params.localTag) {
      dialog.localVideo = document.getElementById(dialog.params.localTag);
    }

    dialog.verto.dialogs[dialog.callID] = dialog;

    var RTCcallbacks = {};

    if (dialog.direction == DIRECTION.inbound) {
      if (dialog.params.display_direction === "outbound") {
        dialog.params.remote_caller_id_name = dialog.params.caller_id_name;
        dialog.params.remote_caller_id_number = dialog.params.caller_id_number;
      } else {
        dialog.params.remote_caller_id_name = dialog.params.callee_id_name;
        dialog.params.remote_caller_id_number = dialog.params.callee_id_number;
      }

      if (!dialog.params.remote_caller_id_name) {
        dialog.params.remote_caller_id_name = "Nobody";
      }

      if (!dialog.params.remote_caller_id_number) {
        dialog.params.remote_caller_id_number = "UNKNOWN";
      }

      RTCcallbacks.onMessage = function (rtc, msg) {
        console.debug(msg);
      };

      RTCcallbacks.onAnswerSDP = function (rtc, sdp) {
        console.error("answer sdp", sdp);
      };
    } else {
      dialog.params.remote_caller_id_name = "Outbound Call";
      dialog.params.remote_caller_id_number = dialog.params.destination_number;
    }

    RTCcallbacks.onICESDP = function (rtc) {

      console.log(`RECV ${rtc.type} SDP`, rtc.mediaData.SDP);

      if (dialog.state == STATE.requesting ||
        dialog.state == STATE.answering ||
        dialog.state == STATE.active) {
        location.reload();
        return;
      }

      if (rtc.type == "offer") {
        if (dialog.state == STATE.active) {
          dialog.setState(STATE.requesting);
          dialog.sendMethod("verto.attach", {
            sdp: rtc.mediaData.SDP
          });
        } else {
          dialog.setState(STATE.requesting);

          dialog.sendMethod("verto.invite", {
            sdp: rtc.mediaData.SDP
          });
        }
      } else {
        //answer
        dialog.setState(STATE.answering);

        dialog.sendMethod(dialog.attach ? "verto.attach" : "verto.answer", {
          sdp: dialog.rtc.mediaData.SDP
        });
      }
    };

    RTCcallbacks.onICE = function (rtc) {
      //console.log("cand", rtc.mediaData.candidate);
      if (rtc.type == "offer") {
        console.log("offer", rtc.mediaData.candidate);
        return;
      }
    };

    RTCcallbacks.onStream = function (rtc, stream) {
      if (dialog.callbacks.permissionCallback &&
        typeof dialog.callbacks.permissionCallback.onGranted === "function") {
        dialog.callbacks.permissionCallback.onGranted(stream);
      } else if (dialog.verto.options.permissionCallback &&
        typeof dialog.verto.options.permissionCallback.onGranted === "function") {
        dialog.verto.options.permissionCallback.onGranted(stream);
      }
      console.log("stream started");
    };

    RTCcallbacks.onRemoteStream = function (rtc, stream) {
      if (typeof dialog.callbacks.onRemoteStream === "function") {
        dialog.callbacks.onRemoteStream(stream, dialog);
      }
      console.log("remote stream started");
    };

    RTCcallbacks.onError = function (e) {
      if (dialog.callbacks.permissionCallback &&
        typeof dialog.callbacks.permissionCallback.onDenied === "function") {
        dialog.callbacks.permissionCallback.onDenied();
      } else if (dialog.verto.options.permissionCallback &&
        typeof dialog.verto.options.permissionCallback.onDenied === "function") {
        dialog.verto.options.permissionCallback.onDenied();
      }
      console.error("ERROR:", e);
      dialog.hangup({ causeCode: 501, cause: "Device or Permission Error" });
    };



    dialog.rtc = new FSRTC({
      callbacks: RTCcallbacks,
      localVideo: dialog.screenShare ? null : dialog.localVideo,
      useVideo: dialog.params.useVideo ? dialog.videoStream : null,
      useAudio: dialog.audioStream,
      useStereo: dialog.params.useStereo,
      videoParams: dialog.params.videoParams,
      audioParams: dialog.verto.options.audioParams,
      iceServers: dialog.verto.options.iceServers,
      screenShare: dialog.screenShare,
      useCamera: dialog.useCamera,
      useCameraLabel: dialog.useCameraLabel,
      useMic: dialog.useMic,
      useMicLabel: dialog.useMicLabel,
      useSpeak: dialog.useSpeak,
      turnServer: dialog.verto.options.turnServer,
      useStream: dialog.params.useStream
    });

    dialog.rtc.verto = dialog.verto;

    if (dialog.direction == DIRECTION.inbound) {
      if (dialog.attach) {
        dialog.answer();
      } else {
        dialog.ring();
      }
    }
  }

  invite() {
    var dialog = this;
    dialog.rtc.call();
  }

  sendMethod(method, obj) {
    var dialog = this;
    obj.dialogParams = {};

    for (var i in dialog.params) {
      if (i == "sdp" && method != "verto.invite" && method != "verto.attach") {
        continue;
      }

      if (obj.noDialogParams && i != "callID") {
        continue;
      }

      obj.dialogParams[i] = dialog.params[i];
    }

    delete obj.noDialogParams;

    dialog.verto.rpcClient.call(
      method,
      obj,

      function (e) {
        /* Success */
        dialog.processReply(method, true, e);
      },

      function (e) {
        /* Error */
        dialog.processReply(method, false, e);
      }
    );
  };

  setAudioPlaybackDevice(
    sinkId,
    callback,
    arg
  ) {
    var dialog = this;
    var element = dialog.audioStream;

    if (typeof element.sinkId !== "undefined") {
      var devname = this._findName(sinkId, dialog.audioOutDevices);
      console.info(
        `Dialog: ${dialog.callID} Setting speaker:`,
        element,
        devname
      );

      element
        .setSinkId(sinkId)
        .then(function () {
          console.log(
            `Dialog: ${dialog.callID} Success, audio output device attached: ${sinkId}`
          );
          if (callback) {
            callback(true, devname, arg);
          }
        })
        .catch(function (error) {
          var errorMessage = error;
          if (error.name === "SecurityError") {
            errorMessage = `Dialog: ${dialog.callID} You need to use HTTPS for selecting audio output device: ${error}`;
          }
          if (callback) {
            callback(false, null, arg);
          }
          console.error(errorMessage);
        });
    } else {
      console.warn(`Dialog: ${dialog.callID} Browser does not support output device selection.`);
      if (callback) {
        callback(false, null, arg);
      }
    }
  };

  setState(state) {
    var dialog = this;

    if (dialog.state == STATE.ringing) {
      dialog.stopRinging();
    }

    console.warn(dialog.state, state);

    if (dialog.state == state || !this._checkStateChange(dialog.state, state)) {
      console.error(`Dialog ${dialog.callID}: INVALID state change from ${dialog.state} to ${state}`);
      dialog.hangup();
      return false;
    }

    console.log(`Dialog ${dialog.callID}: state change from ${dialog.state.name} to ${state.name}`);

    dialog.lastState = dialog.state;
    dialog.state = state;

    if (dialog.callbacks.onDialogState) {
      dialog.callbacks.onDialogState(this);
    }

    switch (dialog.state) {
      case STATE.early:
      case STATE.active:
        var speaker = dialog.useSpeak;
        console.info("Using Speaker: ", speaker);

        if (speaker && speaker !== "any" && speaker !== "none") {
          setTimeout(function () {
            dialog.setAudioPlaybackDevice(speaker);
          }, 500);
        }

        break;

      case STATE.trying:
        setTimeout(function () {
          if (dialog.state == STATE.trying) {
            dialog.setState(STATE.hangup);
          }
        }, 30000);
        break;
      case STATE.purge:
        dialog.setState(STATE.destroy);
        break;
      case STATE.hangup:
        if (
          dialog.lastState.val > STATE.requesting.val &&
          dialog.lastState.val < STATE.hangup.val
        ) {
          dialog.sendMethod("verto.bye", {});
        }

        dialog.setState(STATE.destroy);
        break;
      case STATE.destroy:
        if (typeof dialog.verto.options.tag === "function") {
          document.getElementById(dialog.params.tag).remove();
        }

        delete dialog.verto.dialogs[dialog.callID];
        if (dialog.params.screenShare) {
          dialog.rtc.stopPeer();
        } else {
          dialog.rtc.stop();
        }
        break;
    }

    return true;
  };

  processReply(method, success, e) {
    var dialog = this;

    //console.log("Response: " + method + " State:" + dialog.state.name, success, e);

    switch (method) {
      case "verto.answer":
      case "verto.attach":
        if (success) {
          dialog.setState(STATE.active);
        } else {
          dialog.hangup();
        }
        break;
      case "verto.invite":
        if (success) {
          dialog.setState(STATE.trying);
        } else {
          dialog.setState(STATE.destroy);
        }
        break;

      case "verto.bye":
        dialog.hangup();
        break;

      case "verto.modify":
        if (e.holdState) {
          if (e.holdState == "held") {
            if (dialog.state != STATE.held) {
              dialog.setState(STATE.held);
            }
          } else if (e.holdState == "active") {
            if (dialog.state != STATE.active) {
              dialog.setState(STATE.active);
            }
          }
        }

        break;

      default:
        break;
    }
  };

  hangup(params) {
    var dialog = this;

    if (params) {
      if (params.causeCode) {
        dialog.causeCode = params.causeCode;
      }

      if (params.cause) {
        dialog.cause = params.cause;
      }
    }

    if (!dialog.cause && !dialog.causeCode) {
      dialog.cause = "NORMAL_CLEARING";
    }

    if (
      dialog.state.val >= STATE.new.val &&
      dialog.state.val < STATE.hangup.val
    ) {
      dialog.setState(STATE.hangup);
    } else if (dialog.state.val < STATE.destroy) {
      dialog.setState(STATE.destroy);
    }
  };

  stopRinging() {
    var dialog = this;
    if (dialog.verto.ringer) {
      dialog.verto.ringer.stop();
    }
  };

  indicateRing() {
    var dialog = this;

    if (dialog.verto.ringer) {
      dialog.verto.ringer.attr("src", dialog.verto.options.ringFile)[0].play();

      setTimeout(function () {
        dialog.stopRinging();
        if (dialog.state == STATE.ringing) {
          dialog.indicateRing();
        }
      }, dialog.verto.options.ringSleep);
    }
  };

  ring() {
    var dialog = this;

    dialog.setState(STATE.ringing);
    dialog.indicateRing();
  };

  useVideo(on) {
    var dialog = this;

    dialog.params.useVideo = on;

    if (on) {
      dialog.videoStream = dialog.audioStream;
    } else {
      dialog.videoStream = null;
    }

    dialog.rtc.useVideo(dialog.videoStream, dialog.localVideo);
  };

  setMute(what) {
    return this.rtc.setMute(what);
  };

  getMute() {
    return this.rtc.getMute();
  };

  setVideoMute(what) {
    return this.rtc.setVideoMute(what);
  };

  getVideoMute() {
    return this.rtc.getVideoMute();
  };

  useStereo(on) {
    dialog.params.useStereo = on;
    this.rtc.useStereo(on);
  };

  dtmf(digits) {

    if (digits) {
      this.sendMethod("verto.info", {
        dtmf: digits
      });
    }
  };

  rtt(obj) {
    var dialog = this;
    var pobj = {};

    if (!obj) {
      return false;
    }

    pobj.code = obj.code;
    pobj.chars = obj.chars;

    if (pobj.chars || pobj.code) {
      dialog.sendMethod("verto.info", {
        txt: obj,
        noDialogParams: true
      });
    }
  };

  transfer(dest, params) {
    var dialog = this;
    if (dest) {
      dialog.sendMethod("verto.modify", {
        action: "transfer",
        destination: dest,
        params: params
      });
    }
  };

  replace(replaceCallID, params) {
    var dialog = this;
    if (replaceCallID) {
      dialog.sendMethod("verto.modify", {
        action: "replace",
        replaceCallID: replaceCallID,
        params: params
      });
    }
  };

  hold(params) {
    var dialog = this;

    dialog.sendMethod("verto.modify", {
      action: "hold",
      params: params
    });
  };

  unhold(params) {
    var dialog = this;

    dialog.sendMethod("verto.modify", {
      action: "unhold",
      params: params
    });
  };

  toggleHold(params) {
    var dialog = this;

    dialog.sendMethod("verto.modify", {
      action: "toggleHold",
      params: params
    });
  };

  message(msg) {
    var dialog = this;
    var err = 0;

    msg.from = dialog.params.login;

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

    dialog.sendMethod("verto.info", {
      msg: msg
    });

    return true;
  };

  answer(params) {
    var dialog = this;

    if (!dialog.answered) {
      if (!params) {
        params = {};
      }

      params.sdp = dialog.params.sdp;

      if (params) {
        if (params.useVideo) {
          dialog.useVideo(true);
        }
        dialog.params.callee_id_name = params.callee_id_name;
        dialog.params.callee_id_number = params.callee_id_number;

        if (params.useCamera) {
          dialog.useCamera = params.useCamera;
          dialog.useCameraLabel = params.useCameraLabel;
        }

        if (params.useMic) {
          dialog.useMic = params.useMic;
          dialog.useMic = params.useMicLabel;
        }

        if (params.useSpeak) {
          dialog.useSpeak = params.useSpeak;
        }
      }

      dialog.rtc.createAnswer(params);
      dialog.answered = true;
    }
  };

  handleAnswer(params) {
    var dialog = this;

    dialog.gotAnswer = true;

    if (dialog.state.val >= STATE.active.val) {
      return;
    }

    if (dialog.state.val >= STATE.early.val) {
      dialog.setState(STATE.active);
    } else {
      if (dialog.gotEarly) {
        console.log(`Dialog ${dialog.callID} Got answer while still establishing early media, delaying...`);
      } else {
        console.log(`Dialog ${dialog.callID} Answering Channel`);
        dialog.rtc.answer(
          params.sdp,
          function () {
            dialog.setState(STATE.active);
          },
          function (e) {
            console.error(e);
            dialog.hangup();
          }
        );
        console.log(`Dialog ${dialog.callID} ANSWER SDP`, params.sdp);
      }
    }
  };

  cidString(enc) {
    return `${this.params.remote_caller_id_name} ${enc ? " &lt;" : " <"} ${this.params.remote_caller_id_number} ${enc ? "&gt;" : ">"}`
  };

  sendMessage(msg, params) {
    var dialog = this;

    if (dialog.callbacks.onMessage) {
      dialog.callbacks.onMessage(dialog.verto, dialog, msg, params);
    }
  };

  handleInfo(params) {
    var dialog = this;

    dialog.sendMessage(MESSAGE.info, params);
  };

  handleDisplay(params) {
    var dialog = this;

    if (params.display_name) {
      dialog.params.remote_caller_id_name = params.display_name;
    }
    if (params.display_number) {
      dialog.params.remote_caller_id_number = params.display_number;
    }

    dialog.sendMessage(MESSAGE.display, {});
  };

  handleMedia(params) {
    var dialog = this;

    if (dialog.state.val >= STATE.early.val) {
      return;
    }

    dialog.gotEarly = true;

    dialog.rtc.answer(
      params.sdp,
      function () {
        console.log(`Dialog ${dialog.callID} Establishing early media`);
        dialog.setState(STATE.early);

        if (dialog.gotAnswer) {
          console.log(`Dialog ${dialog.callID} Answering Channel`);
          dialog.setState(STATE.active);
        }
      },
      function (e) {
        console.error(e);
        dialog.hangup();
      }
    );
    console.log(`Dialog ${dialog.callID} EARLY SDP`, params.sdp);
  };

  _checkStateChange(oldS, newS) {
    console.warn(oldS, newS);
    if (
      newS == STATE.purge ||
      STATES[oldS.name][newS.name]
    ) {
      return true;
    }

    return false;
  }

  // Attach audio output device to video element using device/sink ID.
  _findName(id, audioOutDevices) {

    for (var i in audioOutDevices) {
      var source = audioOutDevices[i];
      if (source.id === id) {
        return source.label;
      }
    }

    return id;
  }

}

export default Dialog
