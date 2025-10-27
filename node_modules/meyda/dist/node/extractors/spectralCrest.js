'use strict';

function spectralCrest (_a) {
    var ampSpectrum = _a.ampSpectrum;
    if (typeof ampSpectrum !== "object") {
        throw new TypeError();
    }
    var rms = 0;
    var peak = -Infinity;
    ampSpectrum.forEach(function (x) {
        rms += Math.pow(x, 2);
        peak = x > peak ? x : peak;
    });
    rms = rms / ampSpectrum.length;
    rms = Math.sqrt(rms);
    return peak / rms;
}

module.exports = spectralCrest;
