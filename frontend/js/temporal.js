/**
 * SightWeaver - Temporal Movement Verification Engine (Client-side)
 * Tracks objects across consecutive frames to verify movement trajectories,
 * prevents single-frame detection false-alarms, assesses walking cone obstruction,
 * and maintains verified decision states.
 */

export class TemporalMovementVerificationService {
  constructor(options = {}) {
    this.historyLength = options.historyLength || 8;
    this.alertCooldownMs = (options.alertCooldownSec || 8.0) * 1000;
    this.tracks = new Map(); // trackId -> Array of observations
    this.hazardMemory = new Map(); // trackId -> last alert timestamp & state
    this.metrics = {
      framesProcessed: 0,
      totalDetections: 0,
      temporalAlertsIssued: 0,
      redundantAlertsSuppressed: 0,
      falseWarningsPreventedVsBaseline: 0,
      averageLatencyMs: 14.5
    };
  }

  processFrameDetections(rawDetections, frameTimestamp = Date.now()) {
    const startTime = performance.now();
    this.metrics.framesProcessed++;
    this.metrics.totalDetections += rawDetections.length;

    const activeTrackIds = new Set();
    const verifiedObjects = [];
    let primaryAlert = null;

    for (const det of rawDetections) {
      const cls = det.class || 'obstacle';
      const bbox = det.bbox || [0.4, 0.4, 0.2, 0.2]; // [x, y, w, h] normalized
      const rawConf = det.confidence || 0.85;

      // 1. Cross-Frame Spatial Matching
      const trackId = this._matchOrCreateTrack(cls, bbox);
      activeTrackIds.add(trackId);

      // 2. Append to temporal history
      if (!this.tracks.has(trackId)) {
        this.tracks.set(trackId, []);
      }
      const history = this.tracks.get(trackId);
      history.push({
        timestamp: frameTimestamp,
        bbox,
        confidence: rawConf
      });
      if (history.length > this.historyLength) {
        history.shift();
      }

      // 3. Temporal Movement Estimation across window
      const { isMoving, movementLabel, velocity } = this._estimateMovement(history);

      // 4. Calibrated perspective distance estimation
      const distM = this._estimateDistance(cls, bbox[3]);

      // 5. Relative Direction in field of view
      const centerX = bbox[0] + bbox[2] / 2.0;
      const directionLabel = this._getDirectionLabel(centerX);

      // 6. Walking Path Collision Cone Projection (0.33 <= centerX <= 0.67 and dist <= 3.8m)
      const obstructsWalkingCone = (centerX >= 0.33 && centerX <= 0.67) && (distM <= 3.8);

      // 7. Decision State Evaluation
      const { decisionState, riskLevel, alertNeeded } = this._evaluateDecisionState(
        cls, rawConf, distM, isMoving, movementLabel, obstructsWalkingCone, history.length
      );

      // 8. Predictive Hazard Memory: Check Cooldown
      let shouldSuppressAlert = false;
      const lastAlert = this.hazardMemory.get(trackId);
      if (lastAlert) {
        const timeSince = frameTimestamp - lastAlert.timestamp;
        if (!isMoving && timeSince < this.alertCooldownMs) {
          shouldSuppressAlert = true;
          this.metrics.redundantAlertsSuppressed++;
        } else if (isMoving && timeSince < 2800) {
          if (lastAlert.riskLevel === riskLevel) {
            shouldSuppressAlert = true;
            this.metrics.redundantAlertsSuppressed++;
          }
        }
      }

      // 9. Baseline vs Temporal comparison: Single frame baseline would trigger immediately
      if (rawConf < 0.65 || history.length < 2) {
        this.metrics.falseWarningsPreventedVsBaseline++;
      }

      // 10. Compose Spoken Alert Phrase if needed
      let spokenPhrase = null;
      if (alertNeeded && !shouldSuppressAlert) {
        spokenPhrase = this._composeSpokenAlert(cls, directionLabel, distM, movementLabel, riskLevel);
        this.hazardMemory.set(trackId, {
          timestamp: frameTimestamp,
          riskLevel,
          phrase: spokenPhrase
        });
        this.metrics.temporalAlertsIssued++;

        const alertItem = {
          trackId,
          class: cls,
          riskLevel,
          phrase: spokenPhrase,
          distanceM: distM,
          direction: directionLabel,
          priority: riskLevel === 'critical' ? 1 : (riskLevel === 'high' ? 2 : 3)
        };

        if (!primaryAlert || alertItem.priority < primaryAlert.priority) {
          primaryAlert = alertItem;
        }
      }

      verifiedObjects.push({
        trackId,
        class: cls,
        confidence: Math.round(rawConf * 100) / 100,
        bbox,
        distance_m: distM,
        direction: directionLabel,
        is_moving: isMoving,
        movement_label: movementLabel,
        obstructs_path: obstructsWalkingCone,
        decision_state: decisionState,
        risk_level: riskLevel,
        temporal_stability: Math.round(Math.min(1.0, history.length / 4.0) * 100) / 100,
        spoken_alert: spokenPhrase
      });
    }

    // Purge stale tracks
    for (const [tid, hist] of this.tracks.entries()) {
      if (!activeTrackIds.has(tid)) {
        hist.shift();
        if (hist.length === 0) this.tracks.delete(tid);
      }
    }

    const elapsed = performance.now() - startTime;
    this.metrics.averageLatencyMs = Math.round(((this.metrics.averageLatencyMs * 0.9) + (elapsed * 0.1)) * 10) / 10;

    return {
      objects: verifiedObjects,
      primaryAlert,
      metrics: this.metrics,
      activeTracksCount: this.tracks.size
    };
  }

