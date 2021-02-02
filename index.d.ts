declare module 'verto' {
  type StateCall =
    | 'answering'
    | 'active'
    | 'destroy'
    | 'early'
    | 'hangup'
    | 'held'
    | 'inbound'
    | 'recovering'
    | 'ringing'
    | 'trying';

  type MuteState = 'on' | 'off' | 'toggle';

  export type Direction = 'inbound' | 'outbound'



  /**
   * @param login
   * @param passwd
   */
  interface VertoParams {
    login: string;
    passwd: string;
    socketUrl: string;
    wsFallbackURL?: string[];
    tag: string | Function;
    ringFile?: string;
    localTag?: string;
    iceServers: [{ url: string }] | boolean;
    deviceParams: {
      useMic: 'any' | 'none' | 'default';
      useSpeak: 'any' | 'none' | 'default';
      useCamera: 'any' | 'none' | 'default';
    };
    audioParams: {
      googEchoCancellation: boolean;
      googAutoGainControl: boolean;
      googNoiseSuppression: boolean;
      googHighpassFilter: boolean;
      googTypingNoiseDetection: boolean;
      googEchoCancellation2: boolean;
      googAutoGainControl2: boolean;
    };
  }

  interface VertoStatic {
    new(
      params: VertoParams,
      callbacks?: any,
    ): Agent;
    init(object: {}, callback: void): void;
    genUUID(): string;
    audioInDevices: [];
    audioOutDevices: [];
    videoInDevices: [];
    videoOutDevices: [];
  }

  export interface VideoParams {
    minWidth: number;
    minHeight: number;
    maxWidth: number;
    maxHeight: number;
    minFrameRate: number;
    vertoBestFrameRate: string;
  }

  export interface CallParams {
    outgoingBandwidth: string;
    incomingBandwidth: string;
    useStereo: boolean;
    useVideo: boolean;
    useCamera: boolean;
    useSpeak: string;
    screenShare: boolean;
    dedEnc: boolean;
    mirrorInput: boolean;
  }

  interface NewCallParams extends CallParams {
    destination_number: string;
    caller_id_name: string;
    caller_id_number: string;
  }

  type AnswerCallParams = CallParams;

  interface Agent {
    rpcClient: {
      speedTest(bytesToSendAndReceive: number, callback: Function): void;
    };
    refreshDevices(callback?: Function): void;
    broadcast(channel: any, params: any): void;
    deviceParams(obj: any): void;
    handleMessage(params: any): void;
    hangup(callId?: string): void;
    iceServers(obj: any): void;
    login(): void;
    logout(): void;
    message(msg: { to: string; body: string }): boolean;
    newCall(params: NewCallParams): Dialog;
    processReply(method: string, sucess: boolean, e: any): void;
    purge(): void;
    sendMethod(method: string, obj: any): void;
    subscribe(channel: any, sparams: any): [];
    unsubscribe(handle: any): void;
    videoParams(params: VideoParams): void;
    genUUID(): string;
  }

  interface Dialog {
    direction: { name: Direction };
    callID: string;
    state: { name: StateCall };
    cause: string;
    params: {
      caller_id_number: number;
      remote_caller_id_name: string;
      remote_caller_id_number: string;
    };
    answer(params: AnswerCallParams): void;
    cidString(enc: any): void;
    dtmf(digit: string): void;
    getMute(): void;
    getVideoMute(): void;
    hangup({ causeCode, cause }?: { cause?: string; causeCode?: number }): void;
    handleAnswer(params: any): void;
    handleDisplay(params: any): void;
    handleInfo(params: any): void;
    handleMedia(params: any): void;
    hold(params?: any): void;
    indicateRing(): void;
    invite(): void;
    message(msg: string): boolean;
    processReply(method: string, success: string, e: string): void;
    replace(replaceCallID: any, params: any): void;
    ring(): void;
    rtt(obj: any): void;
    sendMessage(msg: string, params: any): void;
    sendMethod(method: any, obj: any): void;
    setAudioPlaybackDevice(sinkId: any, callback: any, arg: any): void;
    setMute(what: MuteState): void;
    setState(state: string): void;
    setVideoMute(what: MuteState): void;
    stopRinging(): void;
    transfer(dest: string, params: any): void;
    toggleHold(params: any): void;
    unhold(params?: any): void;
    useStereo(on: any): void;
    useVideo(on: any): void;
  }
}

declare const Verto: VertoStatic;
export default Verto;
