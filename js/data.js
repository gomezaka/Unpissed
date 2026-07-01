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
      accessMode: 'no-code',
      openNow: true,
      type: 'Bar',
      facilities: ['Gender-neutral', 'Mirror', 'Hooks', 'Soap', 'Good lighting'],
      photoCount: 3,
      vibeTags: ['Selfie light', 'Dry floor', 'Calm lock energy'],
      crowdLevel: 'Low queue · 2 stalls available',
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
      accessMode: 'code-needed',
      openNow: true,
      type: 'Restaurant',
      facilities: ['Mirror', 'Dryer', 'Soap'],
      photoCount: 2,
      vibeTags: ['Neon mirror', 'Receipt code', 'Quick stop'],
      crowdLevel: 'Moderate queue · code needed',
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
      accessMode: 'public',
      openNow: true,
      type: 'Venue',
      facilities: ['Public access', 'Dryer', 'Loud enough'],
      photoCount: 1,
      vibeTags: ['Loud cover', 'Arcade chaos', 'Backup plan'],
      crowdLevel: 'Busy · expect a wait',
      criteria: {
        cleanliness: 3.5,
        queueFactor: 3.2,
        paperQuality: 2.8,
        lockConfidence: 4.0,
        vibe: 4.3,
        essentials: 3.4,
        soundSafety: 4.8
      }
    },
    {
      id: 'civic-square',
      name: 'Civic Square Restroom',
      rating: 4.5,
      distanceMinutes: 4,
      distanceMiles: 0.2,
      x: 41,
      y: 67,
      tags: ['Public', 'Accessible', 'Closes late'],
      status: 'OPEN',
      access: 'Public · Accessible · Closes late',
      accessMode: 'public',
      openNow: true,
      type: 'Public',
      facilities: ['Accessible', 'Changing table', 'Soap', 'Public access'],
      photoCount: 4,
      vibeTags: ['Accessible', 'Clean public option', 'Late close'],
      crowdLevel: 'Steady · usually fine',
      criteria: {
        cleanliness: 4.5,
        queueFactor: 4.0,
        paperQuality: 4.2,
        lockConfidence: 4.6,
        vibe: 4.1,
        essentials: 4.8,
        soundSafety: 4.0
      }
    },
    {
      id: 'velvet-basement',
      name: 'Velvet Basement',
      rating: 3.9,
      distanceMinutes: 9,
      distanceMiles: 0.6,
      x: 18,
      y: 74,
      tags: ['Customer-only', 'Dark vibe', 'No queue'],
      status: 'OPEN',
      access: 'Customer-only · Dark vibe · No queue',
      accessMode: 'customer-only',
      openNow: true,
      type: 'Club',
      facilities: ['Mirror', 'Hooks', 'Loud enough'],
      photoCount: 2,
      vibeTags: ['Dark vibe', 'No queue', 'Club basement'],
      crowdLevel: 'No queue · bring confidence',
      criteria: {
        cleanliness: 3.7,
        queueFactor: 4.8,
        paperQuality: 3.3,
        lockConfidence: 3.8,
        vibe: 4.9,
        essentials: 3.4,
        soundSafety: 4.7
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
    },
    {
      id: 'night-watch',
      title: 'Night Watch',
      subtitle: 'Rated after midnight. Brave work.',
      description: 'Check in between midnight and 04:00.',
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

  reviews: [
    {
      id: 'review-1',
      bathroomId: 'fox-barrel',
      author: 'Mia',
      rating: 4.9,
      text: 'Elite mirror. Zero code. Suspiciously good paper.',
      time: '8m'
    },
    {
      id: 'review-2',
      bathroomId: 'fox-barrel',
      author: 'Alex',
      rating: 4.7,
      text: 'Lighting said main character. Queue said side quest.',
      time: '22m'
    },
    {
      id: 'review-3',
      bathroomId: 'neon-noodle',
      author: 'Sam',
      rating: 4.2,
      text: 'Code on receipt. Worth the noodles, honestly.',
      time: '31m'
    },
    {
      id: 'review-4',
      bathroomId: 'civic-square',
      author: 'Taylor',
      rating: 4.5,
      text: 'Public bathroom that did not ruin my faith in society.',
      time: '1h'
    }
  ],
  friendRadar: [
    { id: 'friend-1', name: 'Mia', initials: 'MB', status: 'near a 4.8 ★ throne', distance: '0.2 mi', privacy: 'delayed' },
    { id: 'friend-2', name: 'Alex', initials: 'AK', status: 'rated downtown', distance: '0.4 mi', privacy: 'hidden now' },
    { id: 'friend-3', name: 'Sam', initials: 'SN', status: 'unlocked Emergency Landing', distance: '0.6 mi', privacy: 'public' }
  ],
  cityStats: {
    city: 'Downtown',
    bathrooms: 42,
    trending: 'The Fox & Barrel',
    highestRated: 'The Fox & Barrel',
    busiest: 'Metro Arcade Hall'
  },
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
