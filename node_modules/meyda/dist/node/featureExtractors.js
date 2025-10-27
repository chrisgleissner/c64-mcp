'use strict';

function rms (_a) {
    var signal = _a.signal;
    // Keeping this bad runtime typecheck for consistency
    if (typeof signal !== "object") {
        throw new TypeError();
    }
    var rms = 0;
    for (var i = 0; i < signal.length; i++) {
        rms += Math.pow(signal[i], 2);
    }
    rms = rms / signal.length;
    rms = Math.sqrt(rms);
    return rms;
}

function energy (_a) {
    var signal = _a.signal;
    if (typeof signal !== "object") {
        throw new TypeError();
    }
    var energy = 0;
    for (var i = 0; i < signal.length; i++) {
        energy += Math.pow(Math.abs(signal[i]), 2);
    }
    return energy;
}

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

function spectralRolloff (_a) {
    var ampSpectrum = _a.ampSpectrum, sampleRate = _a.sampleRate;
    if (typeof ampSpectrum !== "object") {
        throw new TypeError();
    }
    var ampspec = ampSpectrum;
    //calculate nyquist bin
    var nyqBin = sampleRate / (2 * (ampspec.length - 1));
    var ec = 0;
    for (var i = 0; i < ampspec.length; i++) {
        ec += ampspec[i];
    }
    var threshold = 0.99 * ec;
    var n = ampspec.length - 1;
    while (ec > threshold && n >= 0) {
        ec -= ampspec[n];
        --n;
    }
    return (n + 1) * nyqBin;
}

function spectralFlatness (_a) {
    var ampSpectrum = _a.ampSpectrum;
    if (typeof ampSpectrum !== "object") {
        throw new TypeError();
    }
    var numerator = 0;
    var denominator = 0;
    for (var i = 0; i < ampSpectrum.length; i++) {
        numerator += Math.log(ampSpectrum[i]);
        denominator += ampSpectrum[i];
    }
    return ((Math.exp(numerator / ampSpectrum.length) * ampSpectrum.length) /
        denominator);
}

function spectralSpread (_a) {
    var ampSpectrum = _a.ampSpectrum;
    if (typeof ampSpectrum !== "object") {
        throw new TypeError();
    }
    return Math.sqrt(mu(2, ampSpectrum) - Math.pow(mu(1, ampSpectrum), 2));
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

function perceptualSharpness (_a) {
    var ampSpectrum = _a.ampSpectrum, barkScale = _a.barkScale;
    var loudnessValue = loudness({ ampSpectrum: ampSpectrum, barkScale: barkScale });
    var spec = loudnessValue.specific;
    var output = 0;
    for (var i = 0; i < spec.length; i++) {
        if (i < 15) {
            output += (i + 1) * spec[i + 1];
        }
        else {
            output += 0.066 * Math.exp(0.171 * (i + 1));
        }
    }
    output *= 0.11 / loudnessValue.total;
    return output;
}

function extractPowerSpectrum (_a) {
    var ampSpectrum = _a.ampSpectrum;
    if (typeof ampSpectrum !== "object") {
        throw new TypeError();
    }
    var powerSpectrum = new Float32Array(ampSpectrum.length);
    for (var i = 0; i < powerSpectrum.length; i++) {
        powerSpectrum[i] = Math.pow(ampSpectrum[i], 2);
    }
    return powerSpectrum;
}

function extractMelBands (_a) {
    var ampSpectrum = _a.ampSpectrum, melFilterBank = _a.melFilterBank, bufferSize = _a.bufferSize;
    if (typeof ampSpectrum !== "object") {
        throw new TypeError("Valid ampSpectrum is required to generate melBands");
    }
    if (typeof melFilterBank !== "object") {
        throw new TypeError("Valid melFilterBank is required to generate melBands");
    }
    var powSpec = extractPowerSpectrum({ ampSpectrum: ampSpectrum });
    var numFilters = melFilterBank.length;
    var filtered = Array(numFilters);
    var loggedMelBands = new Float32Array(numFilters);
    for (var i = 0; i < loggedMelBands.length; i++) {
        filtered[i] = new Float32Array(bufferSize / 2);
        loggedMelBands[i] = 0;
        for (var j = 0; j < bufferSize / 2; j++) {
            //point-wise multiplication between power spectrum and filterbanks.
            filtered[i][j] = melFilterBank[i][j] * powSpec[j];
            //summing up all of the coefficients into one array
            loggedMelBands[i] += filtered[i][j];
        }
        //log each coefficient.
        loggedMelBands[i] = Math.log(loggedMelBands[i] + 1);
    }
    return Array.prototype.slice.call(loggedMelBands);
}

function getDefaultExportFromCjs (x) {
	return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, 'default') ? x['default'] : x;
}

