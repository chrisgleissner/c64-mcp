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

function spectralSkewness (_a) {
    var ampSpectrum = _a.ampSpectrum;
    if (typeof ampSpectrum !== "object") {
        throw new TypeError();
    }
    var mu1 = mu(1, ampSpectrum);
    var mu2 = mu(2, ampSpectrum);
    var mu3 = mu(3, ampSpectrum);
    var numerator = 2 * Math.pow(mu1, 3) - 3 * mu1 * mu2 + mu3;
    var denominator = Math.pow(Math.sqrt(mu2 - Math.pow(mu1, 2)), 3);
    return numerator / denominator;
}

module.exports = spectralSkewness;
