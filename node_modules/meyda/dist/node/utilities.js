'use strict';

/******************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */
/* global Reflect, Promise */


function __spreadArray(to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
}

function blackman(size) {
    var blackmanBuffer = new Float32Array(size);
    var coeff1 = (2 * Math.PI) / (size - 1);
    var coeff2 = 2 * coeff1;
    //According to http://uk.mathworks.com/help/signal/ref/blackman.html
    //first half of the window
    for (var i = 0; i < size / 2; i++) {
        blackmanBuffer[i] =
            0.42 - 0.5 * Math.cos(i * coeff1) + 0.08 * Math.cos(i * coeff2);
    }
    //second half of the window
    for (var i = Math.ceil(size / 2); i > 0; i--) {
        blackmanBuffer[size - i] = blackmanBuffer[i - 1];
    }
    return blackmanBuffer;
}
function sine(size) {
    var coeff = Math.PI / (size - 1);
    var sineBuffer = new Float32Array(size);
    for (var i = 0; i < size; i++) {
        sineBuffer[i] = Math.sin(coeff * i);
    }
    return sineBuffer;
}
function hanning(size) {
    var hanningBuffer = new Float32Array(size);
    for (var i = 0; i < size; i++) {
        // According to the R documentation
        // http://ugrad.stat.ubc.ca/R/library/e1071/html/hanning.window.html
        hanningBuffer[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1));
    }
    return hanningBuffer;
}
function hamming(size) {
    var hammingBuffer = new Float32Array(size);
    for (var i = 0; i < size; i++) {
        //According to http://uk.mathworks.com/help/signal/ref/hamming.html
        hammingBuffer[i] = 0.54 - 0.46 * Math.cos(2 * Math.PI * (i / size - 1));
    }
    return hammingBuffer;
}

var windowing = /*#__PURE__*/Object.freeze({
    __proto__: null,
    blackman: blackman,
    hamming: hamming,
    hanning: hanning,
    sine: sine
});

