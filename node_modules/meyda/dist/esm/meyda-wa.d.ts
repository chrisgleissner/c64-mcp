import type { MeydaAudioFeature, MeydaWindowingFunction, MeydaFeaturesObject } from "./main";
/**
 * MeydaAnalyzerOptions
 */
export interface MeydaAnalyzerOptions {
    /**
     * The Audio Context for the MeydaAnalyzer to operate in.
     */
    audioContext: AudioContext;
    /**
     * The Audio Node for Meyda to listen to.
     */
    source: AudioNode;
    /**
     * The size of the buffer.
     */
    bufferSize: number;
    /**
     * The number of samples between the start of each buffer.
     */
    hopSize?: number | undefined;
    /**
     * The number of samples per second in the audioContext.
     */
    sampleRate?: number | undefined;
    /**
     * Pass `true` to start feature extraction immediately
     */
    startImmediately?: boolean | undefined;
    /**
     * The channel from the input node to listen to
     */
    channel?: number | undefined;
    /**
     * The Windowing Function to apply to the signal before transformation to the frequency domain.
     */
    windowingFunction?: MeydaWindowingFunction | undefined;
    /**
     * What feature extractors to return to the callback.
     */
    featureExtractors?: MeydaAudioFeature | ReadonlyArray<MeydaAudioFeature> | undefined;
    inputs?: number | undefined;
    outputs?: number | undefined;
    /**
     * The number of mfcc coefficients to calculate for each buffer.
     */
    numberOfMFCCCoefficients?: number | undefined;
    /**
     * The number of bark bands to calculate for use in feature extractors.
     */
    numberOfBarkBands?: number | undefined;
    /**
     * The callback to receive your audio features. Will be called once for each buffer of input audio.
     */
    callback?: ((features: Partial<MeydaFeaturesObject>) => void) | undefined;
}
/**
 * Meyda's interface to the Web Audio API. MeydaAnalyzer abstracts an API on
 * top of the Web Audio API's ScriptProcessorNode, running the Meyda audio
 * feature extractors inside that context.
 *
 * MeydaAnalyzer's constructor should not be called directly - MeydaAnalyzer
 * objects should be generated using the {@link createMeydaAnalyzer}
 * factory function in the main Meyda class.
 *
 * Options are of type {@link MeydaAnalyzerOptions}.
 *
 * @example
 * ```javascript
 * const analyzer = Meyda.createMeydaAnalyzer({
 *   "audioContext": audioContext,
 *   "source": source,
 *   "bufferSize": 512,
 *   "featureExtractors": ["rms"],
 *   "inputs": 2,
 *   "numberOfMFCCCoefficients": 20
 *   "callback": features => {
 *     levelRangeElement.value = features.rms;
 *   }
 * });
 * ```
 */
export declare class MeydaAnalyzer {
    /** @hidden */
    _m: any;
    /** @hidden */
    constructor(options: MeydaAnalyzerOptions, _this: any);
    /**
     * Start feature extraction
     * The audio features will be passed to the callback function that was defined
     * in the MeydaOptions that were passed to the factory when constructing the
     * MeydaAnalyzer.
     * @param {(string|Array.<string>)} [features]
     * Change the features that Meyda is extracting. Defaults to the features that
     * were set upon construction in the options parameter.
     * @example
     * ```javascript
     * analyzer.start('chroma');
     * ```
     */
    start(features?: MeydaAudioFeature | ReadonlyArray<MeydaAudioFeature>): void;
    /**
     * Stop feature extraction.
     * @example
     * ```javascript
     * analyzer.stop();
     * ```
     */
    stop(): void;
    /**
     * Set the Audio Node for Meyda to listen to.
     * @param {AudioNode} source - The Audio Node for Meyda to listen to
     * @example
     * ```javascript
     * analyzer.setSource(audioSourceNode);
     * ```
     */
    setSource(source: AudioNode): void;
    /**
     * Set the channel of the audio node for Meyda to listen to
     * @param {number} channel - the index of the channel on the input audio node
     * for Meyda to listen to.
     * @example
     * ```javascript
     * analyzer.setChannel(0);
     * ```
     */
    setChannel(channel: number): void;
    /**
     * Get a set of features from the current frame.
     * @param {(string|Array.<string>)} [features]
     * Change the features that Meyda is extracting
     * @example
     * ```javascript
     * analyzer.get('spectralFlatness');
     * ```
     */
    get(features?: MeydaAudioFeature | ReadonlyArray<MeydaAudioFeature>): Partial<MeydaFeaturesObject> | null;
}
