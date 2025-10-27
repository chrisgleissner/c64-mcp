/**
 * This file contains the default export for Meyda, you probably want to check
 * out {@link default}
 *
 * @module Meyda
 */
import { MeydaAnalyzer } from "./meyda-wa";
export interface MeydaFeaturesObject {
    amplitudeSpectrum: Float32Array;
    buffer: number[];
    chroma: number[];
    complexSpectrum: {
        real: number[];
        imag: number[];
    };
    energy: number;
    loudness: {
        specific: Float32Array;
        total: number;
    };
    mfcc: number[];
    perceptualSharpness: number;
    perceptualSpread: number;
    powerSpectrum: Float32Array;
    rms: number;
    spectralCentroid: number;
    spectralFlatness: number;
    spectralKurtosis: number;
    spectralRolloff: number;
    spectralSkewness: number;
    spectralSlope: number;
    spectralSpread: number;
    spectralCrest: number;
    zcr: number;
}
export type MeydaWindowingFunction = "blackman" | "sine" | "hanning" | "hamming";
export type MeydaAudioFeature = "amplitudeSpectrum" | "chroma" | "complexSpectrum" | "energy" | "loudness" | "mfcc" | "perceptualSharpness" | "perceptualSpread" | "powerSpectrum" | "rms" | "spectralCentroid" | "spectralFlatness" | "spectralFlux" | "spectralKurtosis" | "spectralRolloff" | "spectralSkewness" | "spectralSlope" | "spectralSpread" | "spectralCrest" | "zcr" | "buffer" | "melBands";
/**
 * A type representing an audio signal. In general it should be an array of
 * numbers that is sliceable. Float32Array is assignable here, and we generally
 * expect that most signals will be in this format.
 */
export type MeydaSignal = SliceableArrayLike<number> | Float32Array;
export interface SliceableArrayLike<T> extends ArrayLike<T> {
    slice(start: number, end: number): SliceableArrayLike<T>;
}
/**
 * Meyda is a library for extracting audio features from an audio signal.
 *
 * The primary entry points are {@link extract} for audio feature extraction on
 * raw signals you have in memory, and {@link createMeydaAnalyzer}, which
 * provides a {@link MeydaAnalyzer} object that can be used to extract features
 * on a Web Audio API AudioNode. The latter is only supported on web targets,
 * though if you're using the Web Audio API in a non-web target, we'd love to
 * hear from you.
 *
 * We also expose {@link listAvailableFeatureExtractors} which returns a list of the
 * available feature extractors, and {@link windowing}, which lets you apply
 * a windowing function to your signal outside of Meyda.
 *
 * We existed long before esmodules, so our backwards compatible API may seem
 * unusual. We export a default object, with read/write fields that control
 * various parameters of the audio feature extraction process. We're working on
 * a new interface, check out [#257](https://github.com/meyda/meyda/issues/257)
 * for more information.
 */
interface Meyda {
    /**
     * Meyda stores a reference to the relevant audio context here for use inside
     * the Web Audio API.
     */
    audioContext: AudioContext | null;
    /**
     * Meyda keeps an internal ScriptProcessorNode in which it runs audio feature
     * extraction. The ScriptProcessorNode is stored in this member variable.
     * @hidden
     */
    spn: ScriptProcessorNode | null;
    /**
     * The length of each buffer that Meyda will extract audio on. When recieving
     * input via the Web Audio API, the Script Processor Node chunks incoming audio
     * into arrays of this length. Longer buffers allow for more precision in the
     * frequency domain, but increase the amount of time it takes for Meyda to
     * output a set of audio features for the buffer. You can calculate how many
     * sets of audio features Meyda will output per second by dividing the
     * buffer size by the sample rate. If you're using Meyda for visualisation,
     * make sure that you're collecting audio features at a rate that's faster
     * than or equal to the video frame rate you expect.
     */
    bufferSize: number;
    /**
     * The number of samples per second of the incoming audio. This affects
     * feature extraction outside of the context of the Web Audio API, and must be
     * set accurately - otherwise calculations will be off.
     */
    sampleRate: number;
    /**
     * The number of Mel bands to use in the Mel Frequency Cepstral Co-efficients
     * feature extractor
     */
    melBands: number;
    /**
     * The number of bands to divide the spectrum into for the Chroma feature
     * extractor. 12 is the standard number of semitones per octave in the western
     * music tradition, but Meyda can use an arbitrary number of bands, which
     * can be useful for microtonal music.
     */
    chromaBands: number;
    /**
     * A function you can provide that will be called for each buffer that Meyda
     * receives from its source node
     * @hidden
     */
    callback: ((features: Partial<MeydaFeaturesObject>) => void | null) | null;
    /**
     * Specify the windowing function to apply to the buffer before the
     * transformation from the time domain to the frequency domain is performed
     *
     * The default windowing function is the hanning window.
     */
    windowingFunction: string;
    featureExtractors: any;
    /** @hidden */
    EXTRACTION_STARTED: boolean;
    /**
     * The number of MFCC co-efficients that the MFCC feature extractor should return
     */
    numberOfMFCCCoefficients: number;
    /**
     * The number of bark bands that the loudness feature extractor should return
     */
    numberOfBarkBands: number;
    /** @hidden */
    _featuresToExtract: string[];
    /**
     * Apply a windowing function to a signal
     */
    windowing: (signal: MeydaSignal, windowname?: MeydaWindowingFunction) => MeydaSignal;
    /** @hidden */
    _errors: {
        [key: string]: Error;
    };
    /**
     * @summary
     * Create a MeydaAnalyzer
     *
     * A factory function for creating a MeydaAnalyzer, the interface for using
     * Meyda in the context of Web Audio.
     *
     * @example
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
    createMeydaAnalyzer: (MeydaAnalyzerOptions: any) => MeydaAnalyzer;
    /**
     * List available audio feature extractors. Return format provides the key to
     * be used in selecting the extractor in the extract methods
     */
    listAvailableFeatureExtractors: () => MeydaAudioFeature[];
    /**
     * Extract an audio feature from a buffer
     *
     * Unless `meyda.windowingFunction` is set otherwise, `extract` will
     * internally apply a hanning window to the buffer prior to conversion into
     * the frequency domain.
     *
     * @param {(string|Array.<string>)} feature - the feature you want to extract
     * @param {Array.<number>} signal
     * An array of numbers that represents the signal. It should be of length
     * `meyda.bufferSize`
     * @param {Array.<number>} [previousSignal] - the previous buffer
     * @returns {object} Features
     * @example
     * ```javascript
     * meyda.bufferSize = 2048;
     * const features = meyda.extract(['zcr', 'spectralCentroid'], signal);
     * ```
     *
     * Aside: yes, you need to modify the value of a field of the default export
     * of the package to change the buffer size. We realise this now seems not
     * a good practice. See [this issue](https://github.com/meyda/meyda/issues/257)
     * to track our progress on implementing a more modern API.
     */
    extract: (feature: MeydaAudioFeature | MeydaAudioFeature[], signal: MeydaSignal, previousSignal?: MeydaSignal) => Partial<MeydaFeaturesObject> | null;
}
declare const Meyda: Meyda;
export default Meyda;
