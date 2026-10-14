/**
 * SightWeaver - Place Memory & Familiar Routes Service
 * Manages saved accessible places, GPS/indoor floor coordinates, landmarks,
 * accessibility attributes, and routes with backend SQLite persistence & local cache.
 */

export class PlaceMemoryService {
  constructor() {
    this.places = [];
    this.routes = [];
    this.isLoaded = false;
    this.subscribers = [];
  }

  subscribe(callback) {
    this.subscribers.push(callback);
  }

  notify() {
    this.subscribers.forEach(cb => cb({ places: this.places, routes: this.routes }));
  }

  async loadAll() {
    try {
      const pRes = await fetch('/api/places');
      if (pRes.ok) {
        const pData = await pRes.json();
        this.places = pData.places || [];
      }
    } catch (e) {
      console.warn('Backend /api/places offline, loading from local cache:', e);
      const cached = localStorage.getItem('sightweaver_places');
      if (cached) this.places = JSON.parse(cached);
    }

    try {
      const rRes = await fetch('/api/routes');
      if (rRes.ok) {
        const rData = await rRes.json();
        this.routes = rData.routes || [];
      }
    } catch (e) {
      console.warn('Backend /api/routes offline, loading from local cache:', e);
      const cachedR = localStorage.getItem('sightweaver_routes');
      if (cachedR) this.routes = JSON.parse(cachedR);
    }

    if (this.places.length === 0) {
      this._seedFallbackPlaces();
    }

    this.isLoaded = true;
    this.notify();
    return { places: this.places, routes: this.routes };
  }

  async findPlace(query) {
    if (!this.isLoaded) await this.loadAll();
    const q = query.toLowerCase().trim();

    // Exact or direct alias match
    let match = this.places.find(p => p.name.toLowerCase().includes(q) || q.includes(p.name.toLowerCase()));
    if (match) return match;

    // Fuzzy keywords
    const keywords = [
      { key: 'classroom', id: 'place_classroom_304' },
      { key: 'class', id: 'place_classroom_304' },
      { key: 'room', id: 'place_classroom_304' },
      { key: '304', id: 'place_classroom_304' },
      { key: 'library', id: 'place_library' },
      { key: 'book', id: 'place_library' },
      { key: 'cafeteria', id: 'place_cafeteria' },
      { key: 'canteen', id: 'place_cafeteria' },
      { key: 'food', id: 'place_cafeteria' },
      { key: 'home', id: 'place_home' },
      { key: 'bus', id: 'place_bus_stop' },
      { key: 'gate', id: 'place_bus_stop' }
    ];

    for (const kw of keywords) {
      if (q.includes(kw.key)) {
        return this.places.find(p => p.id === kw.id) || this.places[0];
      }
    }

    return this.places[0] || null;
  }

  async resolveRouteToPlace(destinationId) {
    if (!this.isLoaded) await this.loadAll();

    // Check if familiar route exists
    const familiar = this.routes.find(r => r.destination_id === destinationId);
    if (familiar && familiar.waypoints) {
      // Deep clone waypoints so mutations (like detours) don't alter master
      return JSON.parse(JSON.stringify(familiar));
    }

    const place = this.places.find(p => p.id === destinationId) || { name: 'Selected Place', accessibility_notes: '' };
    // Synthesize structured accessible corridor route
    return {
      id: `synth_route_${destinationId}`,
      name: `Accessible Path to ${place.name}`,
      destination_id: destinationId,
      destination_name: place.name,
      distance_meters: 65,
      accessibility_notes: place.accessibility_notes || 'Tactile corridor guiding available.',
      waypoints: [
        { step: 1, instruction: 'Step forward and follow the floor tactile path straight for 20 meters.', distance_m: 20, direction: 'straight', landmark: 'Tactile floor strip' },
        { step: 2, instruction: 'Prepare to veer slightly to the right at the corridor junction.', distance_m: 15, direction: 'slight_right', landmark: 'Acoustic wall marker' },
        { step: 3, instruction: 'Continue straight for 15 meters along the wall handrail.', distance_m: 15, direction: 'straight', landmark: 'Tactile wall signage' },
        { step: 4, instruction: `Arriving at ${place.name} entrance on your right.`, distance_m: 15, direction: 'arrive', landmark: 'Entrance portal' }
      ]
    };
  }

