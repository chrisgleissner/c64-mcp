import { mu } from "./extractorUtilities";
export default function (_a) {
    var ampSpectrum = _a.ampSpectrum;
    if (typeof ampSpectrum !== "object") {
        throw new TypeError();
    }
    return mu(1, ampSpectrum);
}
