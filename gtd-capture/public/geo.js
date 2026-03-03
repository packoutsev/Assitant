// geo.js - Geolocation service for GTD Capture System

class GeoService {
  constructor() {
    this.isSupported = 'geolocation' in navigator;
    this.currentPosition = null;
    this.watchId = null;
    this.isWatching = false;
    this.onLocationUpdate = null;
    this.onNearbyErrand = null;
    this.permissionDenied = false;

    // Saved locations for quick selection
    this.savedLocations = this.loadSavedLocations();

    // Default common errand locations
    this.defaultLocations = [
      { name: 'Home Depot', category: 'hardware', icon: '🔨' },
      { name: 'Lowes', category: 'hardware', icon: '🔧' },
      { name: 'Target', category: 'retail', icon: '🎯' },
      { name: 'Walmart', category: 'retail', icon: '🛒' },
      { name: 'Costco', category: 'retail', icon: '📦' },
      { name: 'Grocery Store', category: 'grocery', icon: '🥬' },
      { name: 'Post Office', category: 'services', icon: '📮' },
      { name: 'Bank', category: 'services', icon: '🏦' },
      { name: 'Pharmacy', category: 'health', icon: '💊' },
      { name: 'Gas Station', category: 'auto', icon: '⛽' },
      { name: 'Auto Shop', category: 'auto', icon: '🚗' },
      { name: 'Dry Cleaner', category: 'services', icon: '👔' },
      { name: 'Office', category: 'work', icon: '🏢' },
      { name: 'Client Site', category: 'work', icon: '📍' }
    ];
  }

  loadSavedLocations() {
    try {
      const saved = localStorage.getItem('gtd_saved_locations');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  }

  saveSavedLocations() {
    try {
      localStorage.setItem('gtd_saved_locations', JSON.stringify(this.savedLocations));
    } catch (e) {
      console.error('Failed to save locations:', e);
    }
  }

  // Get current position once
  async getCurrentPosition() {
    if (!this.isSupported) {
      throw new Error('Geolocation not supported');
    }

    if (this.permissionDenied) {
      throw new Error('Location permission denied');
    }

    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          this.currentPosition = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: position.timestamp
          };
          resolve(this.currentPosition);
        },
        (error) => {
          if (error.code === error.PERMISSION_DENIED) {
            this.permissionDenied = true;
          }
          reject(error);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000
        }
      );
    });
  }

  // Start watching position
  startWatching() {
    if (!this.isSupported || this.isWatching) return;

    this.watchId = navigator.geolocation.watchPosition(
      (position) => {
        this.currentPosition = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp
        };

        if (this.onLocationUpdate) {
          this.onLocationUpdate(this.currentPosition);
        }

        // Check for nearby errands
        this.checkNearbyErrands();
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          this.permissionDenied = true;
        }
        console.error('Geolocation error:', error);
      },
      {
        enableHighAccuracy: false,
        timeout: 30000,
        maximumAge: 120000
      }
    );

    this.isWatching = true;
  }

  stopWatching() {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
      this.isWatching = false;
    }
  }

  // Calculate distance between two points (Haversine formula)
  calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371000; // Earth's radius in meters
    const dLat = this.toRad(lat2 - lat1);
    const dLng = this.toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in meters
  }

  toRad(deg) {
    return deg * (Math.PI / 180);
  }

  // Check if near any saved errand locations
  async checkNearbyErrands() {
    if (!this.currentPosition || !this.onNearbyErrand) return;

    const nearbyRadius = 500; // 500 meters

    for (const location of this.savedLocations) {
      if (location.lat && location.lng) {
        const distance = this.calculateDistance(
          this.currentPosition.lat,
          this.currentPosition.lng,
          location.lat,
          location.lng
        );

        if (distance <= nearbyRadius) {
          this.onNearbyErrand(location, distance);
        }
      }
    }
  }

  // Save a new location
  saveLocation(name, lat, lng, category = 'other') {
    const location = {
      id: Date.now().toString(),
      name,
      lat,
      lng,
      category,
      created: new Date().toISOString()
    };

    this.savedLocations.push(location);
    this.saveSavedLocations();
    return location;
  }

  // Save current location with a name
  async saveCurrentLocation(name, category = 'other') {
    if (!this.currentPosition) {
      await this.getCurrentPosition();
    }

    return this.saveLocation(
      name,
      this.currentPosition.lat,
      this.currentPosition.lng,
      category
    );
  }

  // Remove a saved location
  removeLocation(id) {
    this.savedLocations = this.savedLocations.filter(loc => loc.id !== id);
    this.saveSavedLocations();
  }

  // Get all locations (saved + defaults)
  getAllLocations() {
    return [...this.defaultLocations, ...this.savedLocations];
  }

  // Detect location mentions in text
  detectLocationInText(text) {
    const lowerText = text.toLowerCase();
    const detected = [];

    // Check default locations
    for (const loc of this.defaultLocations) {
      if (lowerText.includes(loc.name.toLowerCase())) {
        detected.push(loc);
      }
    }

    // Check saved locations
    for (const loc of this.savedLocations) {
      if (lowerText.includes(loc.name.toLowerCase())) {
        detected.push(loc);
      }
    }

    // Check common errand keywords
    const errandKeywords = [
      { keyword: 'pick up', context: '@errands' },
      { keyword: 'drop off', context: '@errands' },
      { keyword: 'buy', context: '@errands' },
      { keyword: 'get', context: '@errands' },
      { keyword: 'return', context: '@errands' },
      { keyword: 'exchange', context: '@errands' },
      { keyword: 'store', context: '@errands' },
      { keyword: 'shop', context: '@errands' },
      { keyword: 'mall', context: '@errands' },
      { keyword: 'grocery', context: '@errands' },
      { keyword: 'pharmacy', context: '@errands' },
      { keyword: 'post office', context: '@errands' },
      { keyword: 'bank', context: '@errands' },
      { keyword: 'hardware', context: '@errands' },
      { keyword: 'depot', context: '@errands' },
      { keyword: 'lowes', context: '@errands' },
      { keyword: 'costco', context: '@errands' },
      { keyword: 'walmart', context: '@errands' },
      { keyword: 'target', context: '@errands' }
    ];

    for (const item of errandKeywords) {
      if (lowerText.includes(item.keyword)) {
        return { isErrand: true, locations: detected, suggestedContext: item.context };
      }
    }

    return { isErrand: detected.length > 0, locations: detected, suggestedContext: detected.length > 0 ? '@errands' : null };
  }

  // Format distance for display
  formatDistance(meters) {
    if (meters < 1000) {
      return `${Math.round(meters)}m`;
    }
    const miles = meters / 1609.34;
    if (miles < 0.1) {
      return `${Math.round(meters)}m`;
    }
    return `${miles.toFixed(1)} mi`;
  }

  // Get location status for display
  getStatus() {
    if (!this.isSupported) {
      return { available: false, message: 'Geolocation not supported' };
    }
    if (this.permissionDenied) {
      return { available: false, message: 'Location permission denied' };
    }
    if (this.currentPosition) {
      return {
        available: true,
        message: 'Location available',
        position: this.currentPosition
      };
    }
    return { available: true, message: 'Location not yet acquired' };
  }
}

// Export singleton instance
const geo = new GeoService();
