window.UNPISSED_DATA = {
  user: {
    id: 'user-demo',
    name: 'Jordan Doe',
    initials: 'JD',
    city: 'Downtown'
  },
  bathrooms: [
    {
      id: 'fox-barrel',
      name: 'The Fox & Barrel',
      rating: 4.8,
      distanceMinutes: 2,
      distanceMiles: 0.1,
      x: 63,
      y: 35,
      tags: ['Public-ish', 'No code', 'Great lighting'],
      status: 'TRENDING',
      access: 'Public-ish · No code · Great lighting',
      type: 'Bar',
      criteria: {
        cleanliness: 4.7,
        queueFactor: 4.2,
        paperQuality: 4.9,
        lockConfidence: 4.8,
        vibe: 5.0,
        essentials: 4.6,
        soundSafety: 4.4
      }
    },
    {
      id: 'neon-noodle',
      name: 'Neon Noodle Club',
      rating: 4.2,
      distanceMinutes: 5,
      distanceMiles: 0.3,
      x: 28,
      y: 44,
      tags: ['Code needed', 'Mirror wall', 'Fast queue'],
      status: 'OPEN',
      access: 'Code needed · Mirror wall · Fast queue',
      type: 'Restaurant',
      criteria: {
        cleanliness: 4.1,
        queueFactor: 4.4,
        paperQuality: 3.8,
        lockConfidence: 4.7,
        vibe: 4.5,
        essentials: 4.0,
        soundSafety: 3.9
      }
    },
    {
      id: 'metro-arcade',
      name: 'Metro Arcade Hall',
      rating: 3.6,
      distanceMinutes: 7,
      distanceMiles: 0.4,
      x: 75,
      y: 71,
      tags: ['Public', 'Loud music', 'Risky paper'],
      status: 'BUSY',
      access: 'Public · Loud music · Risky paper',
      type: 'Venue',
      criteria: {
        cleanliness: 3.5,
        queueFactor: 3.2,
        paperQuality: 2.8,
        lockConfidence: 4.0,
        vibe: 4.3,
        essentials: 3.4,
        soundSafety: 4.8
      }
    }
  ],
  badges: [
    {
      id: 'emergency-landing',
      title: 'Emergency Landing',
      subtitle: 'Fast thinking. Faster walking.',
      description: 'Check in at the nearest bathroom within 100 meters.',
      unlocked: true
    },
    {
      id: 'golden-flush',
      title: 'The Golden Flush',
      subtitle: 'You are now a porcelain critic.',
      description: 'Rate 10 different bathrooms.',
      unlocked: false
    },
    {
      id: 'pub-crawl-plumber',
      title: 'Pub Crawl Plumber',
      subtitle: 'One night. Five stops. Questionable decisions.',
      description: 'Check in at 5 different bathrooms in one night.',
      unlocked: false
    },
    {
      id: 'porcelain-royalty',
      title: 'Porcelain Royalty',
      subtitle: 'You sat where legends sit.',
      description: 'Visit the highest-rated bathroom in a city.',
      unlocked: false
    },
    {
      id: 'hidden-gem-hunter',
      title: 'Hidden Gem Hunter',
      subtitle: 'You found the throne before it was famous.',
      description: 'Be the first to add a bathroom that later becomes highly rated.',
      unlocked: false
    }
  ],
  feed: [
    {
      id: 'feed-1',
      initials: 'MB',
      avatar: 'warm',
      text: '<b>Mia</b> unlocked <b class="gold-text">The Golden Flush</b>',
      time: '2m'
    },
    {
      id: 'feed-2',
      initials: 'AK',
      avatar: 'teal',
      text: '<b>Alex</b> found a 5-star bathroom downtown',
      time: '14m'
    },
    {
      id: 'feed-3',
      initials: '',
      avatar: 'blue',
      icon: 'trend',
      text: '<b>The Fox & Barrel</b> is trending tonight',
      time: 'now'
    }
  ],
  criteriaLabels: {
    cleanliness: 'Cleanliness',
    queueFactor: 'Queue Factor',
    paperQuality: 'Paper Quality',
    lockConfidence: 'Lock Confidence',
    vibe: 'Vibe',
    essentials: 'Essentials',
    soundSafety: 'Sound Safety'
  }
};
