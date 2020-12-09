import findLineInRange from './find-line-in-range'

// Find the line in sdpLines that starts with |prefix|, and, if specified,
// contains |substr| (case-insensitive search).
function findLine(sdpLines, prefix, substr) {
    return findLineInRange(sdpLines, 0, -1, prefix, substr);
}

export default findLine