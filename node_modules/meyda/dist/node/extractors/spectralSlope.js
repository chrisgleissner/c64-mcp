'use strict';

function spectralSlope (_a) {
    var ampSpectrum = _a.ampSpectrum, sampleRate = _a.sampleRate, bufferSize = _a.bufferSize;
    if (typeof ampSpectrum !== "object") {
        throw new TypeError();
    }
    //linear regression
    var ampSum = 0;
    var freqSum = 0;
    var freqs = new Float32Array(ampSpectrum.length);
    var powFreqSum = 0;
    var ampFreqSum = 0;
    for (var i = 0; i < ampSpectrum.length; i++) {
        ampSum += ampSpectrum[i];
        var curFreq = (i * sampleRate) / bufferSize;
        freqs[i] = curFreq;
        powFreqSum += curFreq * curFreq;
        freqSum += curFreq;
        ampFreqSum += curFreq * ampSpectrum[i];
    }
    return ((ampSpectrum.length * ampFreqSum - freqSum * ampSum) /
        (ampSum * (powFreqSum - Math.pow(freqSum, 2))));
}

module.exports = spectralSlope;
