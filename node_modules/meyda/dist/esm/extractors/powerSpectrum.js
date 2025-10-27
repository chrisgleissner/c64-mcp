export default function (_a) {
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