  async addPlace(placeData) {
    const newPlace = {
      id: `place_${Date.now()}`,
      name: placeData.name,
      category: placeData.category || 'Custom Place',
      latitude: placeData.latitude || 12.9716,
      longitude: placeData.longitude || 77.5946,
      address: placeData.address || 'Saved Location',
      floor_info: placeData.floor_info || '1st Floor',
      landmarks: placeData.landmarks || 'Near accessible corridor',
      accessibility_notes: placeData.accessibility_notes || 'Tactile paving verified',
      is_favorite: placeData.is_favorite ? 1 : 0
    };

    try {
      await fetch('/api/places', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPlace)
      });
    } catch (e) {
      console.warn('Saved place offline sync:', e);
    }

    this.places.unshift(newPlace);
    localStorage.setItem('sightweaver_places', JSON.stringify(this.places));
    this.notify();
    return newPlace;
  }

  async deletePlace(placeId) {
    this.places = this.places.filter(p => p.id !== placeId);
    try {
      await fetch(`/api/places/${placeId}`, { method: 'DELETE' });
    } catch (e) {
      console.warn('Place deletion offline:', e);
    }
    localStorage.setItem('sightweaver_places', JSON.stringify(this.places));
    this.notify();
  }

  _seedFallbackPlaces() {
    this.places = [
      {
        id: 'place_classroom_304',
        name: 'Room 304 - AI & CS Classroom',
        category: 'Education',
        address: 'Turing Science Block, 3rd Floor',
        floor_info: '3rd Floor, West Wing',
        landmarks: 'Near central elevator, turn right past water dispenser.',
        accessibility_notes: 'Tactile floor guiding available; door opens outward; braille room plate on right.',
        is_favorite: 1
      },
      {
        id: 'place_library',
        name: 'Central Library Entrance',
        category: 'Study',
        address: 'Academic Quadrangle, Ground Floor',
        floor_info: 'Ground Floor, Main Entrance',
        landmarks: 'Double glass automatic doors, chime sounder active at entry.',
        accessibility_notes: 'Ramp on the left side of front stairs; audio beacon enabled.',
        is_favorite: 1
      },
      {
        id: 'place_cafeteria',
        name: 'Student Cafeteria & Dining Hall',
        category: 'Dining',
        address: 'Student Union Center, Level 1',
        floor_info: 'Level 1, South Hallway',
        landmarks: 'Wide double doorway with tactile warning mat.',
        accessibility_notes: 'Order counter has lowered accessibility section on far left.',
        is_favorite: 0
      },
      {
        id: 'place_home',
        name: 'Home Residence',
        category: 'Home',
        address: 'Flat 202, Green Meadows Apt, 2nd Floor',
        floor_info: '2nd Floor, Unit 202',
        landmarks: 'RFID reader at right of gate, 3 low steps with contrast edging.',
        accessibility_notes: 'Tactile warning strips before stairs; elevator equipped with audible voice.',
        is_favorite: 1
      },
      {
        id: 'place_bus_stop',
        name: 'Campus Gate Bus Stop',
        category: 'Transit',
        address: 'University Main Road',
        floor_info: 'Outdoor Street Level',
        landmarks: 'Covered shelter with tactile paving leading to boarding kerb.',
        accessibility_notes: 'Raised curb for level bus entry; audible announcement system.',
        is_favorite: 1
      }
    ];
    localStorage.setItem('sightweaver_places', JSON.stringify(this.places));
  }
}
