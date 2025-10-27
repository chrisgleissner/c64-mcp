import extractPowerSpectrum from "./powerSpectrum";
export default function (_a) {
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
