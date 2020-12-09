// Find the line in sdpLines[startLine...endLine - 1] that starts with |prefix|
// and, if specified, contains |substr| (case-insensitive search).


function findLineInRange(sdpLines, startLine, endLine, prefix, substr) {
    var realEndLine = endLine != -1 ? endLine : sdpLines.length;
    for (var i = startLine; i < realEndLine; ++i) {
        if (sdpLines[i].indexOf(prefix) === 0) {
            if (
                !substr ||
                sdpLines[i].toLowerCase().indexOf(substr.toLowerCase()) !== -1
            ) {
                return i;
            }
        }
    }
    return null;
}

export default findLineInRange