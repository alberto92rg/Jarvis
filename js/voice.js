// Ascolto: riconoscimento vocale del browser, in italiano.
import { JarvisError } from './errors.js';

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
export const canListen = Boolean(SR);

let rec = null;

export function listen({ onPartial } = {}) {
  return new Promise((resolve, reject) => {
    if (!SR) return reject(new JarvisError('Il riconoscimento vocale non è disponibile su questo browser.'));
    rec = new SR();
    rec.lang = 'it-IT';
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    let finalText = '';
    let done = false;
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalText += res[0].transcript;
        else interim += res[0].transcript;
      }
      onPartial?.(`${finalText} ${interim}`.trim());
    };
    rec.onerror = (e) => {
      if (done) return;
      done = true;
      rec = null;
      if (e.error === 'no-speech' || e.error === 'aborted') resolve(finalText.trim());
      else if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        reject(new JarvisError('Il microfono non è autorizzato. Lo consenta nelle impostazioni del browser.'));
      } else reject(new JarvisError(`Ascolto interrotto (${e.error}).`));
    };
    rec.onend = () => {
      if (done) return;
      done = true;
      rec = null;
      resolve(finalText.trim());
    };
    try {
      rec.start();
    } catch {
      done = true;
      rec = null;
      reject(new JarvisError('Non riesco ad avviare il microfono.'));
    }
  });
}

export function stopListening() {
  try {
    rec?.stop();
  } catch {
    /* già fermo */
  }
}
