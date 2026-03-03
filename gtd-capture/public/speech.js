// speech.js - Web Speech API handler for GTD Capture System

class SpeechHandler {
  constructor() {
    this.isSupported = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
    this.recognition = null;
    this.isListening = false;
    this.onResult = null;
    this.onInterimResult = null;
    this.onStart = null;
    this.onEnd = null;
    this.onError = null;
    this.permissionDenied = false;

    if (this.isSupported) {
      this.init();
    }
  }

  init() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.recognition = new SpeechRecognition();

    // Configuration
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-US';
    this.recognition.maxAlternatives = 1;

    // Event handlers
    this.recognition.onstart = () => {
      this.isListening = true;
      if (this.onStart) {
        this.onStart();
      }
    };

    this.recognition.onend = () => {
      this.isListening = false;
      if (this.onEnd) {
        this.onEnd();
      }
    };

    this.recognition.onresult = (event) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;

        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      if (finalTranscript && this.onResult) {
        this.onResult(finalTranscript);
      }

      if (interimTranscript && this.onInterimResult) {
        this.onInterimResult(interimTranscript);
      }
    };

    this.recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);

      if (event.error === 'not-allowed') {
        this.permissionDenied = true;
      }

      this.isListening = false;

      if (this.onError) {
        this.onError(event.error);
      }
    };
  }

  start() {
    if (!this.isSupported) {
      if (this.onError) {
        this.onError('not-supported');
      }
      return false;
    }

    if (this.permissionDenied) {
      if (this.onError) {
        this.onError('not-allowed');
      }
      return false;
    }

    if (this.isListening) {
      return true;
    }

    try {
      this.recognition.start();
      return true;
    } catch (error) {
      console.error('Failed to start speech recognition:', error);
      if (this.onError) {
        this.onError('start-failed');
      }
      return false;
    }
  }

  stop() {
    if (!this.isSupported || !this.isListening) {
      return;
    }

    try {
      this.recognition.stop();
    } catch (error) {
      console.error('Failed to stop speech recognition:', error);
    }
  }

  toggle() {
    if (this.isListening) {
      this.stop();
    } else {
      this.start();
    }
  }

  // Get error message for display
  getErrorMessage(errorCode) {
    const messages = {
      'not-supported': 'Voice capture is not supported in this browser. Try Chrome or Edge.',
      'not-allowed': 'Microphone permission denied. Please allow microphone access in your browser settings.',
      'no-speech': 'No speech detected. Please try again.',
      'audio-capture': 'No microphone found. Please check your audio settings.',
      'network': 'Network error. Speech recognition requires an internet connection.',
      'aborted': 'Speech recognition was aborted.',
      'start-failed': 'Failed to start speech recognition. Please try again.',
      'service-not-allowed': 'Speech recognition service is not allowed. Try using HTTPS.'
    };

    return messages[errorCode] || 'An error occurred with speech recognition.';
  }

  // Check if we can use speech recognition
  canUse() {
    return this.isSupported && !this.permissionDenied;
  }
}

// Export singleton instance
const speech = new SpeechHandler();
