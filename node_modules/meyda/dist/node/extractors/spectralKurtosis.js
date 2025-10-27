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

function spectralKurtosis (_a) {
    var ampSpectrum = _a.ampSpectrum;
    if (typeof ampSpectrum !== "object") {
        throw new TypeError();
    }
    var ampspec = ampSpectrum;
    var mu1 = mu(1, ampspec);
    var mu2 = mu(2, ampspec);
    var mu3 = mu(3, ampspec);
    var mu4 = mu(4, ampspec);
    var numerator = -3 * Math.pow(mu1, 4) + 6 * mu1 * mu2 - 4 * mu1 * mu3 + mu4;
    var denominator = Math.pow(Math.sqrt(mu2 - Math.pow(mu1, 2)), 4);
    return numerator / denominator;
}

module.exports = spectralKurtosis;
