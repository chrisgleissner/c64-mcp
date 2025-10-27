'use strict';

function zcr (_a) {
    var signal = _a.signal;
    if (typeof signal !== "object") {
        throw new TypeError();
    }
    var zcr = 0;
    for (var i = 1; i < signal.length; i++) {
        if ((signal[i - 1] >= 0 && signal[i] < 0) ||
            (signal[i - 1] < 0 && signal[i] >= 0)) {
            zcr++;
        }
    }
    return zcr;
}

module.exports = zcr;
