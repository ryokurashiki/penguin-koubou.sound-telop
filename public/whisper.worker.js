// Whisper Worker - ES Module version
// Uses dynamic import from CDN to load Transformers.js

let pipeline = null;
let env = null;

async function loadTransformers() {
  if (pipeline) return;
  
  try {
    const module = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2');
    pipeline = module.pipeline;
    env = module.env;
    env.allowLocalModels = false;
  } catch (err) {
    throw new Error('Transformers.js の読み込みに失敗しました: ' + err.message);
  }
}

let transcriber = null;

async function getTranscriber(progress_callback) {
  if (transcriber) return transcriber;
  
  await loadTransformers();
  
  transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny', {
    progress_callback,
  });
  
  return transcriber;
}

self.addEventListener('message', async (event) => {
  try {
    const { audio, type } = event.data;
    
    if (type === 'load') {
      await getTranscriber((x) => {
        self.postMessage({ status: 'progress', ...x });
      });
      self.postMessage({ status: 'ready' });
      return;
    }

    const model = await getTranscriber((x) => {
      self.postMessage({ status: 'progress', ...x });
    });

    self.postMessage({ status: 'processing' });

    const result = await model(audio, {
      chunk_length_s: 30,
      stride_length_s: 5,
      return_timestamps: true,
      language: 'ja',
    });

    self.postMessage({ status: 'complete', result });
  } catch (error) {
    self.postMessage({ status: 'error', error: String(error) });
  }
});
