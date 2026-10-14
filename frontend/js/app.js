/**
 * SightWeaver - Master Application Controller (app.js)
 * Bootstraps all subsystems, binds UI interactions, handles view routing,
 * initializes icons, and connects voice/vision/audio into a cohesive experience.
 */

import { VERIFIED_LANGUAGES_CATALOG, searchLanguages, getLanguageByCode } from './languages.js';
import { CameraService } from './camera.js';
import { SpectaclesHUD } from './spectacles.js';
import { TemporalMovementVerificationService } from './temporal.js';
import { HazardMemoryService } from './hazard_memory.js';
import { VisionService } from './vision.js';
import { AudioPriorityService } from './audio.js';
import { PlaceMemoryService } from './places.js';
import { NavigationSessionService } from './navigation.js';
import { VoiceCommandService } from './voice_control.js';
import { OCRService } from './ocr.js';
import { TrustedContactService } from './contacts.js';
import { ResearchLabService } from './research.js';
import { PresentationModeService } from './presentation.js';
import { SettingsService } from './settings.js';

class SightWeaverApp {
  constructor() {
    // 1. Core Services Initialization
    this.audioService = new AudioPriorityService();
    this.settingsService = new SettingsService(this.audioService);
    this.cameraService = new CameraService();
    this.spectaclesHUD = new SpectaclesHUD('spectacles-chassis');
    this.temporalService = new TemporalMovementVerificationService();
    this.hazardMemoryService = new HazardMemoryService();
    this.visionService = new VisionService(this.cameraService, this.temporalService, this.hazardMemoryService);
    this.placesService = new PlaceMemoryService();
    this.navigationService = new NavigationSessionService(this.placesService, this.audioService, this.spectaclesHUD);
    this.ocrService = new OCRService(this.cameraService, this.audioService);
    this.contactsService = new TrustedContactService(this.audioService);
    this.researchLab = new ResearchLabService(this.temporalService, this.hazardMemoryService);

    // App Context bundle for voice and presentation services
    this.appContext = {
      audioService: this.audioService,
      settingsService: this.settingsService,
      cameraService: this.cameraService,
      spectaclesHUD: this.spectaclesHUD,
      temporalService: this.temporalService,
      hazardMemoryService: this.hazardMemoryService,
      visionService: this.visionService,
      placesService: this.placesService,
      navigationService: this.navigationService,
      ocrService: this.ocrService,
      contactService: this.contactsService,
      languageCatalog: VERIFIED_LANGUAGES_CATALOG
    };

    this.voiceService = new VoiceCommandService(this.appContext);
    this.presentationService = new PresentationModeService(this.appContext);

    this.currentTab = 'tab-glasses';
  }

  async init() {
    console.log('Initializing SightWeaver AI Assistive Platform...');

    // Load asynchronous records (places, routes, contacts)
    await Promise.all([
      this.placesService.loadAll(),
      this.contactsService.loadContacts()
    ]);

    // Attach Video Element
    const videoEl = document.getElementById('camera-stream-video');
    if (videoEl) this.cameraService.setVideoElement(videoEl);

    // Connect Camera Frame Pipe to Spectacles Dual Lenses
    this.cameraService.subscribe((event, data) => {
      if (event === 'sim_frame_ready' && data.canvas) {
        this.spectaclesHUD.renderFrame(data.canvas);
      } else if (event === 'camera_started') {
        const fallbackCard = document.getElementById('camera-fallback-card');
        if (fallbackCard) fallbackCard.style.display = 'none';
      } else if (event === 'camera_error') {
        console.warn('Camera fallback to simulation active.');
      }
    });

    // Connect Vision Detections to Spectacles HUD and Audio Priority Alerting
    this.visionService.subscribe((event, data) => {
      if (event === 'detections_updated') {
        this.spectaclesHUD.updateDetections(data.objects);

        // If a high-priority alert was generated, route through AudioPriorityService
        if (data.primaryAlert && data.primaryAlert.phrase) {
          this.audioService.speak(data.primaryAlert.phrase, {
            priority: data.primaryAlert.priority
          });
        }

        // Check if an obstacle is completely blocking the walking path
        const urgentBlocker = data.objects.find(o => o.risk_level === 'critical' && o.obstructs_path && o.distance_m <= 1.8);
        if (urgentBlocker && this.navigationService.isActive && !this.navigationService.isObstructed) {
          this.navigationService.handlePathObstructed(urgentBlocker);
        }

        this._updateHUDTelemetry(data);
      }
    });

    // Connect Audio State to Spectacles Indicators
    this.audioService.subscribe((event, data) => {
      if (event === 'speaking_start') {
        this.spectaclesHUD.setAudioSpeaking(true);
        this._updateAudioIndicatorText(data.text);
      } else if (event === 'speaking_end') {
        this.spectaclesHUD.setAudioSpeaking(false);
      }
    });

    // Bind UI controls, tabs, modals, and quick voice chips
    this._bindTabNavigation();
    this._bindSpectaclesControls();
    this._bindNavigationDashboard();
    this._bindVoiceControls();
    this._bindLanguageCatalogUI();
    this._bindOCRUI();
    this._bindPlacesUI();
    this._bindContactsUI();
    this._bindResearchLabUI();
    this._bindPresentationUI();
    this._bindSettingsUI();
    this._bindOnboardingModal();

    // Start in Demo Environment Mode by default so it works immediately out of the box
    this.cameraService.startDemoEnvironment();
    this.spectaclesHUD.setMode('demo');
    this.visionService.start();

    // Render Initial Places & Language catalog
    this._renderPlacesList();
    this._renderLanguageSelector();

    // Check if onboarding completed before
    if (!localStorage.getItem('sightweaver_onboarding_done')) {
      const modal = document.getElementById('onboarding-modal');
      if (modal) modal.classList.add('active');
    }

    console.log('SightWeaver Subsystems Active and Ready.');
  }

