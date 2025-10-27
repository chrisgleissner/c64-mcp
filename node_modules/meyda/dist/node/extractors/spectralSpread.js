'use strict';

function mu(i, amplitudeSpect) {
    var numerator = 0;
    var denominator = 0;
    for (var k = 0; k < amplitudeSpect.length; k++) {
        numerator += Math.pow(k, i) * Math.abs(amplitudeSpect[k]);
        denominator += amplitudeSpect[k];
    }
    return numerator / denominator;
}

function spectralSpread (_a) {
    var ampSpectrum = _a.ampSpectrum;
    if (typeof ampSpectrum !== "object") {
        throw new TypeError();
    }
    return Math.sqrt(mu(2, ampSpectrum) - Math.pow(mu(1, ampSpectrum), 2));
}

module.exports = spectralSpread;