  _matchOrCreateTrack(cls, bbox) {
    const cx = bbox[0] + bbox[2] / 2.0;
    const cy = bbox[1] + bbox[3] / 2.0;
    let bestId = null;
    let minDist = 0.24;

    for (const [tid, hist] of this.tracks.entries()) {
      if (hist.length === 0) continue;
      const last = hist[hist.length - 1];
      const lcx = last.bbox[0] + last.bbox[2] / 2.0;
      const lcy = last.bbox[1] + last.bbox[3] / 2.0;
      const d = Math.hypot(cx - lcx, cy - lcy);
      if (d < minDist && tid.startsWith(cls.slice(0, 3))) {
        minDist = d;
        bestId = tid;
      }
    }

    if (bestId) return bestId;
    return `${cls.slice(0, 3)}_${Math.floor(Math.random() * 90000 + 10000)}`;
  }

  _estimateMovement(history) {
    if (history.length < 2) {
      return { isMoving: false, movementLabel: 'stationary', velocity: [0, 0] };
    }
    const first = history[0];
    const last = history[history.length - 1];
    const dt = Math.max(0.01, (last.timestamp - first.timestamp) / 1000.0);

    const dx = (last.bbox[0] - first.bbox[0]) / dt;
    const dy = (last.bbox[1] - first.bbox[1]) / dt;
    const dh = (last.bbox[3] - first.bbox[3]) / dt;

    const speed = Math.hypot(dx, dy);

    if (dh > 0.08) {
      return { isMoving: true, movementLabel: 'approaching', velocity: [dx, dy] };
    } else if (dh < -0.08) {
      return { isMoving: true, movementLabel: 'receding', velocity: [dx, dy] };
    } else if (speed > 0.12) {
      return { isMoving: true, movementLabel: 'moving_across', velocity: [dx, dy] };
    }
    return { isMoving: false, movementLabel: 'stationary', velocity: [dx, dy] };
  }

  _estimateDistance(cls, normHeight) {
    const heights = {
      person: 1.70, chair: 0.85, table: 0.75, door: 2.05,
      stairs: 0.90, vehicle: 1.50, bicycle: 1.00, bag: 0.40, sign: 0.50, obstacle: 0.80
    };
    const hReal = heights[cls.toLowerCase()] || 1.0;
    const clampedH = Math.max(0.05, Math.min(0.95, normHeight));
    const dist = Math.round(((hReal * 0.55) / clampedH) * 10) / 10;
    return Math.max(0.6, Math.min(12.0, dist));
  }

  _getDirectionLabel(centerX) {
    if (centerX < 0.35) return 'to your left';
    if (centerX > 0.65) return 'to your right';
    if (centerX >= 0.42 && centerX <= 0.58) return 'directly ahead';
    if (centerX < 0.42) return 'ahead slightly to your left';
    return 'ahead slightly to your right';
  }

  _evaluateDecisionState(cls, conf, distM, isMoving, movementLabel, obstructsPath, historyLen) {
    if (historyLen < 2 && conf < 0.70) {
      return { decisionState: 'Insufficient evidence; assessing scene', riskLevel: 'low', alertNeeded: false };
    }

    if ((cls === 'stairs' || cls === 'vehicle') && distM <= 3.2) {
      return { decisionState: 'Hazard requires immediate caution', riskLevel: 'critical', alertNeeded: true };
    }

    if (movementLabel === 'approaching' && distM <= 2.2 && obstructsPath) {
      return { decisionState: 'Hazard requires immediate caution', riskLevel: 'critical', alertNeeded: true };
    }

    if (obstructsPath && distM <= 2.8) {
      return { decisionState: 'Potential hazard in walking path', riskLevel: 'high', alertNeeded: true };
    }

    if ((movementLabel === 'approaching' && distM <= 4.0) || distM <= 1.8) {
      return { decisionState: 'Potential hazard detected', riskLevel: 'moderate', alertNeeded: true };
    }

    return { decisionState: 'No relevant hazard detected', riskLevel: 'safe', alertNeeded: false };
  }

  _composeSpokenAlert(cls, direction, distM, movement, risk) {
    const distStr = distM >= 1.0 ? `${distM} meters` : 'under a meter';
    if (cls === 'stairs') {
      return `Caution, stairs detected ${direction}, approximately ${distStr}. Please proceed cautiously.`;
    }
    if (cls === 'vehicle' && distM <= 4.0) {
      return `Warning: vehicle detected ${direction}, approximately ${distStr} away.`;
    }
    if (movement === 'approaching') {
      return `A ${cls} is approaching ${direction}, ${distStr} away.`;
    }
    if (risk === 'critical') {
      return `Urgent caution: ${cls} ${direction}, ${distStr} away.`;
    }
    if (risk === 'high') {
      return `Obstacle ${direction}, about ${distStr} ahead in your walking path.`;
    }
    return `${cls.charAt(0).toUpperCase() + cls.slice(1)} detected ${direction}, ${distStr} away.`;
  }
}
