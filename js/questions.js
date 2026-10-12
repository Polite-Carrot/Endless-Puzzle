/* Sample questions for the design prototype.
 * `answers[0]` is always the correct one; the app shuffles them on show. */

window.CATEGORIES = {
  maths:     { name: 'Maths',     icon: '➗', colour: '#ffd028' },
  space:     { name: 'Space',     icon: '🪐', colour: '#9a53ef' },
  science:   { name: 'Science',   icon: '🧪', colour: '#2fc15e' },
  geography: { name: 'Geography', icon: '🌍', colour: '#3b7bf7' },
  nature:    { name: 'Nature',    icon: '🕷️', colour: '#ff8700' },
};

// coins: what a correct answer pays (halved if the 50/50 was used)
window.DIFFICULTIES = {
  easy:   { name: 'Easy',       coins: 5 },
  normal: { name: 'Normal',     coins: 10 },
  hard:   { name: 'Hard',       coins: 15 },
  xhard:  { name: 'Extra Hard', coins: 25 },
};

window.QUESTIONS = [
  {
    id: 'maths-0001',
    difficulty: 'easy',
    category: 'maths',
    q: 'What is 90 ÷ 5?',
    answers: ['18', '15', '20', '45'],
    why: '5 goes into 90 eighteen times, because 5 × 18 = 90.',
  },
  {
    id: 'space-0001',
    difficulty: 'normal',
    category: 'space',
    q: 'What is the largest planet in the solar system?',
    answers: ['Jupiter', 'Saturn', 'Neptune', 'Earth'],
    why: 'Jupiter is so big that more than 1,300 Earths could fit inside it.',
  },
  {
    id: 'science-0001',
    difficulty: 'hard',
    category: 'science',
    q: 'What is the chemical symbol for gold?',
    answers: ['Au', 'Ag', 'Gd', 'Go'],
    why: 'Au comes from "aurum", the Latin word for gold. Ag is silver.',
  },
  {
    id: 'geography-0001',
    difficulty: 'xhard',
    category: 'geography',
    q: 'Which country covers the most time zones?',
    answers: ['France', 'Russia', 'United States', 'China'],
    why: 'France spans 12 time zones thanks to its overseas territories. Russia has 11.',
  },
  {
    id: 'nature-0001',
    difficulty: 'easy',
    category: 'nature',
    q: 'How many legs does a spider have?',
    answers: ['8', '6', '10', '4'],
    why: 'All spiders have 8 legs. Insects, like ants and bees, have 6.',
  },
  {
    id: 'maths-0002',
    difficulty: 'easy',
    category: 'maths',
    q: 'What is 7 + 8?',
    answers: ['15', '14', '16', '13'],
    why: '7 + 8 = 15. A handy trick: 7 + 7 = 14, then add one more.',
  },
  {
    id: 'maths-0003',
    difficulty: 'normal',
    category: 'maths',
    q: 'What is 12 × 12?',
    answers: ['144', '124', '132', '142'],
    why: '12 × 12 = 144, which is also called a gross.',
  },
];
