/**
 * SightWeaver - Voice Command & Speech Recognition Engine
 * Handles microphone activation, continuous/push-to-talk speech recognition,
 * natural language intent classification, and triggers actual application functions.
 */

export class VoiceCommandService {
  constructor(appContext) {
    this.ctx = appContext;
    this.recognition = null;
    this.isListening = false;
    this.selectedLanguage = 'en-US';
    this.transcriptDisplay = null;
    this.micButton = null;
    this.subscribers = [];

    this._initSpeechRecognition();
  }

  setUIElements(micBtn, transcriptEl) {
    this.micButton = micBtn;
    this.transcriptDisplay = transcriptEl;
  }

  subscribe(callback) {
    this.subscribers.push(callback);
  }

  notify(event, data) {
    this.subscribers.forEach(cb => cb(event, data));
  }

  _initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = false;
      this.recognition.interimResults = true;
      this.recognition.lang = this.selectedLanguage;

      this.recognition.onstart = () => {
        this.isListening = true;
        this._updateUIState(true);
        this.notify('listening_started', {});
      };

      this.recognition.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }

        const text = finalTranscript || interimTranscript;
        if (this.transcriptDisplay && text) {
          this.transcriptDisplay.textContent = `"${text}"`;
        }

        if (finalTranscript) {
          this.processCommand(finalTranscript);
        }
      };

      this.recognition.onerror = (e) => {
        console.warn('Speech recognition error:', e.error);
        this.isListening = false;
        this._updateUIState(false);
        this.notify('recognition_error', { error: e.error });
      };

      this.recognition.onend = () => {
        this.isListening = false;
        this._updateUIState(false);
        this.notify('listening_ended', {});
      };
    } else {
      console.log('Web SpeechRecognition API not supported in this browser. Typed fallback available.');
    }
  }

  toggleListening() {
    if (!this.recognition) {
      this._promptTypedCommand();
      return;
    }
    if (this.isListening) {
      this.recognition.stop();
    } else {
      try {
        this.recognition.lang = this.selectedLanguage;
        this.recognition.start();
      } catch (err) {
        console.warn('Failed to start speech recognition:', err);
      }
    }
  }

  setLanguage(langTag) {
    this.selectedLanguage = langTag;
    if (this.recognition) {
      this.recognition.lang = langTag;
    }
  }

  _updateUIState(listening) {
    if (this.micButton) {
      if (listening) this.micButton.classList.add('listening');
      else this.micButton.classList.remove('listening');
    }
    if (this.ctx && this.ctx.spectaclesHUD) {
      this.ctx.spectaclesHUD.setMicActive(listening);
    }
  }

  _promptTypedCommand() {
    const cmd = prompt('Voice recognition not active. Enter command (e.g. "Take me to classroom", "Read sign", "Switch to Kannada"):');
    if (cmd) this.processCommand(cmd);
  }

  /**
   * Main Command Parser & Intent Classifier
   */
  async processCommand(rawText) {
    const text = rawText.toLowerCase().trim();
    if (this.transcriptDisplay) {
      this.transcriptDisplay.textContent = `Command recognized: "${rawText}"`;
    }

    this.notify('command_recognized', { text: rawText });

    // 1. Navigation / Destination Intents
    if (text.includes('take me to') || text.includes('navigate to') || text.includes('go to') || text.includes('walk to')) {
      const destQuery = text.replace(/take me to|navigate to|go to|walk to/g, '').replace(/my /g, '').trim();
      return this._executeNavigation(destQuery);
    }

    // 2. Stop Navigation
    if (text.includes('stop navigation') || text.includes('end route') || text.includes('cancel route') || text.includes('stop assistance')) {
      if (this.ctx.navigationService) {
        this.ctx.navigationService.stopNavigation();
      }
      return;
    }

    // 3. Pause & Resume Assistance
    if (text.includes('pause assistance') || text.includes('pause guidance') || text === 'pause') {
      if (this.ctx.navigationService) this.ctx.navigationService.pauseAssistance();
      return;
    }
    if (text.includes('resume assistance') || text.includes('resume guidance') || text === 'resume') {
      if (this.ctx.navigationService) this.ctx.navigationService.resumeAssistance();
      return;
    }

    // 4. Repeat Instruction
    if (text.includes('repeat') || text.includes('say again') || text.includes('what was that')) {
      if (this.ctx.navigationService) {
        this.ctx.navigationService.repeatCurrentInstruction();
      } else if (this.ctx.audioService) {
        this.ctx.audioService.repeatLast();
      }
      return;
    }

    // 5. Environmental Description / "What is in front of me?"
    if (text.includes('what is in front of me') || text.includes('describe surroundings') || text.includes('what do you see') || text.includes('describe environment')) {
      this._executeSurroundingsDescription();
      return;
    }

    // 6. OCR / "Read that sign"
    if (text.includes('read that sign') || text.includes('read sign') || text.includes('read text') || text.includes('read this sign')) {
      if (this.ctx.ocrService) {
        this.ctx.ocrService.triggerReadSign();
      }
      return;
    }

    // 7. Language Switching Intent (e.g. "Switch to Kannada", "Speak in Tamil")
    if (text.includes('switch to') || text.includes('speak in') || text.includes('change language to')) {
      const langName = text.replace(/switch to|speak in|change language to/g, '').trim();
      return this._executeLanguageSwitch(langName);
    }

    // 8. Place Memory Intent: "Remember this place as..."
    if (text.includes('remember this place as') || text.includes('save this place as') || text.includes('save location as')) {
      const placeName = text.replace(/remember this place as|save this place as|save location as/g, '').trim();
      return this._executeSaveCurrentPlace(placeName);
    }

    // 9. Camera Controls
    if (text.includes('start camera') || text.includes('turn on camera')) {
      if (this.ctx.cameraService) this.ctx.cameraService.requestLiveCamera();
      return;
    }
    if (text.includes('stop camera') || text.includes('turn off camera')) {
      if (this.ctx.cameraService) this.ctx.cameraService.stopCamera();
      return;
    }

    // 10. Emergency SOS / Contact Trusted Person
    if (text.includes('help') || text.includes('emergency') || text.includes('contact trusted') || text.includes('sos')) {
      if (this.ctx.contactService) this.ctx.contactService.triggerSOS();
      return;
    }

    // 11. Generic fallback
    if (this.ctx.audioService) {
      this.ctx.audioService.speak(`Received: "${rawText}". Say "Take me to classroom", "Read sign", or "What is in front of me".`, { priority: 4 });
    }
  }

  async _executeNavigation(destQuery) {
    if (!this.ctx.navigationService) return;
    await this.ctx.navigationService.startDestinationGuidance(destQuery);
  }

  _executeSurroundingsDescription() {
    if (!this.ctx.visionService || !this.ctx.audioService) return;
    const objects = this.ctx.visionService.currentObjects || [];
    if (objects.length === 0) {
      this.ctx.audioService.speak('The path ahead appears clear. No immediate obstacles detected within 5 meters.', { priority: 3, force: true });
      return;
    }

    const descriptions = objects.map(o => `${o.class} ${o.direction}, about ${o.distance_m} meters away`);
    const speech = `In front of you: ${descriptions.join(', ')}.`;
    this.ctx.audioService.speak(speech, { priority: 3, force: true });
  }

  _executeLanguageSwitch(langName) {
    if (!this.ctx.languageCatalog) return;
    const found = this.ctx.languageCatalog.find(l => l.name.toLowerCase().includes(langName) || l.native.toLowerCase().includes(langName));
    if (found) {
      if (this.ctx.audioService) this.ctx.audioService.setLanguage(found.code);
      this.setLanguage(found.code);
      const msg = `Language switched to ${found.name}. Spoken navigation and assistance updated.`;
      if (this.ctx.audioService) this.ctx.audioService.speak(msg, { priority: 2, force: true });
      this.notify('language_switched', { language: found });
    } else {
      if (this.ctx.audioService) this.ctx.audioService.speak(`Language "${langName}" not recognized in catalog.`, { priority: 3 });
    }
  }

  async _executeSaveCurrentPlace(placeName) {
    if (!this.ctx.placesService || !placeName) return;
    const newPlace = await this.ctx.placesService.addPlace({
      name: placeName.charAt(0).toUpperCase() + placeName.slice(1),
      category: 'Saved Voice Place',
      address: 'Current Location',
      accessibility_notes: 'Saved via voice command'
    });
    const msg = `Remembered this location as ${newPlace.name}. You can now navigate here anytime.`;
    if (this.ctx.audioService) this.ctx.audioService.speak(msg, { priority: 2, force: true });
  }
}
