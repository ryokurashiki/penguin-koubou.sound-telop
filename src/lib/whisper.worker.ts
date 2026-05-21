// @ts-ignore
import { pipeline, env } from '@xenova/transformers';

// Skip local model check to fetch from Hugging Face hub
env.allowLocalModels = false;

class PipelineSingleton {
  static task = 'automatic-speech-recognition';
  static model = 'Xenova/whisper-tiny';
  static instance: any = null;

  static async getInstance(progress_callback?: Function) {
    if (this.instance === null) {
      this.instance = await pipeline(this.task, this.model, {
        progress_callback,
      });
    }
    return this.instance;
  }
}

self.addEventListener('message', async (event) => {
  try {
    const { audio, type } = event.data;
    
    if (type === 'load') {
      await PipelineSingleton.getInstance((x: any) => {
        self.postMessage({ status: 'progress', ...x });
      });
      self.postMessage({ status: 'ready' });
      return;
    }

    const transcriber = await PipelineSingleton.getInstance((x: any) => {
      self.postMessage({ status: 'progress', ...x });
    });

    self.postMessage({ status: 'processing' });

    // Run Whisper model
    const result = await transcriber(audio, {
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
