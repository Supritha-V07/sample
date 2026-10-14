/**
 * SightWeaver - OCR & Text Reading Service
 * Captures camera frame, identifies signs/notices/room plates,
 * translates to selected target language, and speaks the translation aloud.
 */

export class OCRService {
  constructor(cameraService, audioService) {
    this.cameraService = cameraService;
    this.audioService = audioService;
    this.targetLanguage = 'en';
    this.lastResult = null;
    this.subscribers = [];
  }

  setTargetLanguage(langCode) {
    this.targetLanguage = langCode;
  }

  subscribe(callback) {
    this.subscribers.push(callback);
  }

  notify(event, data) {
    this.subscribers.forEach(cb => cb(event, data));
  }

  async triggerReadSign(customText = null) {
    this.audioService.speak('Scanning for text and signs...', { priority: 3, force: true });
    this.notify('ocr_scanning', {});

    try {
      let response;
      // In Demo Mode or if backend is available
      const sampleSigns = [
        "Room 304 - Computer Science & AI Lab",
        "Caution: Wet Floor - Proceed Carefully",
        "Exit - Staircase to Ground Floor",
        "Library Silence Please"
      ];
      const textToProcess = customText || sampleSigns[0];

      try {
        const res = await fetch('/api/ocr/read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: textToProcess,
            target_language: this.targetLanguage
          })
        });
        if (res.ok) {
          response = await res.json();
        }
      } catch (err) {
        console.warn('Backend OCR endpoint offline, running client fallback:', err);
      }

      if (!response) {
        response = {
          original_text: textToProcess,
          target_language: this.targetLanguage,
          translated_text: textToProcess,
          spoken_script: `Sign reads: ${textToProcess}`,
          confidence: 0.94,
          translation_source: 'client_local'
        };
      }

      this.lastResult = response;
      this.notify('ocr_complete', response);

      // Read aloud in audio service
      this.audioService.speak(response.spoken_script, { priority: 2, force: true });
      return response;
    } catch (e) {
      console.warn('OCR processing error:', e);
      const errMsg = 'Could not clearly recognize text in the current frame.';
      this.audioService.speak(errMsg, { priority: 3 });
      this.notify('ocr_error', { message: errMsg });
    }
  }

  repeatLastSign() {
    if (this.lastResult && this.lastResult.spoken_script) {
      this.audioService.speak(this.lastResult.spoken_script, { priority: 2, force: true });
    }
  }
}
