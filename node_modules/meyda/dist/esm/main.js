/**
 * This file contains the default export for Meyda, you probably want to check
 * out {@link default}
 *
 * @module Meyda
 */
import * as utilities from "./utilities";
import * as extractors from "./featureExtractors";
import { fft } from "fftjs";
import { MeydaAnalyzer } from "./meyda-wa";
var Meyda = {
    audioContext: null,
    spn: null,
    bufferSize: 512,
    sampleRate: 44100,
    melBands: 26,
    chromaBands: 12,
    callback: null,
    windowingFunction: "hanning",
    featureExtractors: extractors,
    EXTRACTION_STARTED: false,
    numberOfMFCCCoefficients: 13,
    numberOfBarkBands: 24,
    _featuresToExtract: [],
    windowing: utilities.applyWindow,
    /** @hidden */
    _errors: {
        notPow2: new Error("Meyda: Buffer size must be a power of 2, e.g. 64 or 512"),
        featureUndef: new Error("Meyda: No features defined."),
        invalidFeatureFmt: new Error("Meyda: Invalid feature format"),
        invalidInput: new Error("Meyda: Invalid input."),
        noAC: new Error("Meyda: No AudioContext specified."),
        noSource: new Error("Meyda: No source node specified."),
    },
    /**
     * @summary
     * Create a MeydaAnalyzer
     *
     * A factory function for creating a MeydaAnalyzer, the interface for using
     * Meyda in the context of Web Audio.
     *
     * ```javascript
     * const analyzer = Meyda.createMeydaAnalyzer({
     *   "audioContext": audioContext,
     *   "source": source,
     *   "bufferSize": 512,
     *   "featureExtractors": ["rms"],
     *   "inputs": 2,
     *   "callback": features => {
     *     levelRangeElement.value = features.rms;
     *   }
     * });
     * ```
     */
    createMeydaAnalyzer: createMeydaAnalyzer,
    /**
     * List available audio feature extractors. Return format provides the key to
     * be used in selecting the extractor in the extract methods
     */
    listAvailableFeatureExtractors: listAvailableFeatureExtractors,
    /**
     * Extract an audio feature from a buffer
     *
     * Unless `meyda.windowingFunction` is set otherwise, `extract` will
     * internally apply a hanning window to the buffer prior to conversion into
     * the frequency domain.
     *
     * ```javascript
     * meyda.bufferSize = 2048;
     * const features = meyda.extract(['zcr', 'spectralCentroid'], signal);
     * ```
     */
    extract: function (feature, signal, previousSignal) {
        var _this = this;
        if (!signal)
            throw this._errors.invalidInput;
        else if (typeof signal != "object")
            throw this._errors.invalidInput;
        else if (!feature)
            throw this._errors.featureUndef;
        else if (!utilities.isPowerOfTwo(signal.length))
            throw this._errors.notPow2;
        if (typeof this.barkScale == "undefined" ||
            this.barkScale.length != this.bufferSize) {
            this.barkScale = utilities.createBarkScale(this.bufferSize, this.sampleRate, this.bufferSize);
        }
        // Recalculate mel bank if buffer length changed
        if (typeof this.melFilterBank == "undefined" ||
            this.barkScale.length != this.bufferSize ||
            this.melFilterBank.length != this.melBands) {
            this.melFilterBank = utilities.createMelFilterBank(Math.max(this.melBands, this.numberOfMFCCCoefficients), this.sampleRate, this.bufferSize);
        }
        // Recalculate chroma bank if buffer length changed
        if (typeof this.chromaFilterBank == "undefined" ||
            this.chromaFilterBank.length != this.chromaBands) {
            this.chromaFilterBank = utilities.createChromaFilterBank(this.chromaBands, this.sampleRate, this.bufferSize);
        }
        if ("buffer" in signal && typeof signal.buffer == "undefined") {
            //signal is a normal array, convert to F32A
            this.signal = utilities.arrayToTyped(signal);
        }
        else {
            this.signal = signal;
        }
        var preparedSignal = prepareSignalWithSpectrum(signal, this.windowingFunction, this.bufferSize);
        this.signal = preparedSignal.windowedSignal;
        this.complexSpectrum = preparedSignal.complexSpectrum;
        this.ampSpectrum = preparedSignal.ampSpectrum;
        if (previousSignal) {
            var preparedSignal_1 = prepareSignalWithSpectrum(previousSignal, this.windowingFunction, this.bufferSize);
            this.previousSignal = preparedSignal_1.windowedSignal;
            this.previousComplexSpectrum = preparedSignal_1.complexSpectrum;
            this.previousAmpSpectrum = preparedSignal_1.ampSpectrum;
        }
        var extract = function (feature) {
            return _this.featureExtractors[feature]({
                ampSpectrum: _this.ampSpectrum,
                chromaFilterBank: _this.chromaFilterBank,
                complexSpectrum: _this.complexSpectrum,
                signal: _this.signal,
                bufferSize: _this.bufferSize,
                sampleRate: _this.sampleRate,
                barkScale: _this.barkScale,
                melFilterBank: _this.melFilterBank,
                previousSignal: _this.previousSignal,
                previousAmpSpectrum: _this.previousAmpSpectrum,
                previousComplexSpectrum: _this.previousComplexSpectrum,
                numberOfMFCCCoefficients: _this.numberOfMFCCCoefficients,
                numberOfBarkBands: _this.numberOfBarkBands,
            });
        };
        if (typeof feature === "object") {
            return feature.reduce(function (acc, el) {
                var _a;
                return Object.assign({}, acc, (_a = {},
                    _a[el] = extract(el),
                    _a));
            }, {});
        }
        else if (typeof feature === "string") {
            return extract(feature);
        }
        else {
            throw this._errors.invalidFeatureFmt;
        }
    },
};
var prepareSignalWithSpectrum = function (signal, windowingFunction, bufferSize) {
    var preparedSignal = {};
    if (typeof signal.buffer == "undefined") {
        //signal is a normal array, convert to F32A
        preparedSignal.signal = utilities.arrayToTyped(signal);
    }
    else {
        preparedSignal.signal = signal;
    }
    preparedSignal.windowedSignal = utilities.applyWindow(preparedSignal.signal, windowingFunction);
    preparedSignal.complexSpectrum = fft(preparedSignal.windowedSignal);
    preparedSignal.ampSpectrum = new Float32Array(bufferSize / 2);
    for (var i = 0; i < bufferSize / 2; i++) {
        preparedSignal.ampSpectrum[i] = Math.sqrt(Math.pow(preparedSignal.complexSpectrum.real[i], 2) +
            Math.pow(preparedSignal.complexSpectrum.imag[i], 2));
    }
    return preparedSignal;
};
export default Meyda;
/**
 * List available audio feature extractors. Return format provides the key to
 * be used in selecting the extractor in the extract methods
 */
function listAvailableFeatureExtractors() {
    return Object.keys(this.featureExtractors);
}
/**
 * Create a MeydaAnalyzer
 *
 * A factory function for creating a MeydaAnalyzer, the interface for using
 * Meyda in the context of Web Audio.
 *
 * ```javascript
 * const analyzer = Meyda.createMeydaAnalyzer({
 *   "audioContext": audioContext,
 *   "source": source,
 *   "bufferSize": 512,
 *   "featureExtractors": ["rms"],
 *   "inputs": 2,
 *   "callback": features => {
 *     levelRangeElement.value = features.rms;
 *   }
 * });
 * ```
 */
function createMeydaAnalyzer(options) {
    return new MeydaAnalyzer(options, Object.assign({}, Meyda));
}
/**
 * Apply a windowing function to a signal
 */
function windowing(signal, windowname) {
    return utilities.applyWindow(signal, windowname);
}
// @ts-ignore
if (typeof window !== "undefined")
    window.Meyda = Meyda;
