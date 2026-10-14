// Errori con messaggi già pronti per il signore.
export class JarvisError extends Error {
  constructor(message) {
    super(message);
    this.name = 'JarvisError';
  }
}

// L'accesso a Google è scaduto o assente: serve un nuovo login.
export class NeedsGoogleAuth extends Error {
  constructor() {
    super('Serve un nuovo accesso a Google.');
    this.name = 'NeedsGoogleAuth';
  }
}
