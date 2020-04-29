const fs = require('fs');
const Path = require('path');
const WaveFile = require('wavefile').WaveFile;
const Classifier = require('./model/classifier');

(async () => {
    const classifier = new Classifier();
    await classifier.init();

    // store results here so we don't invoke the classifier again for the same window
    const classifyCache = {};

    console.log('classifier initialized');

    // const buffer = fs.readFileSync(Path.join(__dirname, 'data', 'testing', 'noise.16v5n963.wav'));
    const buffer = fs.readFileSync(Path.join(__dirname, 'data', 'testing', 'shower.16v5kshf.wav'));
    const wav = new WaveFile(buffer);
    wav.toBitDepth('16');

    let totalSamples =  wav.data.samples.length / (wav.fmt.bitsPerSample / 8);

    let dataBuffers = [];

    for (let sx = 0; sx < totalSamples; sx += wav.fmt.numChannels) {
        let sum = 0;

        for (let channelIx = 0; channelIx < wav.fmt.numChannels; channelIx++) {
            sum += wav.getSample(sx + channelIx);
        }

        dataBuffers.push(sum / wav.fmt.numChannels);
    }

    const windowSize = 10 * wav.fmt.sampleRate;
    const windowStep = 1 * wav.fmt.sampleRate;
    const classifyWindowLength = 1 * wav.fmt.sampleRate;
    const classifyWindowOverlap = 0.25 * wav.fmt.sampleRate;

    let totalNoise = 0;
    let totalShower = 0;
    let totalUncertain = 0;

    // We take 5 second slices of data (with 1 seconds steps)
    for (let ix = windowSize; ix < dataBuffers.length; ix += windowStep) {
        let window = dataBuffers.slice(ix - windowSize, ix);

        let noiseCount = 0;
        let showerCount = 0;
        let uncertainCount = 0;

        // in here we'll take 1 second slices, with 300 ms. overlap that we then classify (total 14 windows)
        console.time('classifyWindow');
        for (let wx = 0; wx <= windowSize - classifyWindowLength; wx += classifyWindowOverlap) {
            const cacheKey = ix - windowSize + wx;

            let classifyResult;
            if (!classifyCache[cacheKey]) {
                let slice = window.slice(wx, wx + classifyWindowLength);

                classifyCache[cacheKey] = classifier.classify(slice, false);
            }

            classifyResult = classifyCache[cacheKey];
            let noise = classifyResult.results.find(r => r.label === 'noise').value;
            let shower = classifyResult.results.find(r => r.label === 'shower').value;

            if (noise >= 0.6) {
                noiseCount++;
            }
            else if (shower >= 0.6) {
                showerCount++;
            }
            else {
                uncertainCount++;
            }
        }
        console.timeEnd('classifyWindow');

        let totalCount = noiseCount + showerCount + uncertainCount;
        let conclusion = 'uncertain';
        if (noiseCount / totalCount >= 0.6) {
            totalNoise++;
            conclusion = 'noise';
        }
        else if (showerCount / totalCount >= 0.6) {
            totalShower++;
            conclusion = 'shower';
        }
        else {
            totalUncertain++;
        }

        console.log('at position', (ix / wav.fmt.sampleRate) + 's',
            'noise', noiseCount, 'shower', showerCount, 'uncertain', uncertainCount, '(' + conclusion + ')');
    }

    console.log('total', 'noise', totalNoise, 'shower', totalShower, 'uncertain', totalUncertain);
})();
