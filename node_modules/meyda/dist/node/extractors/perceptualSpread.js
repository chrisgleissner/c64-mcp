'use strict';

function loudness (_a) {
    var ampSpectrum = _a.ampSpectrum, barkScale = _a.barkScale, _b = _a.numberOfBarkBands, numberOfBarkBands = _b === void 0 ? 24 : _b;
    if (typeof ampSpectrum !== "object" || typeof barkScale !== "object") {
        throw new TypeError();
    }
    var NUM_BARK_BANDS = numberOfBarkBands;
    var specific = new Float32Array(NUM_BARK_BANDS);
    var total = 0;
    var normalisedSpectrum = ampSpectrum;
    var bbLimits = new Int32Array(NUM_BARK_BANDS + 1);
    bbLimits[0] = 0;
    var currentBandEnd = barkScale[normalisedSpectrum.length - 1] / NUM_BARK_BANDS;
    var currentBand = 1;
    for (var i = 0; i < normalisedSpectrum.length; i++) {
        while (barkScale[i] > currentBandEnd) {
            bbLimits[currentBand++] = i;
            currentBandEnd =
                (currentBand * barkScale[normalisedSpectrum.length - 1]) /
                    NUM_BARK_BANDS;
        }
    }
    bbLimits[NUM_BARK_BANDS] = normalisedSpectrum.length - 1;
    //process
    for (var i = 0; i < NUM_BARK_BANDS; i++) {
        var sum = 0;
        for (var j = bbLimits[i]; j < bbLimits[i + 1]; j++) {
            sum += normalisedSpectrum[j];
        }
        specific[i] = Math.pow(sum, 0.23);
    }
    //get total loudness
    for (var i = 0; i < specific.length; i++) {
        total += specific[i];
    }
    return {
        specific: specific,
        total: total,
    };
}

function perceptualSpread (_a) {
    var ampSpectrum = _a.ampSpectrum, barkScale = _a.barkScale;
    var loudnessValue = loudness({ ampSpectrum: ampSpectrum, barkScale: barkScale });
    var max = 0;
    for (var i = 0; i < loudnessValue.specific.length; i++) {
        if (loudnessValue.specific[i] > max) {
            max = loudnessValue.specific[i];
        }
    }
    var spread = Math.pow((loudnessValue.total - max) / loudnessValue.total, 2);
    return spread;
}

module.exports = perceptualSpread;