var windows = {};
function isPowerOfTwo(num) {
    while (num % 2 === 0 && num > 1) {
        num /= 2;
    }
    return num === 1;
}
function error(message) {
    throw new Error("Meyda: " + message);
}
function pointwiseBufferMult(a, b) {
    var c = [];
    for (var i = 0; i < Math.min(a.length, b.length); i++) {
        c[i] = a[i] * b[i];
    }
    return c;
}
function applyWindow(signal, windowname) {
    if (windowname !== "rect") {
        if (windowname === "" || !windowname)
            windowname = "hanning";
        if (!windows[windowname])
            windows[windowname] = {};
        if (!windows[windowname][signal.length]) {
            try {
                windows[windowname][signal.length] = windowing[windowname](signal.length);
            }
            catch (e) {
                throw new Error("Invalid windowing function");
            }
        }
        signal = pointwiseBufferMult(signal, windows[windowname][signal.length]);
    }
    return signal;
}
function createBarkScale(length, sampleRate, bufferSize) {
    var barkScale = new Float32Array(length);
    for (var i = 0; i < barkScale.length; i++) {
        barkScale[i] = (i * sampleRate) / bufferSize;
        barkScale[i] =
            13 * Math.atan(barkScale[i] / 1315.8) +
                3.5 * Math.atan(Math.pow(barkScale[i] / 7518, 2));
    }
    return barkScale;
}
function typedToArray(t) {
    // utility to convert typed arrays to normal arrays
    return Array.prototype.slice.call(t);
}
function arrayToTyped(t) {
    // utility to convert arrays to typed F32 arrays
    return Float32Array.from(t);
}
function _normalize(num, range) {
    return num / range;
}
function normalize(a, range) {
    return a.map(function (n) {
        return _normalize(n, range);
    });
}
function normalizeToOne(a) {
    var max = Math.max.apply(null, a);
    return a.map(function (n) {
        return n / max;
    });
}
function mean(a) {
    return (a.reduce(function (prev, cur) {
        return prev + cur;
    }) / a.length);
}
function _melToFreq(melValue) {
    var freqValue = 700 * (Math.exp(melValue / 1125) - 1);
    return freqValue;
}
function _freqToMel(freqValue) {
    var melValue = 1125 * Math.log(1 + freqValue / 700);
    return melValue;
}
function melToFreq(mV) {
    return _melToFreq(mV);
}
function freqToMel(fV) {
    return _freqToMel(fV);
}
function createMelFilterBank(numFilters, sampleRate, bufferSize) {
    //the +2 is the upper and lower limits
    var melValues = new Float32Array(numFilters + 2);
    var melValuesInFreq = new Float32Array(numFilters + 2);
    //Generate limits in Hz - from 0 to the nyquist.
    var lowerLimitFreq = 0;
    var upperLimitFreq = sampleRate / 2;
    //Convert the limits to Mel
    var lowerLimitMel = _freqToMel(lowerLimitFreq);
    var upperLimitMel = _freqToMel(upperLimitFreq);
    //Find the range
    var range = upperLimitMel - lowerLimitMel;
    //Find the range as part of the linear interpolation
    var valueToAdd = range / (numFilters + 1);
    var fftBinsOfFreq = new Array(numFilters + 2);
    for (var i = 0; i < melValues.length; i++) {
        // Initialising the mel frequencies
        // They're a linear interpolation between the lower and upper limits.
        melValues[i] = i * valueToAdd;
        // Convert back to Hz
        melValuesInFreq[i] = _melToFreq(melValues[i]);
        // Find the corresponding bins
        fftBinsOfFreq[i] = Math.floor(((bufferSize + 1) * melValuesInFreq[i]) / sampleRate);
    }
    var filterBank = new Array(numFilters);
    for (var j = 0; j < filterBank.length; j++) {
        // Create a two dimensional array of size numFilters * (buffersize/2)+1
        // pre-populating the arrays with 0s.
        filterBank[j] = new Array(bufferSize / 2 + 1).fill(0);
        //creating the lower and upper slopes for each bin
        for (var i = fftBinsOfFreq[j]; i < fftBinsOfFreq[j + 1]; i++) {
            filterBank[j][i] =
                (i - fftBinsOfFreq[j]) / (fftBinsOfFreq[j + 1] - fftBinsOfFreq[j]);
        }
        for (var i = fftBinsOfFreq[j + 1]; i < fftBinsOfFreq[j + 2]; i++) {
            filterBank[j][i] =
                (fftBinsOfFreq[j + 2] - i) /
                    (fftBinsOfFreq[j + 2] - fftBinsOfFreq[j + 1]);
        }
    }
    return filterBank;
}
function hzToOctaves(freq, A440) {
    return Math.log2((16 * freq) / A440);
}
function normalizeByColumn(a) {
    var emptyRow = a[0].map(function () { return 0; });
    var colDenominators = a
        .reduce(function (acc, row) {
        row.forEach(function (cell, j) {
            acc[j] += Math.pow(cell, 2);
        });
        return acc;
    }, emptyRow)
        .map(Math.sqrt);
    return a.map(function (row, i) { return row.map(function (v, j) { return v / (colDenominators[j] || 1); }); });
}
function createChromaFilterBank(numFilters, sampleRate, bufferSize, centerOctave, octaveWidth, baseC, A440) {
    if (centerOctave === void 0) { centerOctave = 5; }
    if (octaveWidth === void 0) { octaveWidth = 2; }
    if (baseC === void 0) { baseC = true; }
    if (A440 === void 0) { A440 = 440; }
    var numOutputBins = Math.floor(bufferSize / 2) + 1;
    var frequencyBins = new Array(bufferSize)
        .fill(0)
        .map(function (_, i) { return numFilters * hzToOctaves((sampleRate * i) / bufferSize, A440); });
    // Set a value for the 0 Hz bin that is 1.5 octaves below bin 1
    // (so chroma is 50% rotated from bin 1, and bin width is broad)
    frequencyBins[0] = frequencyBins[1] - 1.5 * numFilters;
    var binWidthBins = frequencyBins
        .slice(1)
        .map(function (v, i) { return Math.max(v - frequencyBins[i]); }, 1)
        .concat([1]);
    var halfNumFilters = Math.round(numFilters / 2);
    var filterPeaks = new Array(numFilters)
        .fill(0)
        .map(function (_, i) {
        return frequencyBins.map(function (frq) {
            return ((10 * numFilters + halfNumFilters + frq - i) % numFilters) -
                halfNumFilters;
        });
    });
    var weights = filterPeaks.map(function (row, i) {
        return row.map(function (_, j) {
            return Math.exp(-0.5 * Math.pow((2 * filterPeaks[i][j]) / binWidthBins[j], 2));
        });
    });
    weights = normalizeByColumn(weights);
    if (octaveWidth) {
        var octaveWeights = frequencyBins.map(function (v) {
            return Math.exp(-0.5 * Math.pow((v / numFilters - centerOctave) / octaveWidth, 2));
        });
        weights = weights.map(function (row) {
            return row.map(function (cell, j) { return cell * octaveWeights[j]; });
        });
    }
    if (baseC) {
        weights = __spreadArray(__spreadArray([], weights.slice(3), true), weights.slice(0, 3), true);
    }
    return weights.map(function (row) { return row.slice(0, numOutputBins); });
}
function frame(buffer, frameLength, hopLength) {
    if (buffer.length < frameLength) {
        throw new Error("Buffer is too short for frame length");
    }
    if (hopLength < 1) {
        throw new Error("Hop length cannot be less that 1");
    }
    if (frameLength < 1) {
        throw new Error("Frame length cannot be less that 1");
    }
    var numFrames = 1 + Math.floor((buffer.length - frameLength) / hopLength);
    return new Array(numFrames)
        .fill(0)
        .map(function (_, i) { return buffer.slice(i * hopLength, i * hopLength + frameLength); });
}

exports._normalize = _normalize;
exports.applyWindow = applyWindow;
exports.arrayToTyped = arrayToTyped;
exports.createBarkScale = createBarkScale;
exports.createChromaFilterBank = createChromaFilterBank;
exports.createMelFilterBank = createMelFilterBank;
exports.error = error;
exports.frame = frame;
exports.freqToMel = freqToMel;
exports.hzToOctaves = hzToOctaves;
exports.isPowerOfTwo = isPowerOfTwo;
exports.mean = mean;
exports.melToFreq = melToFreq;
exports.normalize = normalize;
exports.normalizeByColumn = normalizeByColumn;
exports.normalizeToOne = normalizeToOne;
exports.pointwiseBufferMult = pointwiseBufferMult;
exports.typedToArray = typedToArray;
