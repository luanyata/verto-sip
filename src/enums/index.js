function EnumFn(s) {
  var i = 0,
    o = {};
  s.split(" ").map((x) => {
    o[x] = {
      name: x,
      val: i++
    };
  });
  return Object.freeze(o);
}

export const STATE = EnumFn('new requesting trying recovering ringing answering early active held hangup destroy purge') 

export const DIRECTION = EnumFn('inbound outbound');

export const MESSAGE = EnumFn("display info pvtEvent clientReady") 

export const STATES = Object.freeze({
  new: {
    requesting: 1,
    recovering: 1,
    ringing: 1,
    destroy: 1,
    answering: 1,
    hangup: 1
  },
  requesting: {
    trying: 1,
    hangup: 1,
    active: 1
  },
  recovering: {
    answering: 1,
    hangup: 1
  },
  trying: {
    active: 1,
    early: 1,
    hangup: 1
  },
  ringing: {
    answering: 1,
    hangup: 1
  },
  answering: {
    active: 1,
    hangup: 1
  },
  active: {
    answering: 1,
    requesting: 1,
    hangup: 1,
    held: 1
  },
  held: {
    hangup: 1,
    active: 1
  },
  early: {
    hangup: 1,
    active: 1
  },
  hangup: {
    destroy: 1
  },
  destroy: {},
  purge: {
    destroy: 1
  }
});