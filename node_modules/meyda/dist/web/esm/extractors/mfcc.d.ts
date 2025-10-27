export default function ({ ampSpectrum, melFilterBank, numberOfMFCCCoefficients, bufferSize, }: {
    ampSpectrum: Float32Array;
    melFilterBank: number[][];
    numberOfMFCCCoefficients: number;
    bufferSize: number;
}): number[];
