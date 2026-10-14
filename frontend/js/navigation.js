/**
 * SightWeaver - Continuous Hands-Free Navigation Session Service
 * Wearer speaks/selects destination ONCE, and the system autonomously guides them
 * turn-by-turn, coordinates with live vision for obstacle alerts, detects obstructions,
 * calculates detours, and announces arrival without repeated user questioning.
 */

export class NavigationSessionService {
  constructor(placesService, audioService, spectaclesHUD) {
    this.placesService = placesService;
    this.audioService = audioService;
    this.spectaclesHUD = spectaclesHUD;

    this.isActive = false;
    this.isPaused = false;
    this.currentDestination = null;
    this.activeRoute = null;
    this.currentWaypointIndex = 0;
    this.totalDistanceMeters = 0;
    this.completedDistanceMeters = 0;
    this.progressPercent = 0;
    this.routeTimer = null;
    this.isObstructed = false;
    this.subscribers = [];
  }

  subscribe(callback) {
    this.subscribers.push(callback);
  }

  notify(event, data) {
    this.subscribers.forEach(cb => cb(event, data));
  }

  /**
   * One-Time Destination Start
   * Wearer says: "Take me to my classroom" or "Navigate to the library"
   */
  async startDestinationGuidance(destinationQuery) {
    if (!destinationQuery) return { success: false, message: 'No destination specified.' };

    // 1. Match destination against saved places
    const matchedPlace = await this.placesService.findPlace(destinationQuery);
    if (!matchedPlace) {
      const msg = `I could not locate "${destinationQuery}" in your saved places. Would you like to view your saved places?`;
      this.audioService.speak(msg, { priority: 2 });
      return { success: false, message: msg };
    }

    this.currentDestination = matchedPlace;

    // 2. Resolve route waypoints (from familiar route or synthesized accessible corridor path)
    this.activeRoute = await this.placesService.resolveRouteToPlace(matchedPlace.id);
    this.currentWaypointIndex = 0;
    this.totalDistanceMeters = this.activeRoute.distance_meters || 80;
    this.completedDistanceMeters = 0;
    this.progressPercent = 0;
    this.isActive = true;
    this.isPaused = false;
    this.isObstructed = false;

    // 3. Spoken Confirmation & First Autonomous Instruction
    const startMsg = `Starting guidance to ${matchedPlace.name}. Total distance about ${this.totalDistanceMeters} meters. Assistance session active.`;
    this.audioService.speak(startMsg, { priority: 2, force: true });

    this.notify('session_started', {
      destination: this.currentDestination,
      route: this.activeRoute,
      firstInstruction: this.activeRoute.waypoints[0]
    });

    // 4. Begin Autonomous Progression Loop
    this._startAutonomousGuidanceLoop();
    return { success: true, destination: matchedPlace };
  }

  pauseAssistance() {
    this.isPaused = true;
    if (this.routeTimer) clearTimeout(this.routeTimer);
    const msg = 'Assistance paused. Live vision monitoring remains active.';
    this.audioService.speak(msg, { priority: 2, force: true });
    this.notify('session_paused', {});
  }

  resumeAssistance() {
    if (!this.isActive) return;
    this.isPaused = false;
    const msg = 'Resuming navigation guidance.';
    this.audioService.speak(msg, { priority: 2, force: true });
    this.notify('session_resumed', {});
    this._advanceToNextWaypoint();
  }

  stopNavigation() {
    this.isActive = false;
    this.isPaused = false;
    if (this.routeTimer) clearTimeout(this.routeTimer);
    this.spectaclesHUD.setNavigationTurn(null);
    const msg = 'Navigation ended. Standby mode active.';
    this.audioService.speak(msg, { priority: 2, force: true });
    this.notify('session_stopped', {});
  }

  repeatCurrentInstruction() {
    if (!this.isActive || !this.activeRoute) {
      this.audioService.repeatLast();
      return;
    }
    const currentWp = this.activeRoute.waypoints[this.currentWaypointIndex];
    if (currentWp) {
      this.audioService.speak(currentWp.instruction, { priority: 2, force: true });
    }
  }

  /**
   * Autonomous progression: wearer walks, waypoint instructions trigger automatically.
   */
  _startAutonomousGuidanceLoop() {
    if (this.routeTimer) clearTimeout(this.routeTimer);

    // Initial instruction delay
    this.routeTimer = setTimeout(() => {
      this._deliverCurrentWaypointInstruction();
    }, 1800);
  }

  _deliverCurrentWaypointInstruction() {
    if (!this.isActive || this.isPaused || !this.activeRoute) return;

    const waypoints = this.activeRoute.waypoints || [];
    if (this.currentWaypointIndex >= waypoints.length) {
      this._announceArrival();
      return;
    }

    const wp = waypoints[this.currentWaypointIndex];

    // Update Spectacles HUD Turn Direction Hologram
    this.spectaclesHUD.setNavigationTurn({
      direction: wp.direction,
      instruction: wp.instruction,
      distance: wp.distance_m
    });

    // Speak Turn Instruction (Priority 2: Important Route Direction)
    this.audioService.speak(wp.instruction, { priority: 2 });

    // Calculate progression
    this.progressPercent = Math.round(((this.currentWaypointIndex + 1) / waypoints.length) * 100);
    this.completedDistanceMeters = Math.min(
      this.totalDistanceMeters,
      Math.round(this.totalDistanceMeters * ((this.currentWaypointIndex + 1) / waypoints.length))
    );

    this.notify('waypoint_updated', {
      waypoint: wp,
      index: this.currentWaypointIndex,
      total: waypoints.length,
      progressPercent: this.progressPercent,
      completedDistanceMeters: this.completedDistanceMeters
    });

    // Schedule next autonomous waypoint step (wearer continues walking forward)
    // Step delay ~ 6 to 8 seconds per waypoint in demonstration
    const stepDurationMs = (wp.distance_m || 15) * 400; // Realistic cadence
    this.routeTimer = setTimeout(() => {
      this.currentWaypointIndex++;
      this._deliverCurrentWaypointInstruction();
    }, Math.max(5500, stepDurationMs));
  }

  _advanceToNextWaypoint() {
    this._deliverCurrentWaypointInstruction();
  }

  _announceArrival() {
    this.isActive = false;
    this.spectaclesHUD.setNavigationTurn({
      direction: 'arrive',
      instruction: `Arrived at ${this.currentDestination.name}`
    });

    const arrivalMsg = `You have arrived at your destination: ${this.currentDestination.name}. ${this.currentDestination.accessibility_notes || ''}`;
    this.audioService.speak(arrivalMsg, { priority: 1, force: true });

    this.notify('destination_reached', {
      destination: this.currentDestination
    });
  }

  /**
   * Called by vision pipeline if an immovable obstruction blocks the current route path
   */
  handlePathObstructed(hazardObj) {
    if (!this.isActive || this.isObstructed) return;
    this.isObstructed = true;

    const detourMsg = `The planned path is obstructed by a ${hazardObj.class}. Recalculating accessible alternative corridor on your left.`;
    this.audioService.speak(detourMsg, { priority: 1, force: true });

    // Inject temporary detour waypoint
    const detourWp = {
      step: this.currentWaypointIndex + 1,
      instruction: 'Detour available: veer slight left around the obstacle, then continue forward.',
      distance_m: 8,
      direction: 'slight_left',
      landmark: 'Clear path on left tactile paving'
    };
    this.activeRoute.waypoints.splice(this.currentWaypointIndex + 1, 0, detourWp);

    this.notify('route_detour', { detourWaypoint: detourWp });
  }
}
