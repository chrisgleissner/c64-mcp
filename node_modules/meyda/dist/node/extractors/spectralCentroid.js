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

function spectralCentroid (_a) {
    var ampSpectrum = _a.ampSpectrum;
    if (typeof ampSpectrum !== "object") {
        throw new TypeError();
    }
    return mu(1, ampSpectrum);
}

module.exports = spectralCentroid;
