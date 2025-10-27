// This file isn't being typechecked at all because there are major issues with it.
// See #852 for details. Once that's merged, this file should be typechecked.
// @ts-nocheck
export default function (_a) {
    var signal = _a.signal, previousSignal = _a.previousSignal, bufferSize = _a.bufferSize;
    if (typeof signal !== "object" || typeof previousSignal != "object") {
        throw new TypeError();
    }
    var sf = 0;
    for (var i = -(bufferSize / 2); i < signal.length / 2 - 1; i++) {
        x = Math.abs(signal[i]) - Math.abs(previousSignal[i]);
        sf += (x + Math.abs(x)) / 2;
    }
    return sf;
}
