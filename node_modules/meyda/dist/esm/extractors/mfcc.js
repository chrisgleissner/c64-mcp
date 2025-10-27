import extractMelBands from "./melBands";
import dct from "dct";
export default function (_a) {
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
    var mfccs = dct(loggedMelBandsArray).slice(0, _numberOfMFCCCoefficients);
    return mfccs;
}
