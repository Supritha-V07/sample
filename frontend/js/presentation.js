/**
 * SightWeaver - Live Hackathon Presentation & Audio Demonstration Engine
 * 1-Click end-to-end synchronized demonstration for hackathon judges:
 * Autonomous hands-free assistance, real-time spectacle vision, temporal hazard alerts,
 * automatic turn instructions, OCR sign translation, and destination arrival.
 */

export class PresentationModeService {
  constructor(appContext) {
    this.ctx = appContext;
    this.isRunning = false;
    this.demoStep = 0;
    this.timer = null;
    this.subscribers = [];
  }

  subscribe(callback) {
    this.subscribers.push(callback);
  }

  notify(stepData) {
    this.subscribers.forEach(cb => cb(stepData));
  }

  startFullDemo() {
    if (this.isRunning) this.stopDemo();
    this.isRunning = true;
    this.demoStep = 0;

    // Switch spectacles to demo environment mode
    if (this.ctx.cameraService) this.ctx.cameraService.startDemoEnvironment();
    if (this.ctx.spectaclesHUD) this.ctx.spectaclesHUD.setMode('demo');
    if (this.ctx.visionService) this.ctx.visionService.start();

    const sequence = [
      {
        step: 1,
        title: 'System Initialization',
        narration: 'SightWeaver smart glasses initialized. Live spatial sensing active in Kannada and English.',
        action: () => {
          this.ctx.audioService.speak('SightWeaver smart glasses initialized. Live spatial sensing active.', { priority: 2, force: true });
        }
      },
      {
        step: 2,
        title: 'Corridor Environmental Assessment',
        narration: 'Scanning academic corridor. Tactile guiding paving detected on floor.',
        action: () => {
          this.ctx.audioService.speak('Corridor scan complete: central tactile path detected ahead.', { priority: 3 });
        }
      },
      {
        step: 3,
        title: 'Autonomous Hands-Free Destination Trigger',
        narration: 'Wearer speaks once: "Take me to my classroom". Guidance begins without further prompts.',
        action: async () => {
          await this.ctx.navigationService.startDestinationGuidance('Room 304 - AI & CS Classroom');
        }
      },
      {
        step: 4,
        title: 'Temporal Movement Hazard Warning',
        narration: 'Approaching pedestrian intersects walking path. Urgent priority alert issued.',
        action: () => {
          this.ctx.audioService.speak('A person is approaching directly ahead, 2.5 meters away. Please slow your pace.', { priority: 1, force: true });
        }
      },
      {
        step: 5,
        title: 'Turn Guidance Progression',
        narration: 'Next waypoint reached automatically as wearer moves forward.',
        action: () => {
          this.ctx.spectaclesHUD.setNavigationTurn({ direction: 'turn_right', instruction: 'Turn right at the upcoming corridor junction.' });
          this.ctx.audioService.speak('Turn right at the upcoming corridor junction toward the west wing.', { priority: 2 });
        }
      },
      {
        step: 6,
        title: 'OCR Sign Reading & Translation',
        narration: 'Wearer reaches doorway. Sign recognized and translated into Kannada.',
        action: async () => {
          this.ctx.ocrService.setTargetLanguage('kn');
          await this.ctx.ocrService.triggerReadSign('Room 304 - Computer Science & AI Lab');
        }
      },
      {
        step: 7,
        title: 'Destination Arrival',
        narration: 'Arrival reliably confirmed at Classroom 304.',
        action: () => {
          this.ctx.spectaclesHUD.setNavigationTurn({ direction: 'arrive', instruction: 'Arrived at Room 304' });
          this.ctx.audioService.speak('You have arrived at your destination: Room 304 AI Classroom. Entrance door with braille plaque is on your right.', { priority: 1, force: true });
          this.isRunning = false;
        }
      }
    ];

    const runStep = () => {
      if (!this.isRunning || this.demoStep >= sequence.length) {
        this.isRunning = false;
        return;
      }

      const item = sequence[this.demoStep];
      this.notify(item);
      item.action();
      this.demoStep++;

      // Cadence between demo beats ~ 6.5s
      this.timer = setTimeout(runStep, 6800);
    };

    runStep();
  }

  stopDemo() {
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.ctx.navigationService) this.ctx.navigationService.stopNavigation();
  }

  resetDemo() {
    this.stopDemo();
    this.demoStep = 0;
    if (this.ctx.audioService) {
      this.ctx.audioService.speak('Demonstration reset to standby state.', { priority: 3, force: true });
    }
    this.notify({ step: 0, title: 'Demo Ready', narration: 'Click "Run Full Hackathon Demo" to begin.' });
  }
}
