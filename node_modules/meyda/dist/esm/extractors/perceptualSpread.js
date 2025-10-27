import loudness from "./loudness";
export default function (_a) {
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
