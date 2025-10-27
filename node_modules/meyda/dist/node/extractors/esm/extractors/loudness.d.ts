export default function ({ ampSpectrum, barkScale, numberOfBarkBands, }: {
    ampSpectrum: Float32Array;
    barkScale: Float32Array;
    numberOfBarkBands?: number;
}): {
    specific: Float32Array;
    total: number;
};
