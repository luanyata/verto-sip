
// Gets the codec payload type from an a=rtpmap:X line.
function getCodecPayloadType(sdpLine) {
    var pattern = new RegExp("a=rtpmap:(\\d+) \\w+\\/\\d+");
    var result = sdpLine.match(pattern);
    return result && result.length == 2 ? result[1] : null;
}