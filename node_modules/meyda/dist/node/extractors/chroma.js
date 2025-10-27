'use strict';

function chroma (_a) {
    var ampSpectrum = _a.ampSpectrum, chromaFilterBank = _a.chromaFilterBank;
    if (typeof ampSpectrum !== "object") {
        throw new TypeError("Valid ampSpectrum is required to generate chroma");
    }
    if (typeof chromaFilterBank !== "object") {
        throw new TypeError("Valid chromaFilterBank is required to generate chroma");
    }
    var chromagram = chromaFilterBank.map(function (row, i) {
        return ampSpectrum.reduce(function (acc, v, j) { return acc + v * row[j]; }, 0);
    });
    var maxVal = Math.max.apply(Math, chromagram);
    return maxVal ? chromagram.map(function (v) { return v / maxVal; }) : chromagram;
}

module.exports = chroma;
