/* The question bank, beyond the hand-written questions in questions.js.
 *
 * Two kinds of source, and both are "held as seeds":
 *
 *  - FACT TABLES. Each row is a checked fact, written once, that turns into
 *    one or two questions (Italy → Rome becomes "capital of Italy?" and
 *    "Rome is the capital of which country?"). Wrong answers are written per
 *    row where a careless pick could also be right — a group of geese is a
 *    gaggle, but it's also a flock, so "flock" is never offered.
 *
 *  - GENERATORS. Maths and Roman numerals are worked out, not written, so the
 *    answer can't be wrong. A generated question is named by a reference like
 *    "g:mul12:48213": the generator and a seed. The same reference always
 *    makes the same question, which is what lets a Climb level or a shared
 *    Quick Play seed store a question as a few characters.
 *
 * Every question has the same shape as a hand-written one:
 *   { id, difficulty, category, q, answers: [correct, ...3 wrong], why }
 *
 * No DOM: tools/build-levels.js loads this under Node. */
(function (root) {
  'use strict';

  /* ───────── seeded randomness ───────── */

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const int = (rand, lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
  const pick = (rand, list) => list[Math.floor(rand() * list.length)];
  function hash(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
    return h >>> 0;
  }
  const fmt = (n) => n.toLocaleString('en-GB');

  // Three distinct wrong answers from a list of candidates, in a fixed order.
  function wrongs(correct, candidates, rand) {
    const out = [];
    const pool = candidates.filter((c, i) => c !== correct && candidates.indexOf(c) === i);
    while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
    return out;
  }

  /* ───────── fact tables ───────── */

  // [country, capital, [three other cities in that country], difficulty]
  const CAPITALS = [
    ['Italy', 'Rome', ['Milan', 'Venice', 'Naples'], 'easy'],
    ['Spain', 'Madrid', ['Barcelona', 'Seville', 'Valencia'], 'easy'],
    ['Germany', 'Berlin', ['Munich', 'Hamburg', 'Frankfurt'], 'easy'],
    ['the United States', 'Washington, D.C.', ['New York', 'Los Angeles', 'Chicago'], 'easy'],
    ['China', 'Beijing', ['Shanghai', 'Guangzhou', 'Shenzhen'], 'normal'],
    ['Russia', 'Moscow', ['St Petersburg', 'Kazan', 'Novosibirsk'], 'normal'],
    ['Egypt', 'Cairo', ['Alexandria', 'Luxor', 'Giza'], 'normal'],
    ['Ireland', 'Dublin', ['Cork', 'Galway', 'Limerick'], 'normal'],
    ['Greece', 'Athens', ['Thessaloniki', 'Patras', 'Heraklion'], 'normal'],
    ['Portugal', 'Lisbon', ['Porto', 'Faro', 'Braga'], 'normal'],
    ['Norway', 'Oslo', ['Bergen', 'Trondheim', 'Stavanger'], 'normal'],
    ['Sweden', 'Stockholm', ['Gothenburg', 'Malmö', 'Uppsala'], 'normal'],
    ['Denmark', 'Copenhagen', ['Aarhus', 'Odense', 'Aalborg'], 'normal'],
    ['Austria', 'Vienna', ['Salzburg', 'Innsbruck', 'Graz'], 'normal'],
    ['Belgium', 'Brussels', ['Antwerp', 'Bruges', 'Ghent'], 'normal'],
    ['India', 'New Delhi', ['Mumbai', 'Kolkata', 'Bengaluru'], 'normal'],
    ['Mexico', 'Mexico City', ['Cancún', 'Guadalajara', 'Monterrey'], 'normal'],
    ['Argentina', 'Buenos Aires', ['Córdoba', 'Rosario', 'Mendoza'], 'normal'],
    ['South Korea', 'Seoul', ['Busan', 'Incheon', 'Daegu'], 'normal'],
    ['Thailand', 'Bangkok', ['Phuket', 'Chiang Mai', 'Pattaya'], 'normal'],
    ['Scotland', 'Edinburgh', ['Glasgow', 'Aberdeen', 'Dundee'], 'normal'],
    ['Wales', 'Cardiff', ['Swansea', 'Newport', 'Wrexham'], 'normal'],
    ['Ukraine', 'Kyiv', ['Lviv', 'Odesa', 'Kharkiv'], 'normal'],
    ['the Netherlands', 'Amsterdam', ['Rotterdam', 'Utrecht', 'Eindhoven'], 'hard'],
    ['Finland', 'Helsinki', ['Tampere', 'Turku', 'Oulu'], 'hard'],
    ['Poland', 'Warsaw', ['Kraków', 'Gdańsk', 'Wrocław'], 'hard'],
    ['Switzerland', 'Bern', ['Zürich', 'Geneva', 'Basel'], 'hard'],
    ['Turkey', 'Ankara', ['Istanbul', 'Izmir', 'Antalya'], 'hard'],
    ['Brazil', 'Brasília', ['Rio de Janeiro', 'São Paulo', 'Salvador'], 'hard'],
    ['Vietnam', 'Hanoi', ['Ho Chi Minh City', 'Da Nang', 'Hue'], 'hard'],
    ['Kenya', 'Nairobi', ['Mombasa', 'Kisumu', 'Nakuru'], 'hard'],
    ['Pakistan', 'Islamabad', ['Karachi', 'Lahore', 'Peshawar'], 'hard'],
    ['Northern Ireland', 'Belfast', ['Armagh', 'Lisburn', 'Newry'], 'hard'],
    ['Iceland', 'Reykjavík', ['Akureyri', 'Húsavík', 'Selfoss'], 'hard'],
    ['Cuba', 'Havana', ['Santiago de Cuba', 'Varadero', 'Trinidad'], 'hard'],
    ['Peru', 'Lima', ['Cusco', 'Arequipa', 'Trujillo'], 'hard'],
    ['Chile', 'Santiago', ['Valparaíso', 'Concepción', 'Antofagasta'], 'hard'],
    ['Colombia', 'Bogotá', ['Medellín', 'Cali', 'Cartagena'], 'hard'],
    ['the Philippines', 'Manila', ['Cebu City', 'Davao City', 'Zamboanga'], 'hard'],
    ['Malaysia', 'Kuala Lumpur', ['Penang', 'Johor Bahru', 'Malacca'], 'hard'],
    ['Saudi Arabia', 'Riyadh', ['Jeddah', 'Mecca', 'Medina'], 'hard'],
    ['the United Arab Emirates', 'Abu Dhabi', ['Dubai', 'Sharjah', 'Ajman'], 'hard'],
    ['Hungary', 'Budapest', ['Debrecen', 'Szeged', 'Pécs'], 'hard'],
    ['the Czech Republic', 'Prague', ['Brno', 'Ostrava', 'Plzeň'], 'hard'],
    ['Jamaica', 'Kingston', ['Montego Bay', 'Ocho Rios', 'Negril'], 'hard'],
    ['Ethiopia', 'Addis Ababa', ['Dire Dawa', 'Gondar', 'Mekelle'], 'hard'],
    ['Ghana', 'Accra', ['Kumasi', 'Tamale', 'Cape Coast'], 'hard'],
    ['Iran', 'Tehran', ['Isfahan', 'Shiraz', 'Mashhad'], 'hard'],
    ['Iraq', 'Baghdad', ['Basra', 'Mosul', 'Erbil'], 'hard'],
    ['Afghanistan', 'Kabul', ['Kandahar', 'Herat', 'Mazar-i-Sharif'], 'hard'],
    ['Nepal', 'Kathmandu', ['Pokhara', 'Lalitpur', 'Biratnagar'], 'hard'],
    ['Bangladesh', 'Dhaka', ['Chittagong', 'Khulna', 'Sylhet'], 'hard'],
    ['Jordan', 'Amman', ['Aqaba', 'Irbid', 'Zarqa'], 'hard'],
    ['Lebanon', 'Beirut', ['Tripoli', 'Sidon', 'Tyre'], 'hard'],
    ['Tunisia', 'Tunis', ['Sfax', 'Sousse', 'Kairouan'], 'hard'],
    ['Venezuela', 'Caracas', ['Maracaibo', 'Valencia', 'Barquisimeto'], 'hard'],
    ['Nigeria', 'Abuja', ['Lagos', 'Kano', 'Ibadan'], 'xhard'],
    ['Morocco', 'Rabat', ['Marrakesh', 'Casablanca', 'Fez'], 'xhard'],
    ['Croatia', 'Zagreb', ['Split', 'Dubrovnik', 'Zadar'], 'xhard'],
    ['Romania', 'Bucharest', ['Cluj-Napoca', 'Timișoara', 'Constanța'], 'xhard'],
    ['Bulgaria', 'Sofia', ['Plovdiv', 'Varna', 'Burgas'], 'xhard'],
    ['Serbia', 'Belgrade', ['Novi Sad', 'Niš', 'Kragujevac'], 'xhard'],
    ['Slovenia', 'Ljubljana', ['Maribor', 'Celje', 'Koper'], 'xhard'],
    ['Latvia', 'Riga', ['Daugavpils', 'Liepāja', 'Jelgava'], 'xhard'],
    ['Lithuania', 'Vilnius', ['Kaunas', 'Klaipėda', 'Šiauliai'], 'xhard'],
    ['Estonia', 'Tallinn', ['Tartu', 'Pärnu', 'Narva'], 'xhard'],
    ['Mongolia', 'Ulaanbaatar', ['Erdenet', 'Darkhan', 'Choibalsan'], 'xhard'],
    ['Tanzania', 'Dodoma', ['Dar es Salaam', 'Zanzibar City', 'Arusha'], 'xhard'],
    ['Côte d’Ivoire', 'Yamoussoukro', ['Abidjan', 'Bouaké', 'San-Pédro'], 'xhard'],
    ['Belize', 'Belmopan', ['Belize City', 'San Ignacio', 'Orange Walk'], 'xhard'],
    ['Malta', 'Valletta', ['Sliema', 'Mdina', 'Birkirkara'], 'xhard'],
    ['Uruguay', 'Montevideo', ['Punta del Este', 'Salto', 'Colonia'], 'xhard'],
    ['Paraguay', 'Asunción', ['Ciudad del Este', 'Encarnación', 'Luque'], 'xhard'],
    ['Qatar', 'Doha', ['Al Wakrah', 'Al Khor', 'Lusail'], 'xhard'],
    ['Cyprus', 'Nicosia', ['Limassol', 'Larnaca', 'Paphos'], 'xhard'],
    ['Algeria', 'Algiers', ['Oran', 'Constantine', 'Annaba'], 'xhard'],
    ['Libya', 'Tripoli', ['Benghazi', 'Misrata', 'Tobruk'], 'xhard'],
    ['Senegal', 'Dakar', ['Saint-Louis', 'Touba', 'Thiès'], 'xhard'],
    ['Zimbabwe', 'Harare', ['Bulawayo', 'Mutare', 'Gweru'], 'xhard'],
    ['Zambia', 'Lusaka', ['Ndola', 'Kitwe', 'Livingstone'], 'xhard'],
    ['Uganda', 'Kampala', ['Entebbe', 'Gulu', 'Jinja'], 'xhard'],
    ['Madagascar', 'Antananarivo', ['Toamasina', 'Antsirabe', 'Mahajanga'], 'xhard'],
    ['Ecuador', 'Quito', ['Guayaquil', 'Cuenca', 'Manta'], 'xhard'],
  ];

  // Which part of the world each country is in, so "Abuja is the capital of
  // which country?" offers other African countries rather than ones you could
  // rule out by continent alone.
  const REGION = {
    Europe: ['Italy', 'Spain', 'Germany', 'Russia', 'Ireland', 'Greece', 'Portugal', 'Norway', 'Sweden', 'Denmark',
      'Austria', 'Belgium', 'Scotland', 'Wales', 'Ukraine', 'the Netherlands', 'Finland', 'Poland', 'Switzerland',
      'Northern Ireland', 'Iceland', 'Hungary', 'the Czech Republic', 'Croatia', 'Romania', 'Bulgaria', 'Serbia',
      'Slovenia', 'Latvia', 'Lithuania', 'Estonia', 'Malta', 'Cyprus'],
    Asia: ['China', 'India', 'South Korea', 'Thailand', 'Vietnam', 'Pakistan', 'the Philippines', 'Malaysia',
      'Afghanistan', 'Nepal', 'Bangladesh', 'Mongolia', 'Turkey', 'Iran', 'Iraq', 'Saudi Arabia',
      'the United Arab Emirates', 'Jordan', 'Lebanon', 'Qatar'],
    Africa: ['Egypt', 'Kenya', 'Ethiopia', 'Ghana', 'Tunisia', 'Nigeria', 'Morocco', 'Tanzania', 'Côte d’Ivoire',
      'Algeria', 'Libya', 'Senegal', 'Zimbabwe', 'Zambia', 'Uganda', 'Madagascar'],
    Americas: ['the United States', 'Mexico', 'Argentina', 'Brazil', 'Cuba', 'Peru', 'Chile', 'Colombia', 'Jamaica',
      'Venezuela', 'Belize', 'Uruguay', 'Paraguay', 'Ecuador'],
  };
  const regionOf = (country) => Object.keys(REGION).find((r) => REGION[r].includes(country));

  // [symbol, name, atomic number, wrong symbols, difficulty of the symbol question]
  // Latin-named ones (Na, K, Fe, Cu, Ag, Sn, Au, Hg, Pb, W) are the hard ones.
  const ELEMENTS = [
    ['H', 'Hydrogen', 1, ['He', 'Hy', 'Hd'], 'normal'],
    ['He', 'Helium', 2, ['H', 'Hl', 'Hm'], 'normal'],
    ['C', 'Carbon', 6, ['Ca', 'Co', 'Cb'], 'normal'],
    ['N', 'Nitrogen', 7, ['Ni', 'Na', 'Nt'], 'normal'],
    ['O', 'Oxygen', 8, ['Ox', 'Os', 'Og'], 'normal'],
    ['Ne', 'Neon', 10, ['N', 'Ni', 'Nn'], 'hard'],
    ['Ca', 'Calcium', 20, ['C', 'Cl', 'Cm'], 'hard'],
    ['Mg', 'Magnesium', 12, ['Mn', 'Ma', 'M'], 'hard'],
    ['Al', 'Aluminium', 13, ['Am', 'Au', 'Ag'], 'hard'],
    ['Si', 'Silicon', 14, ['S', 'Sn', 'Sl'], 'hard'],
    ['S', 'Sulfur', 16, ['Su', 'Sf', 'Si'], 'hard'],
    ['Cl', 'Chlorine', 17, ['Ch', 'C', 'Co'], 'hard'],
    ['Zn', 'Zinc', 30, ['Z', 'Zi', 'Zc'], 'hard'],
    ['Ni', 'Nickel', 28, ['N', 'Nk', 'Ne'], 'hard'],
    ['Li', 'Lithium', 3, ['L', 'Lt', 'Lh'], 'hard'],
    ['P', 'Phosphorus', 15, ['Ph', 'Po', 'Pr'], 'hard'],
    ['I', 'Iodine', 53, ['Io', 'In', 'Id'], 'hard'],
    ['U', 'Uranium', 92, ['Ur', 'Un', 'Um'], 'hard'],
    ['Ar', 'Argon', 18, ['A', 'Ag', 'Am'], 'hard'],
    ['Ti', 'Titanium', 22, ['Tn', 'Ta', 'T'], 'hard'],
    ['Pt', 'Platinum', 78, ['Pl', 'P', 'Pa'], 'hard'],
    ['Na', 'Sodium', 11, ['So', 'Sd', 'S'], 'xhard'],
    ['Cu', 'Copper', 29, ['Co', 'Cp', 'Cr'], 'xhard'],
    ['Ag', 'Silver', 47, ['Si', 'Sl', 'Au'], 'xhard'],
    ['Sn', 'Tin', 50, ['Ti', 'T', 'Si'], 'xhard'],
    ['Hg', 'Mercury', 80, ['Me', 'M', 'Mc'], 'xhard'],
    ['Pb', 'Lead', 82, ['Le', 'L', 'Ld'], 'xhard'],
    ['W', 'Tungsten', 74, ['Tu', 'T', 'Tg'], 'xhard'],
  ];
  // The Latin names behind the odd symbols, for the explanations.
  const LATIN = { Na: 'natrium', Cu: 'cuprum', Ag: 'argentum', Sn: 'stannum', Hg: 'hydrargyrum', Pb: 'plumbum', W: 'wolfram' };
  // symbol questions already hand-written in questions.js
  const ELEMENT_SYMBOLS_DONE = ['Au', 'Fe', 'K'];

  const PLANETS = ['Mercury', 'Venus', 'Earth', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'];
  const PLANET_DIFF = ['normal', 'hard', 'normal', 'hard', 'hard', 'hard', 'xhard', 'hard'];
  const ORDINAL = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'];

  // [animal, baby, difficulty]
  const BABIES = [
    ['cat', 'kitten', 'easy'], ['dog', 'puppy', 'easy'], ['sheep', 'lamb', 'easy'],
    ['pig', 'piglet', 'easy'], ['duck', 'duckling', 'easy'],
    ['cow', 'calf', 'normal'], ['horse', 'foal', 'normal'], ['bear', 'cub', 'normal'],
    ['kangaroo', 'joey', 'normal'], ['frog', 'tadpole', 'normal'],
    ['goat', 'kid', 'hard'], ['goose', 'gosling', 'hard'], ['deer', 'fawn', 'hard'],
    ['owl', 'owlet', 'hard'], ['eagle', 'eaglet', 'hard'],
    ['swan', 'cygnet', 'xhard'], ['hare', 'leveret', 'xhard'],
  ];

  // [animals, group word, three wrong words that are NOT also right, difficulty]
  const GROUPS = [
    ['cows', 'a herd', ['a pride', 'a school', 'a swarm'], 'easy'],
    ['wolves', 'a pack', ['a herd', 'a pride', 'a school'], 'normal'],
    ['fish', 'a school', ['a pack', 'a swarm', 'a troop'], 'normal'],
    ['bees', 'a swarm', ['a pride', 'a pod', 'a herd'], 'normal'],
    ['ants', 'a colony', ['a pride', 'a pod', 'a gaggle'], 'normal'],
    ['dolphins', 'a pod', ['a pride', 'a troop', 'a gaggle'], 'hard'],
    ['geese on the ground', 'a gaggle', ['a pod', 'a pride', 'a school'], 'hard'],
    ['monkeys', 'a troop', ['a pod', 'a school', 'a gaggle'], 'hard'],
    ['crows', 'a murder', ['a pride', 'a school', 'a pod'], 'xhard'],
    ['owls', 'a parliament', ['a school', 'a gaggle', 'a pod'], 'xhard'],
    ['flamingos', 'a flamboyance', ['a parliament', 'a murder', 'a troop'], 'xhard'],
  ];

  const CLASSES = ['Mammal', 'Bird', 'Reptile', 'Amphibian', 'Fish'];
  // [animal, class, difficulty, why]
  const KINDS = [
    ['a snake', 'Reptile', 'easy', 'Snakes are reptiles: scaly skin, and most lay eggs.'],
    ['an eagle', 'Bird', 'easy', 'Eagles are birds — feathers, wings and a beak.'],
    ['a whale', 'Mammal', 'normal', 'Whales breathe air and feed their young milk, so they are mammals, not fish.'],
    ['a dolphin', 'Mammal', 'normal', 'Dolphins breathe air through a blowhole and feed their young milk.'],
    ['a penguin', 'Bird', 'normal', 'Penguins can’t fly, but they have feathers and lay eggs — they’re birds.'],
    ['an ostrich', 'Bird', 'normal', 'The ostrich is the biggest bird alive, even though it can’t fly.'],
    ['a frog', 'Amphibian', 'normal', 'Frogs start life in water as tadpoles and live on land as adults: amphibians.'],
    ['a crocodile', 'Reptile', 'normal', 'Crocodiles are reptiles, and closer relatives of birds than of lizards.'],
    ['a shark', 'Fish', 'normal', 'Sharks are fish — they breathe through gills.'],
    ['a bat', 'Mammal', 'hard', 'Bats are mammals — the only ones that can truly fly.'],
    ['a salamander', 'Amphibian', 'hard', 'Salamanders look like lizards, but they have soft, damp skin like frogs: amphibians.'],
    ['a turtle', 'Reptile', 'hard', 'Turtles are reptiles, and they come ashore to lay their eggs.'],
    ['a newt', 'Amphibian', 'hard', 'Newts are amphibians that spend part of their life in water and part on land.'],
    ['a seahorse', 'Fish', 'xhard', 'Seahorses are fish — and it’s the father who carries the eggs.'],
    ['a platypus', 'Mammal', 'xhard', 'The platypus lays eggs, but it feeds its young milk, so it’s a mammal.'],
  ];

  // [word, plural, three wrong spellings, difficulty]
  const PLURALS = [
    ['child', 'children', ['childs', 'childes', 'childrens'], 'easy'],
    ['foot', 'feet', ['foots', 'feets', 'footes'], 'easy'],
    ['tooth', 'teeth', ['tooths', 'teeths', 'toothes'], 'easy'],
    ['man', 'men', ['mans', 'mens', 'manes'], 'easy'],
    ['woman', 'women', ['womans', 'womens', 'womanes'], 'easy'],
    ['goose', 'geese', ['gooses', 'geeses', 'goosen'], 'normal'],
    ['sheep', 'sheep', ['sheeps', 'sheepes', 'shoop'], 'normal'],
    ['wolf', 'wolves', ['wolfs', 'wolfes', 'wolvs'], 'normal'],
    ['knife', 'knives', ['knifes', 'knivs', 'knifs'], 'normal'],
    ['half', 'halves', ['halfs', 'halfes', 'halvs'], 'normal'],
    ['potato', 'potatoes', ['potatos', 'potatoe', 'potatoies'], 'normal'],
    ['ox', 'oxen', ['oxes', 'oxs', 'oxi'], 'hard'],
    ['louse', 'lice', ['louses', 'lices', 'lousen'], 'hard'],
    ['crisis', 'crises', ['crisises', 'crisis', 'crisii'], 'xhard'],
    ['phenomenon', 'phenomena', ['phenomenas', 'phenomenums', 'phenomenii'], 'xhard'],
    ['criterion', 'criteria', ['criterias', 'criterions', 'criterium'], 'xhard'],
    ['analysis', 'analyses', ['analysises', 'analysis', 'analysi'], 'xhard'],
  ];

  // [word, opposite, three words that are NOT its opposite, difficulty]
  const OPPOSITES = [
    ['big', 'small', ['huge', 'tall', 'wide'], 'easy'],
    ['happy', 'sad', ['glad', 'cheerful', 'excited'], 'easy'],
    ['fast', 'slow', ['quick', 'rapid', 'speedy'], 'easy'],
    ['full', 'empty', ['packed', 'heavy', 'round'], 'easy'],
    ['brave', 'cowardly', ['bold', 'strong', 'fearless'], 'normal'],
    ['polite', 'rude', ['kind', 'gentle', 'quiet'], 'normal'],
    ['victory', 'defeat', ['win', 'triumph', 'battle'], 'normal'],
    ['expand', 'shrink', ['grow', 'swell', 'stretch'], 'normal'],
    ['ascend', 'descend', ['climb', 'rise', 'soar'], 'normal'],
    ['maximum', 'minimum', ['most', 'highest', 'largest'], 'normal'],
    ['transparent', 'opaque', ['clear', 'glassy', 'see-through'], 'hard'],
    ['optimist', 'pessimist', ['dreamer', 'idealist', 'enthusiast'], 'hard'],
    ['scarce', 'plentiful', ['rare', 'few', 'sparse'], 'hard'],
    ['temporary', 'permanent', ['brief', 'short', 'passing'], 'hard'],
    ['compulsory', 'optional', ['required', 'necessary', 'forced'], 'hard'],
    ['verbose', 'concise', ['wordy', 'rambling', 'chatty'], 'xhard'],
    ['benevolent', 'malevolent', ['kind', 'charitable', 'generous'], 'xhard'],
    ['frugal', 'extravagant', ['thrifty', 'careful', 'sparing'], 'xhard'],
    ['ephemeral', 'eternal', ['brief', 'fleeting', 'passing'], 'xhard'],
  ];

  // [correct spelling, three misspellings, difficulty]
  const SPELLINGS = [
    ['necessary', ['neccessary', 'necesary', 'neccesary'], 'normal'],
    ['because', ['becuase', 'becouse', 'beacuse'], 'normal'],
    ['friend', ['freind', 'frend', 'freindd'], 'normal'],
    ['beautiful', ['beautifull', 'beatiful', 'beutiful'], 'normal'],
    ['separate', ['seperate', 'separete', 'seperete'], 'hard'],
    ['definitely', ['definately', 'definatly', 'defanitely'], 'hard'],
    ['rhythm', ['rythm', 'rhythym', 'rhytm'], 'hard'],
    ['embarrass', ['embarass', 'embarras', 'embaress'], 'hard'],
    ['calendar', ['calender', 'calandar', 'callendar'], 'hard'],
    ['accommodate', ['accomodate', 'acommodate', 'acomodate'], 'xhard'],
    ['occurrence', ['occurence', 'ocurrence', 'occurrance'], 'xhard'],
    ['conscience', ['concience', 'consciense', 'conscence'], 'xhard'],
    ['millennium', ['millenium', 'milennium', 'milenium'], 'xhard'],
    ['privilege', ['priviledge', 'privelege', 'privilige'], 'xhard'],
  ];

  // [shape, sides, difficulty] — hexagon and dodecagon are hand-written
  const SHAPES = [
    ['triangle', 3, 'easy'], ['pentagon', 5, 'easy'], ['octagon', 8, 'normal'],
    ['decagon', 10, 'normal'], ['heptagon', 7, 'hard'], ['nonagon', 9, 'hard'],
  ];

  // [question, answer, three wrong, difficulty, why]
  const MEASURES = [
    ['How many days are there in a week?', '7', ['5', '6', '8'], 'easy', 'Monday to Sunday makes 7 days.'],
    ['How many months are there in a year?', '12', ['10', '11', '13'], 'easy', 'January to December makes 12 months.'],
    ['How many hours are there in a day?', '24', ['12', '20', '30'], 'easy', 'A day is 24 hours: 12 from midnight to noon, and 12 more back to midnight.'],
    ['How many minutes are there in an hour?', '60', ['30', '50', '100'], 'easy', 'An hour is 60 minutes, and a minute is 60 seconds.'],
    ['How many seconds are there in a minute?', '60', ['30', '50', '100'], 'easy', 'A minute is 60 seconds.'],
    ['How many days are there in a fortnight?', '14', ['10', '12', '15'], 'normal', 'A fortnight is two weeks — “fourteen nights”.'],
    ['How many years are there in a decade?', '10', ['5', '12', '100'], 'normal', '“Deca” means ten, so a decade is 10 years.'],
    ['How many years are there in a century?', '100', ['10', '50', '1,000'], 'normal', 'A century is 100 years, like a century in cricket is 100 runs.'],
    ['How many days are there in September?', '30', ['28', '29', '31'], 'normal', '“Thirty days hath September, April, June and November.”'],
    ['How many weeks are there in a year?', '52', ['48', '50', '56'], 'normal', '52 weeks × 7 days = 364 days, plus one or two left over.'],
    ['How many centimetres are there in a metre?', '100', ['10', '50', '1,000'], 'normal', '“Centi” means a hundredth, so there are 100 centimetres in a metre.'],
    ['How many grams are there in a kilogram?', '1,000', ['10', '100', '500'], 'normal', '“Kilo” means a thousand, so a kilogram is 1,000 grams.'],
    ['How many years are there in a millennium?', '1,000', ['100', '500', '10,000'], 'hard', '“Mille” is Latin for a thousand.'],
    ['How many metres are there in a kilometre?', '1,000', ['100', '500', '10,000'], 'hard', '“Kilo” means a thousand, so a kilometre is 1,000 metres.'],
    ['How many millilitres are there in a litre?', '1,000', ['10', '100', '500'], 'hard', '“Milli” means a thousandth, so 1,000 millilitres make a litre.'],
    ['How many seconds are there in an hour?', '3,600', ['360', '600', '6,000'], 'hard', '60 seconds × 60 minutes = 3,600 seconds.'],
    ['How many hours are there in a week?', '168', ['148', '172', '186'], 'hard', '24 hours × 7 days = 168 hours.'],
    ['How many days does February have in a leap year?', '29', ['28', '30', '31'], 'hard', 'Leap years add a 29th of February, every four years or so.'],
    ['How many seconds are there in a day?', '86,400', ['36,000', '84,600', '864,000'], 'xhard', '60 × 60 × 24 = 86,400 seconds.'],
    ['How many minutes are there in a week?', '10,080', ['1,680', '8,640', '10,800'], 'xhard', '60 minutes × 24 hours × 7 days = 10,080 minutes.'],
  ];

  /* ───────── turning tables into questions ───────── */

  function build() {
    const out = [];
    const add = (id, difficulty, category, q, correct, wrong, why) => {
      out.push({ id, difficulty, category, q, answers: [correct].concat(wrong), why });
    };
    const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    CAPITALS.forEach(([country, capital, cities, diff], i) => {
      const s = slug(country.replace(/^the /, ''));
      const Country = country.replace(/^the /, 'The ');
      add('cap-' + s, diff, 'geography', 'What is the capital of ' + country + '?', capital, cities,
        capital + ' is the capital of ' + country + '. ' + cities[0] + ' is another city there.');
      const rand = rng(hash('capr-' + s));
      // the other way round: other countries from the same part of the world
      const near = CAPITALS.filter((c, j) => j !== i && regionOf(c[0]) === regionOf(country)).map((c) => c[0].replace(/^the /, 'The '));
      add('capr-' + s, diff, 'geography', capital + ' is the capital of which country?', Country,
        wrongs(Country, near, rand), capital + ' is the capital of ' + country + '.');
    });

    ELEMENTS.forEach(([sym, name, num, wrongSyms, diff]) => {
      const s = slug(name);
      const latin = LATIN[sym] ? ' It comes from “' + LATIN[sym] + '”, its old Latin name.' : '';
      if (!ELEMENT_SYMBOLS_DONE.includes(sym)) {
        add('el-' + s, diff, 'science', 'What is the chemical symbol for ' + name.toLowerCase() + '?', sym, wrongSyms,
          'The symbol for ' + name.toLowerCase() + ' is ' + sym + '.' + latin);
      }
      const rand = rng(hash('elr-' + s));
      const firstLetter = ELEMENTS.filter((e) => e[1] !== name && e[1][0] === sym[0]).map((e) => e[1]);
      const rest = ELEMENTS.filter((e) => e[1] !== name).map((e) => e[1]);
      const names = wrongs(name, firstLetter, rand);
      while (names.length < 3) names.push(...wrongs(name, rest.filter((n) => !names.includes(n)), rand).slice(0, 3 - names.length));
      add('elr-' + s, diff, 'science', 'Which element has the symbol ' + sym + '?', name, names,
        sym + ' is the symbol for ' + name.toLowerCase() + '.' + latin);
    });
    // atomic numbers, for the small ones only
    ELEMENTS.filter((e) => [2, 3, 6, 7, 8].includes(e[2])).forEach(([sym, name, num]) => {
      const near = ELEMENTS.filter((e) => e[1] !== name && Math.abs(e[2] - num) <= 6).map((e) => e[1]);
      add('eln-' + num, 'xhard', 'science', 'Which element is number ' + num + ' on the periodic table?', name,
        wrongs(name, near, rng(hash('eln-' + num))), name + ' is element number ' + num + ': each of its atoms has ' + num + ' protons.');
    });

    PLANETS.forEach((planet, i) => {
      add('planet-' + (i + 1), PLANET_DIFF[i], 'space', 'Which planet is ' + ORDINAL[i] + ' from the Sun?', planet,
        wrongs(planet, PLANETS.filter((p, j) => Math.abs(j - i) <= 3), rng(hash('planet-' + i))),
        'In order from the Sun: Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, Neptune.');
    });

    BABIES.forEach(([animal, baby, diff]) => {
      const others = BABIES.filter((b) => b[1] !== baby).map((b) => b[1]);
      add('baby-' + slug(animal), diff, 'nature', 'What is a baby ' + animal + ' called?', cap(baby),
        wrongs(baby, others, rng(hash('baby-' + animal))).map(cap), 'A baby ' + animal + ' is called a ' + baby + '.');
    });

    GROUPS.forEach(([animals, word, wrong, diff]) => {
      add('group-' + slug(animals), diff, 'nature', 'What is a group of ' + animals + ' called?', cap(word), wrong.map(cap),
        'A group of ' + animals + ' is called ' + word + '.');
    });

    KINDS.forEach(([animal, kind, diff, why]) => {
      add('kind-' + slug(animal), diff, 'nature', 'What kind of animal is ' + animal + '?', kind,
        wrongs(kind, CLASSES, rng(hash('kind-' + animal))), why);
    });

    PLURALS.forEach(([word, plural, wrong, diff]) => {
      add('plural-' + word, diff, 'words', 'What is the plural of “' + word + '”?', plural, wrong,
        'One ' + word + ', two ' + plural + '.');
    });

    OPPOSITES.forEach(([word, opp, wrong, diff]) => {
      add('opp-' + word, diff, 'words', 'What is the opposite of “' + word + '”?', cap(opp), wrong.map(cap),
        'The opposite of “' + word + '” is “' + opp + '”. The others mean something close to “' + word + '” or nothing like it.');
    });

    SPELLINGS.forEach(([word, wrong, diff]) => {
      add('spell-' + word, diff, 'words', 'Which of these is spelled correctly?', word, wrong,
        '“' + word + '” is the right spelling — it’s one people often get wrong.');
    });

    SHAPES.forEach(([shape, sides, diff]) => {
      add('shape-' + shape, diff, 'maths', 'How many sides does a ' + shape + ' have?', String(sides),
        [sides - 1, sides + 1, sides + 2].map(String), 'A ' + shape + ' has ' + sides + ' sides.');
    });

    MEASURES.forEach(([q, a, wrong, diff, why]) => {
      add('measure-' + slug(q).slice(9, 60), diff, 'general', q, a, wrong, why);
    });

    return out;
  }

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  /* ───────── generators ───────── */

  function roman(n) {
    const map = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
      [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
    let out = '';
    map.forEach(([v, s]) => { while (n >= v) { out += s; n -= v; } });
    return out;
  }

  function isPrime(n) {
    if (n < 2) return false;
    for (let i = 2; i * i <= n; i++) if (n % i === 0) return false;
    return true;
  }

  // Plausible wrong numbers: near misses and the usual slips, all positive,
  // all different from the answer and each other.
  function nearMisses(answer, rand, extra) {
    const c = (extra || []).concat([answer + 1, answer - 1, answer + 2, answer - 2, answer + 10, answer - 10,
      answer + int(rand, 3, 9), answer - int(rand, 3, 9), answer + 3, answer + 4, answer + 5]);
    return wrongs(answer, c.filter((n) => n > 0 && Number.isInteger(n)), rand).map(fmt);
  }

  // Each generator: (rand) → { q, answer, wrong, why }. Names carry their
  // difficulty so a reference says everything needed to rebuild it.
  const GENERATORS = {
    add20: { difficulty: 'easy', make(r) {
      const a = int(r, 3, 15), b = int(r, 2, 12), s = a + b;
      return { q: 'What is ' + a + ' + ' + b + '?', a: s, w: nearMisses(s, r), why: a + ' + ' + b + ' = ' + s + '.' };
    } },
    sub20: { difficulty: 'easy', make(r) {
      const a = int(r, 8, 20), b = int(r, 2, a - 2), d = a - b;
      return { q: 'What is ' + a + ' − ' + b + '?', a: d, w: nearMisses(d, r, [a + b]), why: a + ' − ' + b + ' = ' + d + '.' };
    } },
    times5: { difficulty: 'easy', make(r) {
      const a = int(r, 2, 5), b = int(r, 2, 10), p = a * b;
      return { q: 'What is ' + a + ' × ' + b + '?', a: p, w: nearMisses(p, r, [a + b, p + a, p - b]), why: a + ' × ' + b + ' = ' + p + '.' };
    } },
    half: { difficulty: 'easy', make(r) {
      const h = int(r, 4, 40), n = h * 2;
      return { q: 'What is half of ' + n + '?', a: h, w: nearMisses(h, r, [n, h * 3]), why: 'Half of ' + n + ' is ' + h + ', because ' + h + ' + ' + h + ' = ' + n + '.' };
    } },
    times12: { difficulty: 'normal', make(r) {
      const a = int(r, 6, 12), b = int(r, 6, 12), p = a * b;
      return { q: 'What is ' + a + ' × ' + b + '?', a: p, w: nearMisses(p, r, [p + a, p - a, p + b, p - b]), why: a + ' × ' + b + ' = ' + p + '.' };
    } },
    divide: { difficulty: 'normal', make(r) {
      const b = int(r, 3, 12), q = int(r, 3, 12), a = b * q;
      return { q: 'What is ' + a + ' ÷ ' + b + '?', a: q, w: nearMisses(q, r, [q + b]), why: a + ' ÷ ' + b + ' = ' + q + ', because ' + b + ' × ' + q + ' = ' + a + '.' };
    } },
    percent: { difficulty: 'normal', make(r) {
      const pc = pick(r, [10, 25, 50]), n = int(r, 2, 20) * 20, v = n * pc / 100;
      return { q: 'What is ' + pc + '% of ' + n + '?', a: v, w: nearMisses(v, r, [v * 2, Math.round(v / 2)]), why: pc + '% of ' + n + ' is ' + v + '.' };
    } },
    square: { difficulty: 'normal', make(r) {
      const n = int(r, 4, 12), s = n * n;
      return { q: 'What is ' + n + ' squared?', a: s, w: nearMisses(s, r, [n * 2, s + n, s - n]), why: n + ' squared means ' + n + ' × ' + n + ', which is ' + s + '.' };
    } },
    add100: { difficulty: 'normal', make(r) {
      const a = int(r, 23, 78), b = int(r, 14, 69), s = a + b;
      return { q: 'What is ' + a + ' + ' + b + '?', a: s, w: nearMisses(s, r, [s - 10, s + 10]), why: a + ' + ' + b + ' = ' + s + '.' };
    } },
    times1d: { difficulty: 'hard', make(r) {
      const a = int(r, 13, 29), b = int(r, 3, 9), p = a * b;
      return { q: 'What is ' + a + ' × ' + b + '?', a: p, w: nearMisses(p, r, [p + b, p - b, p + 10]), why: a + ' × ' + b + ' = ' + p + '.' };
    } },
    root: { difficulty: 'hard', make(r) {
      const n = int(r, 11, 20), s = n * n;
      return { q: 'What is the square root of ' + fmt(s) + '?', a: n, w: nearMisses(n, r), why: n + ' × ' + n + ' = ' + s + ', so the square root of ' + s + ' is ' + n + '.' };
    } },
    percent2: { difficulty: 'hard', make(r) {
      const pc = pick(r, [15, 20, 30, 75]), n = int(r, 2, 15) * 20, v = n * pc / 100;
      return { q: 'What is ' + pc + '% of ' + n + '?', a: v, w: nearMisses(v, r, [Math.round(v * 1.5), Math.round(v / 2)]), why: pc + '% of ' + n + ' is ' + v + '.' };
    } },
    fraction: { difficulty: 'hard', make(r) {
      const [top, bot] = pick(r, [[3, 4], [2, 3], [3, 5], [2, 5], [5, 6]]), n = bot * int(r, 4, 20), v = n / bot * top;
      return { q: 'What is ' + top + '/' + bot + ' of ' + n + '?', a: v, w: nearMisses(v, r, [n / bot]), why: n + ' ÷ ' + bot + ' = ' + (n / bot) + ', and × ' + top + ' = ' + v + '.' };
    } },
    order: { difficulty: 'hard', make(r) {
      const a = int(r, 2, 12), b = int(r, 2, 9), c = int(r, 2, 9), v = a + b * c;
      return { q: 'What is ' + a + ' + ' + b + ' × ' + c + '?', a: v, w: nearMisses(v, r, [(a + b) * c]), why: 'Multiply first: ' + b + ' × ' + c + ' = ' + (b * c) + ', then add ' + a + ' to get ' + v + '.' };
    } },
    times2d: { difficulty: 'xhard', make(r) {
      const a = int(r, 12, 39), b = int(r, 12, 29), p = a * b;
      return { q: 'What is ' + a + ' × ' + b + '?', a: p, w: nearMisses(p, r, [p + 10, p - 10, p + a, p - b]), why: a + ' × ' + b + ' = ' + fmt(p) + '.' };
    } },
    cube: { difficulty: 'xhard', make(r) {
      const n = int(r, 3, 10), c = n * n * n;
      return { q: 'What is ' + n + ' cubed?', a: c, w: nearMisses(c, r, [n * n, n * 3]), why: n + ' cubed is ' + n + ' × ' + n + ' × ' + n + ' = ' + fmt(c) + '.' };
    } },
    power2: { difficulty: 'xhard', make(r) {
      const n = int(r, 5, 12), v = Math.pow(2, n);
      return { q: 'What is 2 to the power of ' + n + '?', a: v, w: nearMisses(v, r, [v / 2, v * 2, 2 * n]), why: 'Doubling 2 again and again, ' + n + ' twos multiplied together make ' + fmt(v) + '.' };
    } },
    prime: { difficulty: 'xhard', make(r) {
      let n = int(r, 30, 180); while (isPrime(n)) n++;
      let p = n + 1; while (!isPrime(p)) p++;
      const odd = []; for (let k = n + 1; odd.length < 6; k++) if (!isPrime(k) && k % 2 === 1) odd.push(k);
      return { q: 'What is the next prime number after ' + n + '?', a: p, w: wrongs(p, odd, r).map(fmt), why: 'The next number with no factors except 1 and itself is ' + p + '.' };
    } },
    brackets: { difficulty: 'xhard', make(r) {
      const a = int(r, 3, 15), b = int(r, 2, 9), c = int(r, 3, 8), d = int(r, 2, Math.min(20, (a + b) * c - 6)), v = (a + b) * c - d;
      return { q: 'What is (' + a + ' + ' + b + ') × ' + c + ' − ' + d + '?', a: v, w: nearMisses(v, r, [a + b * c - d, (a + b) * (c - d) > 0 ? (a + b) * (c - d) : v + 3]), why: 'Brackets first: ' + a + ' + ' + b + ' = ' + (a + b) + ', × ' + c + ' = ' + ((a + b) * c) + ', − ' + d + ' = ' + v + '.' };
    } },
    roman: { difficulty: 'normal', make(r) {
      const n = int(r, 4, 20);
      return { q: 'What number is ' + roman(n) + ' in Roman numerals?', a: n, w: nearMisses(n, r), why: roman(n) + ' is ' + n + '.' };
    } },
    roman2: { difficulty: 'hard', make(r) {
      const n = int(r, 21, 99), s = roman(n);
      return { q: 'How do you write ' + n + ' in Roman numerals?', a: s, w: wrongs(s, [n - 1, n + 1, n + 10, n - 10, n + 5].filter((x) => x > 0).map(roman), r), why: n + ' is ' + s + ' in Roman numerals.', text: true };
    } },
    roman3: { difficulty: 'xhard', make(r) {
      const n = int(r, 1066, 2030);
      return { q: 'What year is ' + roman(n) + ' in Roman numerals?', a: n, w: wrongs(n, [n - 1, n + 1, n - 10, n + 10, n + 100, n - 100], r).map(String), why: roman(n) + ' is ' + n + '.', plain: true };
    } },
  };

  function generate(kind, seed) {
    const g = GENERATORS[kind];
    if (!g) return null;
    const made = g.make(rng(hash(kind + ':' + seed)));
    const show = (v) => (made.text || typeof v === 'string' ? v : made.plain ? String(v) : fmt(v));
    return {
      id: 'g:' + kind + ':' + seed,
      difficulty: g.difficulty,
      category: 'maths',
      q: made.q,
      answers: [show(made.a)].concat(made.w),
      why: made.why,
      generated: true,
    };
  }

  function generatorsFor(difficulty) {
    return Object.keys(GENERATORS).filter((k) => GENERATORS[k].difficulty === difficulty);
  }

  /* ───────── the assembled bank ───────── */

  const HAND = root.QUESTIONS || [];
  const STATIC = HAND.concat(build());
  const BY_ID = new Map(STATIC.map((q) => [q.id, q]));

  function get(ref) {
    if (ref.startsWith('g:')) {
      const [, kind, seed] = ref.split(':');
      return generate(kind, Number(seed));
    }
    return BY_ID.get(ref) || null;
  }

  root.Bank = { rng, hash, statics: STATIC, get, generate, generatorsFor, GENERATORS };
})(typeof window !== 'undefined' ? window : globalThis);