/*===========================================================================*\
 * Discrete Cosine Transform
 *
 * (c) Vail Systems. Joshua Jung and Ben Bryan. 2015
 *
 * This code is not designed to be highly optimized but as an educational
 * tool to understand the Mel-scale and its related coefficients used in
 * human speech analysis.
\*===========================================================================*/

var cosMap = null;

// Builds a cosine map for the given input size. This allows multiple input sizes to be memoized automagically
// if you want to run the DCT over and over.
var memoizeCosines = function(N) {
  cosMap = cosMap || {};
  cosMap[N] = new Array(N*N);

  var PI_N = Math.PI / N;

  for (var k = 0; k < N; k++) {
    for (var n = 0; n < N; n++) {
      cosMap[N][n + (k * N)] = Math.cos(PI_N * (n + 0.5) * k);
    }
  }
};

function dct$2(signal, scale) {
  var L = signal.length;
  scale = scale || 2;

  if (!cosMap || !cosMap[L]) memoizeCosines(L);

  var coefficients = signal.map(function () {return 0;});

  return coefficients.map(function (__, ix) {
    return scale * signal.reduce(function (prev, cur, ix_, arr) {
      return prev + (cur * cosMap[L][ix_ + (ix * L)]);
    }, 0);
  });
}
var dct_1 = dct$2;

var dct = dct_1;

var dct$1 = /*@__PURE__*/getDefaultExportFromCjs(dct);

function mfcc (_a) {
    // Tutorial from:
    // http://practicalcryptography.com/miscellaneous/machine-learning
    // /guide-mel-frequency-cepstral-coefficients-mfccs/
    // @ts-ignore
    var ampSpectrum = _a.ampSpectrum, melFilterBank = _a.melFilterBank, numberOfMFCCCoefficients = _a.numberOfMFCCCoefficients, bufferSize = _a.bufferSize;
    var _numberOfMFCCCoefficients = Math.min(40, Math.max(1, numberOfMFCCCoefficients || 13));
    var numFilters = melFilterBank.length;
    if (numFilters < _numberOfMFCCCoefficients) {
        throw new Error("Insufficient filter bank for requested number of coefficients");
    }
    var loggedMelBandsArray = extractMelBands({
        ampSpectrum: ampSpectrum,
        melFilterBank: melFilterBank,
        bufferSize: bufferSize,
    });
    var mfccs = dct$1(loggedMelBandsArray).slice(0, _numberOfMFCCCoefficients);
    return mfccs;
}

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

// This file isn't being typechecked at all because there are major issues with it.
// See #852 for details. Once that's merged, this file should be typechecked.
// @ts-nocheck
function spectralFlux (_a) {
    var signal = _a.signal, previousSignal = _a.previousSignal, bufferSize = _a.bufferSize;
    if (typeof signal !== "object" || typeof previousSignal != "object") {
        throw new TypeError();
    }
    var sf = 0;
    for (var i = -(bufferSize / 2); i < signal.length / 2 - 1; i++) {
        x = Math.abs(signal[i]) - Math.abs(previousSignal[i]);
        sf += (x + Math.abs(x)) / 2;
    }
    return sf;
}

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

var buffer = function (args) {
    return args.signal;
};
var complexSpectrum = function (args) {
    return args.complexSpectrum;
};
var amplitudeSpectrum = function (args) {
    return args.ampSpectrum;
};

exports.amplitudeSpectrum = amplitudeSpectrum;
exports.buffer = buffer;
exports.chroma = chroma;
exports.complexSpectrum = complexSpectrum;
exports.energy = energy;
exports.loudness = loudness;
exports.melBands = extractMelBands;
exports.mfcc = mfcc;
exports.perceptualSharpness = perceptualSharpness;
exports.perceptualSpread = perceptualSpread;
exports.powerSpectrum = extractPowerSpectrum;
exports.rms = rms;
exports.spectralCentroid = spectralCentroid;
exports.spectralCrest = spectralCrest;
exports.spectralFlatness = spectralFlatness;
exports.spectralFlux = spectralFlux;
exports.spectralKurtosis = spectralKurtosis;
exports.spectralRolloff = spectralRolloff;
exports.spectralSkewness = spectralSkewness;
exports.spectralSlope = spectralSlope;
exports.spectralSpread = spectralSpread;
exports.zcr = zcr;