  _bindTabNavigation() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetViewId = btn.getAttribute('data-target');
        this.switchTab(targetViewId, btn);
      });
    });
  }

  switchTab(targetViewId, activeBtn = null) {
    // Hide all view sections
    document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));
    // Deselect tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));

    const targetSec = document.getElementById(targetViewId);
    if (targetSec) targetSec.classList.add('active');

    if (activeBtn) {
      activeBtn.classList.add('active');
    } else {
      const matchingBtn = document.querySelector(`.tab-btn[data-target="${targetViewId}"]`);
      if (matchingBtn) matchingBtn.classList.add('active');
    }

    this.currentTab = targetViewId;
  }

  _bindSpectaclesControls() {
    const modeBtns = document.querySelectorAll('.mode-btn');
    modeBtns.forEach(btn => {
      btn.addEventListener('click', async () => {
        modeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const mode = btn.getAttribute('data-mode');
        if (mode === 'live') {
          await this.cameraService.requestLiveCamera();
          this.spectaclesHUD.setMode('live');
        } else if (mode === 'wearable') {
          this.spectaclesHUD.setMode('wearable');
        } else {
          this.cameraService.startDemoEnvironment();
          this.spectaclesHUD.setMode('demo');
        }
      });
    });

    const flipBtn = document.getElementById('btn-flip-camera');
    if (flipBtn) {
      flipBtn.addEventListener('click', () => this.cameraService.toggleFacingMode());
    }

    const startCameraBtn = document.getElementById('btn-start-camera-prompt');
    if (startCameraBtn) {
      startCameraBtn.addEventListener('click', () => this.cameraService.requestLiveCamera());
    }

    const useDemoBtn = document.getElementById('btn-use-demo-prompt');
    if (useDemoBtn) {
      useDemoBtn.addEventListener('click', () => {
        this.cameraService.startDemoEnvironment();
        this.spectaclesHUD.setMode('demo');
      });
    }
  }

  _bindVoiceControls() {
    const micBtn = document.getElementById('hero-mic-btn');
    const transcriptEl = document.getElementById('voice-heard-text');
    this.voiceService.setUIElements(micBtn, transcriptEl);

    if (micBtn) {
      micBtn.addEventListener('click', () => this.voiceService.toggleListening());
    }

    // Quick Voice Chips
    const chips = document.querySelectorAll('.chip-cmd');
    chips.forEach(chip => {
      chip.addEventListener('click', () => {
        const cmd = chip.getAttribute('data-cmd') || chip.textContent.replace(/"/g, '').trim();
        this.voiceService.processCommand(cmd);
      });
    });

    // Typed Command Input
    const cmdInput = document.getElementById('typed-cmd-input');
    const cmdSubmitBtn = document.getElementById('btn-submit-typed-cmd');
    if (cmdSubmitBtn && cmdInput) {
      cmdSubmitBtn.addEventListener('click', () => {
        if (cmdInput.value.trim()) {
          this.voiceService.processCommand(cmdInput.value.trim());
          cmdInput.value = '';
        }
      });
      cmdInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && cmdInput.value.trim()) {
          this.voiceService.processCommand(cmdInput.value.trim());
          cmdInput.value = '';
        }
      });
    }
  }

  _bindNavigationDashboard() {
    const startNavBtn = document.getElementById('btn-start-nav-select');
    const selectDest = document.getElementById('nav-destination-select');
    if (startNavBtn && selectDest) {
      startNavBtn.addEventListener('click', () => {
        const destId = selectDest.value;
        const place = this.placesService.places.find(p => p.id === destId);
        if (place) {
          this.navigationService.startDestinationGuidance(place.name);
          this.switchTab('tab-navigation');
        }
      });
    }

    const pauseBtn = document.getElementById('nav-pause-btn');
    if (pauseBtn) pauseBtn.addEventListener('click', () => this.navigationService.pauseAssistance());

    const resumeBtn = document.getElementById('nav-resume-btn');
    if (resumeBtn) resumeBtn.addEventListener('click', () => this.navigationService.resumeAssistance());

    const repeatBtn = document.getElementById('nav-repeat-btn');
    if (repeatBtn) repeatBtn.addEventListener('click', () => this.navigationService.repeatCurrentInstruction());

    const stopBtn = document.getElementById('nav-stop-btn');
    if (stopBtn) stopBtn.addEventListener('click', () => this.navigationService.stopNavigation());

    // Navigation Session Updates to UI
    this.navigationService.subscribe((event, data) => {
      this._updateNavigationUI(event, data);
    });
  }

  _updateNavigationUI(event, data) {
    const destNameEl = document.getElementById('nav-active-dest-name');
    const currInstructionEl = document.getElementById('nav-current-instruction');
    const progressFill = document.getElementById('nav-progress-bar-fill');
    const progressText = document.getElementById('nav-progress-percent');
    const distanceText = document.getElementById('nav-distance-remaining');
    const navStatusBadge = document.getElementById('nav-status-badge');

    if (event === 'session_started') {
      if (destNameEl) destNameEl.textContent = data.destination.name;
      if (currInstructionEl) currInstructionEl.textContent = data.firstInstruction.instruction;
      if (navStatusBadge) {
        navStatusBadge.className = 'badge badge-green';
        navStatusBadge.textContent = 'Active Guidance';
      }
      if (progressFill) progressFill.style.width = '10%';
      if (progressText) progressText.textContent = '10%';
    } else if (event === 'waypoint_updated') {
      if (currInstructionEl) currInstructionEl.textContent = data.waypoint.instruction;
      if (progressFill) progressFill.style.width = `${data.progressPercent}%`;
      if (progressText) progressText.textContent = `${data.progressPercent}%`;
      if (distanceText) distanceText.textContent = `${data.completedDistanceMeters}m traversed`;
    } else if (event === 'destination_reached') {
      if (currInstructionEl) currInstructionEl.textContent = `Arrived at ${data.destination.name}!`;
      if (navStatusBadge) {
        navStatusBadge.className = 'badge badge-cyan';
        navStatusBadge.textContent = 'Arrived';
      }
      if (progressFill) progressFill.style.width = '100%';
    } else if (event === 'session_paused') {
      if (navStatusBadge) {
        navStatusBadge.className = 'badge badge-amber';
        navStatusBadge.textContent = 'Paused';
      }
    } else if (event === 'session_stopped') {
      if (currInstructionEl) currInstructionEl.textContent = 'Navigation in standby. Say "Take me to classroom" to begin.';
      if (navStatusBadge) {
        navStatusBadge.className = 'badge badge-violet';
        navStatusBadge.textContent = 'Standby';
      }
      if (progressFill) progressFill.style.width = '0%';
    }
  }

  _bindLanguageCatalogUI() {
    const searchInput = document.getElementById('language-search-input');
    const regionFilter = document.getElementById('language-region-filter');

    if (searchInput) {
      searchInput.addEventListener('input', () => this._renderLanguageSelector());
    }
    if (regionFilter) {
      regionFilter.addEventListener('change', () => this._renderLanguageSelector());
    }

    const testVoiceBtn = document.getElementById('btn-test-language-voice');
    if (testVoiceBtn) {
      testVoiceBtn.addEventListener('click', () => {
        const langCode = document.getElementById('selected-spoken-nav-lang').value;
        const langObj = getLanguageByCode(langCode);
        const phrase = langObj && langObj.native ? `Testing ${langObj.name} voice: ${langObj.native}` : 'Testing voice output.';
        this.audioService.speak(phrase, { priority: 2, force: true });
      });
    }

    // Separate Language Selectors
    ['interface-lang', 'voice-cmd-lang', 'spoken-nav-lang', 'ocr-target-lang'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('change', (e) => {
          const val = e.target.value;
          if (id === 'spoken-nav-lang') {
            this.audioService.setLanguage(val);
            this.settingsService.update('spokenNavigationLanguage', val);
          } else if (id === 'voice-cmd-lang') {
            this.voiceService.setLanguage(val);
            this.settingsService.update('voiceCommandLanguage', val);
          } else if (id === 'ocr-target-lang') {
            this.ocrService.setTargetLanguage(val);
            this.settingsService.update('ocrTargetLanguage', val);
          }
        });
      }
    });
  }

  _renderLanguageSelector() {
    const query = document.getElementById('language-search-input')?.value || '';
    const region = document.getElementById('language-region-filter')?.value || 'all';

    let list = searchLanguages(query);
    if (region !== 'all') {
      list = list.filter(l => (l.region && l.region.toLowerCase().includes(region.toLowerCase())) ||
                              (l.family && l.family.toLowerCase().includes(region.toLowerCase())));
    }

    const container = document.getElementById('language-catalog-grid');
    const countBadge = document.getElementById('catalog-count-badge');
    if (countBadge) countBadge.textContent = `${list.length} Languages`;

    if (!container) return;

    container.innerHTML = list.slice(0, 75).map(l => {
      const isIndian = l.region && l.region.toLowerCase().includes('india');
      return `
        <div class="sw-card" style="padding: 0.85rem; display: flex; flex-direction: column; justify-content: space-between;">
          <div>
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.35rem;">
              <strong style="font-size: 0.95rem; color: #fff;">${l.name}</strong>
              <span class="badge ${isIndian ? 'badge-green' : 'badge-cyan'}">${l.code.toUpperCase()}</span>
            </div>
            <div style="font-size: 1.15rem; color: var(--cyan-primary); font-family: var(--font-main); margin-bottom: 0.25rem;">
              ${l.native}
            </div>
            <div style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 0.5rem;">
              ${l.region || 'Global'} • ${l.family || 'Language'}
            </div>
          </div>
          <div style="display: flex; gap: 0.35rem; margin-top: 0.5rem;">
            <button class="btn btn-outline" style="padding: 0.3rem 0.6rem; font-size: 0.72rem; flex: 1;" onclick="window.sightweaver.selectLanguage('${l.code}', '${l.name}')">
              Select
            </button>
            <button class="btn btn-outline" style="padding: 0.3rem 0.5rem; font-size: 0.72rem;" title="Test Voice" onclick="window.sightweaver.testVoiceSample('${l.code}')">
              🔊
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  _bindOCRUI() {
    const triggerScanBtn = document.getElementById('btn-trigger-ocr');
    if (triggerScanBtn) {
      triggerScanBtn.addEventListener('click', () => {
        const customText = document.getElementById('ocr-test-sign-select')?.value;
        this.ocrService.triggerReadSign(customText);
      });
    }

    const repeatSignBtn = document.getElementById('btn-repeat-ocr');
    if (repeatSignBtn) {
      repeatSignBtn.addEventListener('click', () => this.ocrService.repeatLastSign());
    }

    this.ocrService.subscribe((event, data) => {
      if (event === 'ocr_complete') {
        const extractedEl = document.getElementById('ocr-extracted-text');
        const translatedEl = document.getElementById('ocr-translated-text');
        const confEl = document.getElementById('ocr-confidence-score');
        const spokenEl = document.getElementById('ocr-spoken-script');

        if (extractedEl) extractedEl.textContent = data.original_text;
        if (translatedEl) translatedEl.textContent = data.translated_text;
        if (confEl) confEl.textContent = `${Math.round(data.confidence * 100)}%`;
        if (spokenEl) spokenEl.textContent = `"${data.spoken_script}"`;
      }
    });
  }

  _bindPlacesUI() {
    const addPlaceForm = document.getElementById('add-place-form');
    if (addPlaceForm) {
      addPlaceForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('new-place-name')?.value;
        const category = document.getElementById('new-place-category')?.value;
        const address = document.getElementById('new-place-address')?.value;
        const accessibility = document.getElementById('new-place-notes')?.value;

        if (name) {
          await this.placesService.addPlace({
            name, category, address, accessibility_notes: accessibility
          });
          addPlaceForm.reset();
          this._renderPlacesList();
          this.audioService.speak(`Saved new place: ${name}.`, { priority: 2 });
        }
      });
    }
  }

  _renderPlacesList() {
    const container = document.getElementById('saved-places-container');
    const selectDest = document.getElementById('nav-destination-select');
    if (!container) return;

    if (selectDest) {
      selectDest.innerHTML = this.placesService.places.map(p => `
        <option value="${p.id}">${p.name} (${p.category})</option>
      `).join('');
    }

    container.innerHTML = this.placesService.places.map(p => `
      <div class="sw-card" style="margin-bottom: 0.85rem; padding: 1rem;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.35rem;">
          <div>
            <strong style="font-size: 1rem; color: #fff;">${p.name}</strong>
            <span class="badge badge-cyan" style="margin-left: 0.5rem;">${p.category}</span>
          </div>
          <button class="btn btn-primary" style="padding: 0.35rem 0.85rem; font-size: 0.78rem;" onclick="window.sightweaver.navigateToPlace('${p.name}')">
            Navigate Here
          </button>
        </div>
        <div style="font-size: 0.82rem; color: var(--text-secondary); margin-bottom: 0.25rem;">
          📍 ${p.address} • ${p.floor_info || 'Accessible Ground Floor'}
        </div>
        <div style="font-size: 0.78rem; color: #34d399; margin-top: 0.35rem; display: flex; align-items: center; gap: 0.35rem;">
          ♿ <em>${p.accessibility_notes || 'Step-free route verified'}</em>
        </div>
      </div>
    `).join('');
  }

  _bindContactsUI() {
    const sosBtn = document.getElementById('btn-emergency-sos');
    if (sosBtn) {
      sosBtn.addEventListener('click', async () => {
        if (confirm('Dispatch emergency assistance request with current coordinates to your primary trusted contact?')) {
          const res = await this.contactsService.triggerSOS();
          alert(`${res.message}\n\nNotice: ${res.disclaimer}`);
        }
      });
    }
  }

  _bindResearchLabUI() {
    const runScenarioBtn = document.getElementById('btn-run-research-scenario');
    const scenarioSelect = document.getElementById('research-scenario-select');
    const logContainer = document.getElementById('research-scenario-log');

    if (runScenarioBtn && scenarioSelect) {
      runScenarioBtn.addEventListener('click', () => {
        const scKey = scenarioSelect.value;
        if (logContainer) logContainer.innerHTML = `<div style="color: var(--cyan-primary); padding: 0.5rem 0;">Initiating ${scKey} scenario sequence...</div>`;

        this.researchLab.runScenario(scKey, (step) => {
          if (!logContainer) return;
          const stepEl = document.createElement('div');
          stepEl.style.cssText = 'padding: 0.65rem 0; border-bottom: 1px solid var(--border-subtle); font-size: 0.82rem;';
          stepEl.innerHTML = `
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.25rem;">
              <strong style="color: #fff;">Frame ${step.frame}: ${step.desc}</strong>
              <span class="badge ${step.risk === 'critical' ? 'badge-coral' : (step.risk === 'high' ? 'badge-amber' : 'badge-cyan')}">${step.risk.toUpperCase()}</span>
            </div>
            <div style="color: #f87171; margin-bottom: 0.15rem;">❌ <strong>Baseline Single-Frame:</strong> ${step.baselineAction}</div>
            <div style="color: #34d399;">✅ <strong>SightWeaver Temporal:</strong> ${step.temporalAction}</div>
          `;
          logContainer.prepend(stepEl);
        });
      });
    }
  }

  _bindPresentationUI() {
    const runFullDemoBtn = document.getElementById('btn-run-full-presentation');
    const resetDemoBtn = document.getElementById('btn-reset-presentation');
    const demoStatusCard = document.getElementById('presentation-step-card');

    if (runFullDemoBtn) {
      runFullDemoBtn.addEventListener('click', () => {
        this.switchTab('tab-glasses');
        this.presentationService.startFullDemo();
      });
    }

    if (resetDemoBtn) {
      resetDemoBtn.addEventListener('click', () => {
        this.presentationService.resetDemo();
      });
    }

    this.presentationService.subscribe((stepData) => {
      if (demoStatusCard) {
        demoStatusCard.innerHTML = `
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.4rem;">
            <strong style="color: var(--cyan-primary); font-size: 0.95rem;">Demo Step ${stepData.step || 0}: ${stepData.title}</strong>
            <span class="badge badge-green">LIVE DEMO</span>
          </div>
          <div style="font-size: 0.85rem; color: #fff;">${stepData.narration}</div>
        `;
      }
    });
  }

  _bindSettingsUI() {
    // Theme buttons
    const themeSelect = document.getElementById('setting-theme-select');
    if (themeSelect) {
      themeSelect.addEventListener('change', (e) => this.settingsService.update('theme', e.target.value));
    }

    // Text scaling
    const textScaleSelect = document.getElementById('setting-text-size-select');
    if (textScaleSelect) {
      textScaleSelect.addEventListener('change', (e) => this.settingsService.update('textSize', e.target.value));
    }

    // Motion
    const motionToggle = document.getElementById('setting-reduced-motion-toggle');
    if (motionToggle) {
      motionToggle.addEventListener('change', (e) => this.settingsService.update('reducedMotion', e.target.checked));
    }

    // Speech Rate & Volume
    const speechRate = document.getElementById('setting-speech-rate');
    if (speechRate) {
      speechRate.addEventListener('input', (e) => {
        this.settingsService.update('speechRate', parseFloat(e.target.value));
        const valLabel = document.getElementById('speech-rate-val');
        if (valLabel) valLabel.textContent = `${e.target.value}x`;
      });
    }

    const verbositySelect = document.getElementById('setting-verbosity-select');
    if (verbositySelect) {
      verbositySelect.addEventListener('change', (e) => this.settingsService.update('verbosity', e.target.value));
    }

    // Clear Data
    const clearBtn = document.getElementById('btn-clear-all-data');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (confirm('Clear all local saved places and reset SightWeaver to factory demo configuration?')) {
          this.settingsService.clearAllData();
        }
      });
    }
  }

  _bindOnboardingModal() {
    const modal = document.getElementById('onboarding-modal');
    const closeBtn = document.getElementById('btn-close-onboarding');
    const startDemoBtn = document.getElementById('btn-onboarding-start-demo');

    const finishOnboarding = () => {
      localStorage.setItem('sightweaver_onboarding_done', 'true');
      if (modal) modal.classList.remove('active');
      this.audioService.speak('Welcome to SightWeaver. Autonomous assistance initialized.', { priority: 2 });
    };

    if (closeBtn) closeBtn.addEventListener('click', finishOnboarding);
    if (startDemoBtn) startDemoBtn.addEventListener('click', finishOnboarding);
  }

  _updateHUDTelemetry(data) {
    const trackCountEl = document.getElementById('hud-track-count');
    const latencyEl = document.getElementById('hud-latency-ms');
    const hazardFeedEl = document.getElementById('hazard-timeline-feed');

    if (trackCountEl) trackCountEl.textContent = `${data.activeTracks} Tracks`;
    if (latencyEl && data.metrics) latencyEl.textContent = `${data.metrics.averageLatencyMs || 14}ms`;

    if (hazardFeedEl) {
      this.hazardMemoryService.renderTimeline(hazardFeedEl);
    }
  }

  _updateAudioIndicatorText(text) {
    const liveSpeechEl = document.getElementById('live-spoken-phrase');
    if (liveSpeechEl) {
      liveSpeechEl.textContent = `"${text}"`;
    }
  }
}

// Global bootstrap on DOMContentLoaded
window.addEventListener('DOMContentLoaded', () => {
  const app = new SightWeaverApp();
  window.sightweaver = {
    app,
    navigateToPlace: (name) => {
      app.navigationService.startDestinationGuidance(name);
      app.switchTab('tab-navigation');
    },
    selectLanguage: (code, name) => {
      app.audioService.setLanguage(code);
      app.voiceService.setLanguage(code);
      app.ocrService.setTargetLanguage(code);
      app.audioService.speak(`Language selected: ${name}. Spoken navigation updated.`, { priority: 2, force: true });
    },
    testVoiceSample: (code) => {
      const lang = getLanguageByCode(code);
      const sample = lang && lang.native ? `Testing voice in ${lang.name}: ${lang.native}` : 'Voice output sample.';
      app.audioService.setLanguage(code);
      app.audioService.speak(sample, { priority: 2, force: true });
    }
  };

  app.init();
});
